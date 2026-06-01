using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Plugin.InfoPopup.DTOs;
using Jellyfin.Plugin.InfoPopup.Models;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Controllers;

/// <summary>
/// Base abstraite partagée par tous les contrôleurs REST du plugin (v4.1.1.0).
/// Centralise :
///   • L'injection de toutes les dépendances services (un seul endroit à toucher si
///     un nouveau store/service est ajouté).
///   • Les helpers transverses : <see cref="GetUserId"/>, <see cref="IsAdminAsync"/>,
///     <see cref="IsValidId"/>, <see cref="IsOwner"/>, <see cref="ResolveUserName"/>, etc.
///   • Les caches per-request (<see cref="_userNameCache"/>, <see cref="_permCache"/>,
///     <see cref="_repliesByMessage"/>) — fonctionnent naturellement car ASP.NET Core
///     instancie un contrôleur par requête HTTP, donc ces dictionnaires ont une portée
///     de vie limitée à un seul appel.
///   • Le mapping POCO → DTO (<see cref="ToSummary"/>, <see cref="ToDetail"/>, …)
///     qui dépend des caches d'IDs/noms.
/// </summary>
/// <remarks>
/// Pourquoi cette base existe : l'ancien <c>InfoPopupController</c> faisait 1400 lignes
/// pour 30 endpoints. Le split en 4 contrôleurs (<see cref="MessagesController"/>,
/// <see cref="RepliesController"/>, <see cref="PermissionsController"/>,
/// <see cref="SettingsController"/>) rend chaque fichier lisible (~300 lignes), évite
/// les conflits git triviaux quand plusieurs zones bougent en parallèle, et facilite
/// les futurs ajouts par groupe fonctionnel. Tous les contrôleurs partagent le préfixe
/// de route <c>/InfoPopup</c> via <c>[Route("InfoPopup")]</c> sur chaque classe concrète.
/// </remarks>
public abstract class InfoPopupControllerBase : ControllerBase
{
    /// <summary>Store des messages popup (XML).</summary>
    protected readonly MessageStore _store;

    /// <summary>Tracker des vues utilisateur (JSON).</summary>
    protected readonly SeenTrackerService _seen;

    /// <summary>Store des réponses (JSON).</summary>
    protected readonly ReplyStoreService _replyStore;

    /// <summary>Store des permissions per-user (JSON).</summary>
    protected readonly PermissionService _permService;

    /// <summary>Manager utilisateur Jellyfin (utilisé pour <c>GetUserById</c>, API stable).</summary>
    protected readonly IUserManager _userManager;

    /// <summary>Frontière multi-target pour les APIs Jellyfin instables (cf. <see cref="IJellyfinCompat"/>).</summary>
    protected readonly IJellyfinCompat _compat;

    /// <summary>Logger.</summary>
    protected readonly ILogger _logger;

    /// <summary>Service d'autorisation ASP.NET Core (policy <c>RequiresElevation</c> pour admin).</summary>
    protected readonly IAuthorizationService _authorizationService;

    /// <summary>Constructeur DI partagé.</summary>
    protected InfoPopupControllerBase(
        MessageStore store,
        SeenTrackerService seen,
        ReplyStoreService replyStore,
        PermissionService permService,
        IUserManager userManager,
        IJellyfinCompat compat,
        ILogger logger,
        IAuthorizationService authorizationService)
    {
        _store = store;
        _seen = seen;
        _replyStore = replyStore;
        _permService = permService;
        _userManager = userManager;
        _compat = compat;
        _logger = logger;
        _authorizationService = authorizationService;
    }

    // ── Helpers transverses ──────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne l'ID de l'utilisateur connecté, ou null si absent/vide.
    /// Un retour null doit conduire à un 401 explicite côté appelant (R10).
    /// </summary>
    protected string? GetUserId()
    {
        var id = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value;
        return string.IsNullOrEmpty(id) ? null : id;
    }

    /// <summary>Vérifie si l'utilisateur courant est administrateur via la policy Jellyfin.</summary>
    protected async Task<bool> IsAdminAsync() =>
        (await _authorizationService.AuthorizeAsync(User, "RequiresElevation")).Succeeded;

