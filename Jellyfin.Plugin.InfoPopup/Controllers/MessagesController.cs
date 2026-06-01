using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.InfoPopup.DTOs;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Controllers;

/// <summary>
/// Endpoints messages : CRUD, popup-data, accusés de lecture (v4.1.1.0 — extrait de l'ancien
/// <c>InfoPopupController</c>). Partage les helpers + caches per-request via
/// <see cref="InfoPopupControllerBase"/>.
/// </summary>
[ApiController]
[Route("InfoPopup")]
public class MessagesController : InfoPopupControllerBase
{
    /// <summary>Constructeur DI.</summary>
    public MessagesController(
        MessageStore store, SeenTrackerService seen, ReplyStoreService replyStore,
        PermissionService permService, IUserManager userManager, IJellyfinCompat compat,
        ILogger<MessagesController> logger, IAuthorizationService authorizationService)
        : base(store, seen, replyStore, permService, userManager, compat, logger, authorizationService) { }

    // GET /InfoPopup/messages ────────────────────────────────────────────────────────

    /// <summary>
    /// Liste des messages.
    /// Admins : tous les messages (pour la page de configuration).
    /// Utilisateurs : uniquement les messages qui leur sont destinés et non soft-deletés.
    /// </summary>
    [HttpGet("messages")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IEnumerable<MessageSummary>>> GetMessages(CancellationToken ct = default)
    {
        var all = _store.GetAll();
        ct.ThrowIfCancellationRequested();

        if (await IsAdminAsync())
        {
            // v3.8.6.0 : populer les stats « accusés de lecture » sur la vue admin en
            // un seul passage. Pour les messages à « Tous les utilisateurs », le total
            // des cibles = nombre total d'utilisateurs Jellyfin (résolu une seule fois
            // via EnumerateUsers). Le bulk lookup SeenTrackerService est aussi groupé.
            var seenByMsg = _seen.GetSeenUsersByMessage(all.Select(m => m.Id));
            var allUsers = EnumerateUsers();
            var totalUserCount = allUsers.Count;
            return Ok(all.Select(m =>
            {
                var s = ToSummary(m);
                s.TargetedCount = m.TargetUserIds.Count == 0
                    ? totalUserCount
                    : m.TargetUserIds.Count;
                if (!seenByMsg.TryGetValue(m.Id, out var seenSet))
                {
                    s.SeenCount = 0;
                }
                else if (m.TargetUserIds.Count == 0)
                {
                    // Tous-users : tous les lecteurs comptent (admin inclus).
                    s.SeenCount = seenSet.Count;
                }
                else
                {
                    // Ciblage explicite : n'intersecter qu'avec la liste de cible —
                    // un utilisateur hors-cible peut s'être marqué « seen » via un
                    // MarkSeen accidentel passé, on ne le compte pas.
                    var targetNorm = new HashSet<string>(
                        m.TargetUserIds.Select(PermissionService.NormalizeUserId));
                    var c = 0;
                    foreach (var uid in seenSet)
                        if (targetNorm.Contains(PermissionService.NormalizeUserId(uid))) c++;
                    s.SeenCount = c;
                }
                return s;
            }));
        }

        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        // v3.8.8.0 : même filtre self-sent que popup-data (cf. comment plus bas).
        return Ok(all
            .Where(m => !m.IsDeleted)
            .Where(m => !IsOwner(m.SentByUserId, userId))
            .Where(m => m.TargetUserIds.Count == 0 || m.TargetUserIds.Contains(userId))
            .Select(ToSummary));
    }

    // GET /InfoPopup/messages/{id}/views ── ADMIN ONLY ───────────────────────────────

    /// <summary>
    /// Retourne la liste détaillée des utilisateurs ayant / n'ayant pas vu un message,
    /// pour la vue admin des accusés de lecture (v3.8.6.0).
    /// Réservé aux administrateurs : ne pas exposer côté user qui d'autre a lu (privacy).
    /// </summary>
    [HttpGet("messages/{id}/views")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<MessageViewsDto> GetMessageViews([FromRoute] string id)
    {
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        // Bulk lookup d'un seul message — partagé avec la vue liste pour la cohérence.
        var seenMap = _seen.GetSeenUsersByMessage(new[] { id });
        var seenSet = seenMap.TryGetValue(id, out var s)
            ? new HashSet<string>(s.Select(PermissionService.NormalizeUserId))
            : new HashSet<string>();

        var allUsers = EnumerateUsers();
        // Détermine la liste cible (selon « Tous » vs ciblage explicite).
        IEnumerable<(string Id, string Name, bool IsAdmin)> targets;
        bool targetsAll = msg.TargetUserIds.Count == 0;
        if (targetsAll)
        {
            targets = allUsers;
        }
        else
        {
            var targetNorm = new HashSet<string>(
                msg.TargetUserIds.Select(PermissionService.NormalizeUserId));
            targets = allUsers.Where(u =>
                targetNorm.Contains(PermissionService.NormalizeUserId(u.Id)));
        }

        var seen = new List<MessageViewUserDto>();
        var unseen = new List<MessageViewUserDto>();
        foreach (var (uid, uname, isAdmin) in targets)
        {
            var dto = new MessageViewUserDto
            {
                UserId = uid,
                UserName = string.IsNullOrEmpty(uname) ? uid[..System.Math.Min(8, uid.Length)] + "…" : uname,
                IsAdmin = isAdmin
            };
            if (seenSet.Contains(PermissionService.NormalizeUserId(uid)))
                seen.Add(dto);
            else
                unseen.Add(dto);
        }

        return Ok(new MessageViewsDto
        {
            MessageId = msg.Id,
            MessageTitle = msg.Title,
            TargetsAllUsers = targetsAll,
            SeenUsers = seen.OrderBy(u => u.UserName).ToList(),
            UnseenUsers = unseen.OrderBy(u => u.UserName).ToList()
        });
    }

    // GET /InfoPopup/messages/{id} ───────────────────────────────────────────────────

    /// <summary>
    /// Détail complet d'un message (avec body).
    /// Admins : n'importe quel message.
    /// Utilisateurs : uniquement si ciblés par ce message et non soft-deleté.
    /// Retourne 404 (pas 403) pour ne pas révéler l'existence d'un message non ciblé.
    /// </summary>
    [HttpGet("messages/{id}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MessageDetail>> GetMessage([FromRoute] string id, CancellationToken ct = default)
    {
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        var isAdmin = await IsAdminAsync();

        if (!isAdmin)
        {
            var userId = GetUserId();
            if (userId is null) return Unauthorized();

            // Masquer les messages soft-deletés aux utilisateurs.
            if (msg.IsDeleted) return NotFound();

            // L'auteur du message peut toujours lire son propre message (utile pour la Sent tab).
            // 404 et non 403 : ne pas révéler l'existence d'un message non ciblé.
            if (msg.TargetUserIds.Count > 0 && !msg.TargetUserIds.Contains(userId) && !IsOwner(msg.SentByUserId, userId))
                return NotFound();

            // Non-admin : on retourne le détail contextuel (MyReply / Replies selon le rôle dans
            // la conversation), pour que l'UI puisse afficher la réponse de l'utilisateur ou les
            // réponses reçues sans un round-trip supplémentaire.
            return Ok(ToDetailForUser(msg, userId));
        }

        return Ok(ToDetail(msg));
    }

    // POST /InfoPopup/messages ────────────────────────────────────────────────────────

    /// <summary>
    /// Publie un nouveau message popup.
    /// Admins : toujours autorisés.
    /// Utilisateurs : nécessite CanSendMessages et respecter MaxMessagesPerDay.
    /// </summary>
    [HttpPost("messages")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<MessageDetail>> CreateMessage([FromBody] CreateMessageRequest request, CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        if (request.TargetUserIds.Count > 0 && !AreValidUserIds(request.TargetUserIds))
            return BadRequest(new { error = "Un ou plusieurs TargetUserIds ne sont pas des GUIDs valides." });

        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var isAdmin = await IsAdminAsync();

        // Pré-check de droit (CanSendMessages) hors lock pour retourner 403 vite.
        // Le quota journalier est appliqué ATOMIQUEMENT dans Create (sécurité v3.8.2.0)
        // pour éviter une race entre count check et insertion.
        var maxPerDay = 0;
        if (!isAdmin)
        {
            var perm = _permService.GetOrDefault(userId);
            if (!perm.CanSendMessages) return Forbid();
            maxPerDay = perm.MaxMessagesPerDay;
        }

        try
        {
            var msg = _store.Create(request.Title, request.Body, userId, request.TargetUserIds,
                isSentByAdmin: isAdmin, maxPerDayPerUser: maxPerDay);
            return CreatedAtAction(nameof(GetMessage), new { id = msg.Id }, ToDetail(msg));
        }
        catch (System.ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (System.InvalidOperationException ex) { return StatusCode(429, new { error = ex.Message }); }
    }

    // POST /InfoPopup/messages/delete ── ADMIN ONLY ──────────────────────────────────
    // Utilise POST plutôt que DELETE avec body : certains proxies et pare-feux ignorent
    // ou rejettent le body sur DELETE (comportement légal mais répandu en pratique).

    /// <summary>
    /// Supprime définitivement des messages. Réservé aux administrateurs.
    /// </summary>
    [HttpPost("messages/delete")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult DeleteMessages([FromBody] DeleteMessagesRequest request)
    {
        if (!ModelState.IsValid || request.Ids.Count == 0)
            return BadRequest(new { error = "Liste d'IDs vide ou invalide." });
        var deleted = _store.DeleteMany(request.Ids);
        _replyStore.DeleteByMessageIds(request.Ids);
        return Ok(new { deleted });
    }

    // PUT /InfoPopup/messages/{id} ────────────────────────────────────────────────────

    /// <summary>
    /// Met à jour le titre, le corps et le ciblage d'un message existant.
    /// Admins : peuvent modifier tout message.
    /// Utilisateurs : nécessite CanEditOwnMessages (message propre) ou CanEditOthersMessages.
    /// L'ID est conservé : les utilisateurs qui avaient déjà vu ce message ne le reverront pas.
    /// </summary>
    [HttpPut("messages/{id}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MessageDetail>> UpdateMessage([FromRoute] string id, [FromBody] UpdateMessageRequest request, CancellationToken ct = default)
    {
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        if (!ModelState.IsValid) return BadRequest(ModelState);

        if (request.TargetUserIds.Count > 0 && !AreValidUserIds(request.TargetUserIds))
            return BadRequest(new { error = "Un ou plusieurs TargetUserIds ne sont pas des GUIDs valides." });

        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var isAdmin = await IsAdminAsync();

        if (!isAdmin)
        {
            var msg0 = _store.GetById(id);
            if (msg0 is null) return NotFound(new { error = "Message introuvable." });

            var perm = _permService.GetOrDefault(userId);
            // Comparaison via IsOwner (NormalizeUserId) : durcissement défensif contre
            // les mismatches de format GUID ("D" vs "N"), sécurité v3.8.2.0.
            bool isOwner = IsOwner(msg0.SentByUserId, userId);
            if (isOwner && !perm.CanEditOwnMessages) return Forbid();
            if (!isOwner && !perm.CanEditOthersMessages) return Forbid();
        }

        try
        {
            // Update() retourne un snapshot capturé dans le lock : élimine la TOCTOU
            // qu'aurait causé un second appel à GetById() après Update().
            var updated = _store.Update(id, request.Title, request.Body, request.TargetUserIds, editedByUserId: userId!);
            if (updated is null) return NotFound(new { error = "Message introuvable." });
            return Ok(ToDetail(updated));
        }
        catch (System.ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // POST /InfoPopup/messages/{id}/soft-delete ────────────────────────────────────────

    /// <summary>
    /// Soft-delete d'un message par un utilisateur (ou admin).
    /// Le message reste en base mais est masqué pour tous les utilisateurs.
    /// Admins : peuvent soft-supprimer tout message.
    /// Utilisateurs : nécessite CanDeleteOwnMessages (message propre) ou CanDeleteOthersMessages.
    /// </summary>
    [HttpPost("messages/{id}/soft-delete")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> SoftDeleteMessage([FromRoute] string id, CancellationToken ct = default)
    {
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var isAdmin = await IsAdminAsync();
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        if (!isAdmin)
        {
            var perm = _permService.GetOrDefault(userId);
            bool isOwner = IsOwner(msg.SentByUserId, userId);
            if (isOwner && !perm.CanDeleteOwnMessages) return Forbid();
            if (!isOwner && !perm.CanDeleteOthersMessages) return Forbid();
        }

        var ok = _store.SoftDelete(id, userId!);
        return ok ? Ok() : NotFound();
    }

    // GET /InfoPopup/messages/sent ───────────────────────────────────────────────────

    /// <summary>
    /// Retourne les messages envoyés par l'utilisateur courant (toutes cibles confondues).
    /// </summary>
    [HttpGet("messages/sent")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<IEnumerable<MessageDetail>> GetSentMessages()
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        // ToDetailForUser : l'utilisateur est l'auteur, on inclut donc TOUTES les réponses
        // reçues sur chacun de ses messages (champ Replies) pour affichage inline dans Sent.
        // Bonus : évite le bug où /messages/{id} renvoyait 404 à l'auteur s'il n'était pas
        // dans TargetUserIds, ainsi que le round-trip pour récupérer les réponses.
        //
        // Optim v3.8.4.0 : préchargement des réponses en un seul scan → évite N appels
        // `_replyStore.GetByMessageId` (chacun sous read-lock + scan O(R)). Pour N messages
        // envoyés × R réponses : O(R) une seule fois au lieu de O(N·R).
        PreloadRepliesByMessage();
        var all = _store.GetAll();
        var sent = all.Where(m => m.SentByUserId == userId).Select(m => ToDetailForUser(m, userId)).ToList();
        return Ok(sent);
    }

    // GET /InfoPopup/popup-data ───────────────────────────────────────────────────────
    // Remplace le pattern N+1 précédent qui enchaînait :
    //   GET /unseen → N×GET /messages/{id} → GET /messages → M×GET /messages/{id}
    // par un seul appel retournant tout ce dont la popup a besoin.

    /// <summary>
    /// Données complètes pour la popup utilisateur en un seul appel API :
    /// messages non vus avec corps complet + historique en résumé (corps chargé au clic)
    /// + droits effectifs de l'utilisateur.
    /// Les messages soft-deletés sont exclus des résultats utilisateurs.
    /// </summary>
    [HttpGet("popup-data")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<PopupDataResponse>> GetPopupData(CancellationToken ct = default)
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var all = _store.GetAll();
        ct.ThrowIfCancellationRequested();
        // v3.8.8.0 : on exclut les messages que l'utilisateur s'est envoyés à lui-même
        // (typiquement quand un admin cible « Tous les utilisateurs ») — ils n'ont rien
        // à faire dans la vue « Reçus ». Comparaison via IsOwner (normalisation GUID).
        var targeted = all
            .Where(m => !m.IsDeleted)
            .Where(m => !IsOwner(m.SentByUserId, userId))
            .Where(m => m.TargetUserIds.Count == 0 || m.TargetUserIds.Contains(userId))
            .ToList();

        var unseenIds = new HashSet<string>(_seen.GetUnseenIds(userId, targeted.Select(m => m.Id)));

        // Construire les droits effectifs.
        // NB v4.0.3.0 : le toggle global `AllowReplies` est un MASTER-SWITCH qui
        // s'applique aussi aux admins (le endpoint /reply renvoie 403 pour admin
        // si global=off). Renvoyer CanReply=true ici pour admin afficherait le
        // formulaire de réponse dans la popup → l'admin clique « Envoyer » → 403
        // surprise. On répercute donc le master-switch côté admin.
        EffectivePermissionsDto perms;
        var cfgPerms = Plugin.Instance!.Configuration;
        if (await IsAdminAsync())
        {
            perms = new EffectivePermissionsDto
            {
                CanSendMessages = true,
                CanReply = cfgPerms.AllowReplies,
                CanEditOwnMessages = true,
                CanDeleteOwnMessages = true,
                CanEditOthersMessages = true,
                CanDeleteOthersMessages = true,
                IsAdmin = true
            };
        }
        else
        {
            var p = _permService.GetOrDefault(userId);
            perms = new EffectivePermissionsDto
            {
                CanSendMessages = p.CanSendMessages,
                CanReply = cfgPerms.AllowReplies && p.CanReply,
                CanEditOwnMessages = p.CanEditOwnMessages,
                CanDeleteOwnMessages = p.CanDeleteOwnMessages,
                CanEditOthersMessages = p.CanEditOthersMessages,
                CanDeleteOthersMessages = p.CanDeleteOthersMessages,
                IsAdmin = false
            };
        }

        // ToDetailForUser pour unseen ET history : permet d'afficher la propre réponse
        // de l'utilisateur (champ MyReply) ou — si jamais il est l'expéditeur d'un de ces
        // messages — les réponses reçues, directement dans l'inbox « Mes messages ».
        // Optim v3.8.4.0 : préchargement des réponses (cf. GetSentMessages).
        PreloadRepliesByMessage();
        return Ok(new PopupDataResponse
        {
            Unseen = targeted
                .Where(m => unseenIds.Contains(m.Id))
                .Select(m => ToDetailForUser(m, userId))
                .ToList(),
            History = targeted
                .Where(m => !unseenIds.Contains(m.Id))
                .Select(m => ToDetailForUser(m, userId))
                .ToList(),
            Permissions = perms
        });
    }

    // GET /InfoPopup/unseen ── (conservé pour compatibilité ascendante) ────────────────

    /// <summary>
    /// Messages non encore vus par l'utilisateur connecté, filtrés par ciblage.
    /// Conservé pour compatibilité. Préférer GET /InfoPopup/popup-data.
    /// </summary>
    [HttpGet("unseen")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<IEnumerable<MessageSummary>> GetUnseen()
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var all = _store.GetAll();
        // v3.8.8.0 : on exclut les messages que l'utilisateur s'est envoyés à lui-même.
        var targeted = all
            .Where(m => !m.IsDeleted)
            .Where(m => !IsOwner(m.SentByUserId, userId))
            .Where(m => m.TargetUserIds.Count == 0 || m.TargetUserIds.Contains(userId))
            .ToList();

        var unseenIds = new HashSet<string>(_seen.GetUnseenIds(userId, targeted.Select(m => m.Id)));
        return Ok(targeted
            .Where(m => unseenIds.Contains(m.Id))
            .Select(ToSummary));
    }

    // POST /InfoPopup/seen ───────────────────────────────────────────────────────────

    /// <summary>Marque des messages comme vus (batch). Appelé à la fermeture de la popup.</summary>
    [HttpPost("seen")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult MarkSeen([FromBody] MarkSeenRequest request)
    {
        if (!ModelState.IsValid || request.Ids.Count == 0)
            return BadRequest(new { error = "Liste d'IDs vide ou invalide." });
        var userId = GetUserId();
        if (userId is null) return Unauthorized();
        // Optim v3.8.5.0 : GetAllIds évite l'allocation d'une List<PopupMessage> triée
        // dont seuls les IDs sont consommés ici.
        _seen.MarkAsSeen(userId, request.Ids, _store.GetAllIds());
        return NoContent();
    }
}