    /// <summary>Vérifie qu'un identifiant de route est un GUID valide et non vide.</summary>
    protected static bool IsValidId(string? id) =>
        !string.IsNullOrWhiteSpace(id) && Guid.TryParse(id, out _);

    /// <summary>
    /// Vérifie que tous les éléments d'une liste d'IDs utilisateurs sont des GUIDs valides.
    /// Retourne false si la liste contient au moins un ID invalide.
    /// </summary>
    protected static bool AreValidUserIds(IEnumerable<string> ids) =>
        ids.All(uid => !string.IsNullOrWhiteSpace(uid) && Guid.TryParse(uid, out _));

    /// <summary>
    /// Compare deux IDs utilisateurs en normalisant les formats (sécurité v3.8.2.0).
    /// Cf. <see cref="PermissionService.NormalizeUserId"/> et [[guid-format-userid]] :
    /// les claims Jellyfin renvoient le format "N" (sans tirets), <c>User.Id.ToString()</c>
    /// renvoie le format "D" (avec tirets). Comparer brut casse l'ownership.
    /// </summary>
    protected static bool IsOwner(string? sentByUserId, string? userId) =>
        PermissionService.NormalizeUserId(sentByUserId) == PermissionService.NormalizeUserId(userId);

    /// <summary>
    /// Cache de noms d'utilisateurs au scope de la requête (v3.8.4.0).
    /// Le contrôleur est scoped par requête → ce dictionnaire vit le temps d'un appel HTTP.
    /// Évite les <c>_userManager.GetUserById(Guid.Parse(...))</c> répétés quand une même méthode
    /// itère sur N messages/réponses/permissions et résout les mêmes IDs plusieurs fois.
    /// </summary>
    private readonly Dictionary<string, string> _userNameCache = new();

    /// <summary>Résout le nom d'utilisateur à partir de son ID Jellyfin (caché par requête).</summary>
    protected string ResolveUserName(string? userId)
    {
        if (string.IsNullOrEmpty(userId)) return string.Empty;
        if (_userNameCache.TryGetValue(userId, out var cached)) return cached;
        string name;
        try
        {
            var user = _userManager.GetUserById(Guid.Parse(userId));
            name = user?.Username ?? string.Empty;
        }
        catch (Exception ex)
        {
            // v4.1.1.0 : log le contexte plutôt que swallow silencieusement.
            // Cas typiques attendus : Guid.Parse sur ID malformé en base, user supprimé
            // entre 2 reads. On garde le fallback (name = empty) pour ne pas bloquer
            // l'enumeration sur un seul user fantôme.
            _logger.LogDebug(ex, "InfoPopup: ResolveUserName failed for userId='{UserId}'", userId);
            name = string.Empty;
        }
        _userNameCache[userId] = name;
        return name;
    }

    /// <summary>
    /// Cache de permissions au scope de la requête (v3.8.4.0).
    /// <c>_permService.GetOrDefault(id)</c> acquiert un read-lock sur le store et fait une recherche
    /// linéaire. Quand on calcule N badges de rôle sur N messages, on évite ainsi N×log/scan
    /// pour les mêmes auteurs.
    /// </summary>
    private readonly Dictionary<string, UserPermission> _permCache = new();

    /// <summary>Récupère la permission d'un utilisateur via cache per-request.</summary>
    protected UserPermission GetPermCached(string userId)
    {
        if (_permCache.TryGetValue(userId, out var cached)) return cached;
        var p = _permService.GetOrDefault(userId);
        _permCache[userId] = p;
        return p;
    }

    /// <summary>
    /// Cache des réponses groupées par MessageId au scope de la requête (v3.8.4.0).
    /// Évite que <see cref="ToDetailForUser"/> appelle <c>_replyStore.GetByMessageId(m.Id)</c>
    /// pour chaque message — chaque appel acquiert un read-lock et fait un scan O(R). Pour N
    /// messages × R réponses, c'est O(N·R) sous lock répété. Avec ce cache, c'est O(R) une
    /// seule fois (préchargé par <see cref="PreloadRepliesByMessage"/>).
    /// </summary>
    private Dictionary<string, List<MessageReply>>? _repliesByMessage;

    /// <summary>Précharge le cache des réponses (une seule fois par requête).</summary>
    protected void PreloadRepliesByMessage()
    {
        if (_repliesByMessage is not null) return;
        var all = _replyStore.GetAll();  // single read-lock, single pass
        _repliesByMessage = new Dictionary<string, List<MessageReply>>(all.Count);
        foreach (var r in all)
        {
            if (!_repliesByMessage.TryGetValue(r.MessageId, out var list))
            {
                list = new List<MessageReply>();
                _repliesByMessage[r.MessageId] = list;
            }
            list.Add(r);
        }
    }

    /// <summary>Récupère les réponses d'un message, depuis cache si préchargé sinon via le store.</summary>
    protected List<MessageReply> GetRepliesForMessage(string messageId)
    {
        if (_repliesByMessage is null) return _replyStore.GetByMessageId(messageId);
        return _repliesByMessage.TryGetValue(messageId, out var list) ? list : new List<MessageReply>();
    }

    // ── Mappers POCO → DTO ───────────────────────────────────────────────────────────

    /// <summary>Mappe un <see cref="PopupMessage"/> vers <see cref="MessageSummary"/>.</summary>
    protected MessageSummary ToSummary(PopupMessage m) => new()
    {
        Id = m.Id,
        Title = m.Title,
        PublishedAt = m.PublishedAt,
        TargetUserIds = m.TargetUserIds,
        SentByUserId = m.SentByUserId,
        SentByUserName = ResolveUserName(m.SentByUserId),
        IsDeleted = m.IsDeleted,
        DeletedAt = m.DeletedAt
    };

    /// <summary>Mappe un <see cref="PopupMessage"/> vers <see cref="MessageDetail"/> (avec body).</summary>
    protected MessageDetail ToDetail(PopupMessage m) => new()
    {
        Id = m.Id,
        Title = m.Title,
        Body = m.Body,
        PublishedAt = m.PublishedAt,
        SentByUserId = m.SentByUserId,
        SentByUserName = ResolveUserName(m.SentByUserId),
        IsDeleted = m.IsDeleted,
        EditHistoryCount = m.EditHistory.Count,
        SenderRole = ComputeSenderRole(m)
    };

    /// <summary>
    /// Détermine le rôle effectif de l'expéditeur d'un message pour le badge client (v3.8.3.0).
    /// Priorités : <c>IsSentByAdmin</c> (admin) → permission stockée Role == "moderator" ou
    /// (CanEditOthers AND CanDeleteOthers) → "user" sinon.
    /// </summary>
    protected string ComputeSenderRole(PopupMessage m)
    {
        if (m.IsSentByAdmin) return "admin";
        if (string.IsNullOrEmpty(m.SentByUserId)) return "system";
        try
        {
            var perm = GetPermCached(m.SentByUserId);
            if (perm.Role == "moderator") return "moderator";
            if (perm.CanEditOthersMessages && perm.CanDeleteOthersMessages) return "moderator";
        }
        catch (Exception ex)
        {
            // v4.1.1.0 : log le contexte. Cas typiques : entrée corrompue dans
            // infopopup_permissions.json, désérialisation qui échoue. Fallback "user"
            // est cohérent avec le défaut le plus restrictif.
            _logger.LogDebug(ex, "InfoPopup: ComputeSenderRole failed for SentByUserId='{UserId}', defaulting to 'user'", m.SentByUserId);
        }
        return "user";
    }

    /// <summary>
    /// Variante contextuelle de <see cref="ToDetail"/> qui populate les champs
    /// <c>MyReply</c> (la propre réponse de <paramref name="currentUserId"/> à ce message,
    /// quand il n'en est PAS l'expéditeur) et <c>Replies</c> (toutes les réponses reçues,
    /// quand il EST l'expéditeur). Évite les allers-retours pour l'affichage des réponses
    /// dans l'onglet « Mes messages ».
    /// </summary>
    protected MessageDetail ToDetailForUser(PopupMessage m, string currentUserId)
    {
        var d = ToDetail(m);
        // Cache batch — chargé une seule fois par requête, partagé entre toutes les itérations.
        var replies = GetRepliesForMessage(m.Id);
        if (IsOwner(m.SentByUserId, currentUserId))
        {
            // L'utilisateur est l'expéditeur : on inclut TOUTES les réponses reçues.
            d.Replies = replies.OrderBy(r => r.RepliedAt).Select(ToReplyDto).ToList();
        }
        else
        {
            // L'utilisateur est destinataire : on inclut UNIQUEMENT sa propre réponse, si elle existe.
            var normalized = PermissionService.NormalizeUserId(currentUserId);
            var own = replies.FirstOrDefault(r => PermissionService.NormalizeUserId(r.UserId) == normalized);
            if (own is not null) d.MyReply = ToReplyDto(own);
        }
        return d;
    }

    /// <summary>
    /// Construit un UserPermissionDto depuis un UserPermission, en résolvant le nom d'utilisateur.
    /// Optim v3.8.4.0 : <paramref name="precomputedName"/> court-circuite la résolution si déjà connue
    /// (cas de <c>GetAllPermissions</c> où <c>EnumerateUsers</c> vient déjà de fournir le nom).
    /// </summary>
    protected UserPermissionDto ToPermissionDto(UserPermission p, string? precomputedName = null)
    {
        string userName;
        if (!string.IsNullOrEmpty(precomputedName))
        {
            userName = precomputedName;
        }
        else
        {
            var resolved = ResolveUserName(p.UserId);
            userName = !string.IsNullOrEmpty(resolved)
                ? resolved
                : p.UserId[..Math.Min(8, p.UserId.Length)] + "…";
        }
        return new UserPermissionDto
        {
            UserId = p.UserId,
            UserName = userName,
            CanSendMessages = p.CanSendMessages,
            CanReply = p.CanReply,
            CanEditOwnMessages = p.CanEditOwnMessages,
            CanDeleteOwnMessages = p.CanDeleteOwnMessages,
            CanEditOthersMessages = p.CanEditOthersMessages,
            CanDeleteOthersMessages = p.CanDeleteOthersMessages,
            MaxMessagesPerDay = p.MaxMessagesPerDay,
            MaxRepliesPerDay = p.MaxRepliesPerDay,
            Role = p.Role
        };
    }

    /// <summary>Mappe un <see cref="MessageReply"/> vers <see cref="ReplyDto"/>.</summary>
    protected ReplyDto ToReplyDto(MessageReply r)
    {
        string userName;
        try
        {
            var user = _userManager.GetUserById(Guid.Parse(r.UserId));
            userName = user?.Username ?? r.UserId[..Math.Min(8, r.UserId.Length)] + "…";
        }
        catch (Exception ex)
        {
            // v4.1.1.0 : log au niveau Debug ; même rationnel que ResolveUserName.
            _logger.LogDebug(ex, "InfoPopup: ToReplyDto user resolution failed for r.UserId='{UserId}'", r.UserId);
            userName = r.UserId[..Math.Min(8, r.UserId.Length)] + "…";
        }
        return new ReplyDto
        {
            Id        = r.Id,
            MessageId = r.MessageId,
            UserId    = r.UserId,
            UserName  = userName,
            Body      = r.Body,
            RepliedAt = r.RepliedAt
        };
    }

    /// <summary>
    /// Énumère les utilisateurs Jellyfin via la frontière <see cref="IJellyfinCompat"/>
    /// (v4.1.0.0). Le pattern multi-target remplace la réflexion défensive d'avant 4.1 :
    /// chaque variant ZIP (<c>jf10.10</c> / <c>jf10.11</c>) embarque l'implémentation
    /// typée statiquement adaptée à sa branche Jellyfin.
    /// </summary>
    protected List<(string Id, string Name, bool IsAdmin)> EnumerateUsers()
    {
        try
        {
            return _compat.EnumerateUsers().ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "InfoPopup: échec de l'énumération des utilisateurs via IJellyfinCompat");
            return new List<(string, string, bool)>();
        }
    }
}
