using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Plugin.InfoPopup.DTOs;
using Jellyfin.Plugin.InfoPopup.Models;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Controllers;

/// <summary>
/// Contrôleur REST du plugin jellyfin-info-popup-extention.
/// Route de base : /InfoPopup
/// </summary>
[ApiController]
[Route("InfoPopup")]
public class InfoPopupController : ControllerBase
{
    private readonly MessageStore _store;
    private readonly SeenTrackerService _seen;
    private readonly ReplyStoreService _replyStore;
    private readonly IUserManager _userManager;
    private readonly ILogger<InfoPopupController> _logger;
    private readonly IAuthorizationService _authorizationService;

    /// <summary>Constructeur injecté par DI.</summary>
    public InfoPopupController(
        MessageStore store,
        SeenTrackerService seen,
        ReplyStoreService replyStore,
        IUserManager userManager,
        ILogger<InfoPopupController> logger,
        IAuthorizationService authorizationService)
    {
        _store = store;
        _seen = seen;
        _replyStore = replyStore;
        _userManager = userManager;
        _logger = logger;
        _authorizationService = authorizationService;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne l'ID de l'utilisateur connecté, ou null si absent/vide.
    /// Un retour null doit conduire à un 401 explicite côté appelant.
    /// </summary>
    private string? GetUserId()
    {
        var id = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value;
        return string.IsNullOrEmpty(id) ? null : id;
    }

    /// <summary>Vérifie si l'utilisateur courant est administrateur via la policy Jellyfin.</summary>
    private async Task<bool> IsAdminAsync() =>
        (await _authorizationService.AuthorizeAsync(User, "RequiresElevation")).Succeeded;

    private static MessageSummary ToSummary(PopupMessage m) => new()
    {
        Id = m.Id,
        Title = m.Title,
        PublishedAt = m.PublishedAt,
        TargetUserIds = m.TargetUserIds
    };

    private static MessageDetail ToDetail(PopupMessage m) => new()
    {
        Id = m.Id,
        Title = m.Title,
        Body = m.Body,
        PublishedAt = m.PublishedAt
    };

    // GET /InfoPopup/messages ────────────────────────────────────────────────────────

    /// <summary>
    /// Liste des messages.
    /// Admins : tous les messages (pour la page de configuration).
    /// Utilisateurs : uniquement les messages qui leur sont destinés.
    /// </summary>
    [HttpGet("messages")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IEnumerable<MessageSummary>>> GetMessages()
    {
        var all = _store.GetAll();

        if (await IsAdminAsync())
            return Ok(all.Select(ToSummary));

        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        return Ok(all
            .Where(m => m.TargetUserIds.Count == 0 || m.TargetUserIds.Contains(userId))
            .Select(ToSummary));
    }

    // GET /InfoPopup/messages/{id} ───────────────────────────────────────────────────

    /// <summary>
    /// Détail complet d'un message (avec body).
    /// Admins : n'importe quel message.
    /// Utilisateurs : uniquement si ciblés par ce message.
    /// Retourne 404 (pas 403) pour ne pas révéler l'existence d'un message non ciblé.
    /// </summary>
    [HttpGet("messages/{id}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MessageDetail>> GetMessage([FromRoute] string id)
    {
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        if (!await IsAdminAsync())
        {
            var userId = GetUserId();
            if (userId is null) return Unauthorized();

            // 404 et non 403 : ne pas révéler l'existence d'un message non ciblé.
            if (msg.TargetUserIds.Count > 0 && !msg.TargetUserIds.Contains(userId))
                return NotFound();
        }

        return Ok(ToDetail(msg));
    }

    // POST /InfoPopup/messages ─── ADMIN ONLY ────────────────────────────────────────

    /// <summary>Publie un nouveau message popup. Réservé aux administrateurs.</summary>
    [HttpPost("messages")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<MessageDetail> CreateMessage([FromBody] CreateMessageRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var userId = GetUserId() ?? string.Empty;
        try
        {
            var msg = _store.Create(request.Title, request.Body, userId, request.TargetUserIds);
            return CreatedAtAction(nameof(GetMessage), new { id = msg.Id }, ToDetail(msg));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
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

    // PUT /InfoPopup/messages/{id} ── ADMIN ONLY ─────────────────────────────────────

    /// <summary>
    /// Met à jour le titre et le corps d'un message existant. Réservé aux administrateurs.
    /// L'ID est conservé : les utilisateurs qui avaient déjà vu ce message ne le reverront pas.
    /// </summary>
    [HttpPut("messages/{id}")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<MessageDetail> UpdateMessage([FromRoute] string id, [FromBody] UpdateMessageRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            // Update() retourne un snapshot capturé dans le lock : élimine la TOCTOU
            // qu'aurait causé un second appel à GetById() après Update().
            var updated = _store.Update(id, request.Title, request.Body, request.TargetUserIds);
            if (updated is null) return NotFound(new { error = "Message introuvable." });
            return Ok(ToDetail(updated));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // GET /InfoPopup/popup-data ───────────────────────────────────────────────────────
    // Remplace le pattern N+1 précédent qui enchaînait :
    //   GET /unseen → N×GET /messages/{id} → GET /messages → M×GET /messages/{id}
    // par un seul appel retournant tout ce dont la popup a besoin.

    /// <summary>
    /// Données complètes pour la popup utilisateur en un seul appel API :
    /// messages non vus avec corps complet + historique en résumé (corps chargé au clic).
    /// </summary>
    [HttpGet("popup-data")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<PopupDataResponse> GetPopupData()
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var all = _store.GetAll();
        var targeted = all
            .Where(m => m.TargetUserIds.Count == 0 || m.TargetUserIds.Contains(userId))
            .ToList();

        var unseenIds = new HashSet<string>(_seen.GetUnseenIds(userId, targeted.Select(m => m.Id)));

        return Ok(new PopupDataResponse
        {
            Unseen = targeted
                .Where(m => unseenIds.Contains(m.Id))
                .Select(ToDetail)
                .ToList(),
            History = targeted
                .Where(m => !unseenIds.Contains(m.Id))
                .Select(ToSummary)
                .ToList()
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
        var targeted = all
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
        _seen.MarkAsSeen(userId, request.Ids, _store.GetAll().Select(m => m.Id));
        return NoContent();
    }

    // GET /InfoPopup/{module}.js ─────────────────────────────────────────────────────
    // Sert les modules JavaScript embarqués dans l'assembly.
    // client.js est le point d'entrée (injecté par ScriptInjectionMiddleware).
    // Les modules ip-*.js sont chargés dynamiquement par client.js.
    // Seuls les noms figurant dans la whitelist sont servis (sécurité).

    // ── Reply helper ─────────────────────────────────────────────────────────────────

    /// <summary>Construit un ReplyDto depuis un MessageReply, en résolvant le nom d'utilisateur.</summary>
    private ReplyDto ToReplyDto(MessageReply r)
    {
        string userName;
        try
        {
            var user = _userManager.GetUserById(Guid.Parse(r.UserId));
            userName = user?.Username ?? r.UserId[..Math.Min(8, r.UserId.Length)] + "…";
        }
        catch
        {
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

    // ── Settings ─────────────────────────────────────────────────────────────────────

    /// <summary>Retourne les paramètres actuels du plugin.</summary>
    [HttpGet("settings")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult<PluginSettingsDto> GetSettings()
    {
        var cfg = Plugin.Instance?.Configuration;
        if (cfg is null) return StatusCode(500);
        return Ok(new PluginSettingsDto
        {
            PopupEnabled       = cfg.PopupEnabled,
            PopupDelayMs       = cfg.PopupDelayMs,
            MaxMessagesInPopup = cfg.MaxMessagesInPopup,
            AllowReplies       = cfg.AllowReplies,
            ReplyMaxLength     = cfg.ReplyMaxLength,
            HistoryEnabled     = cfg.HistoryEnabled,
            RateLimitMs        = cfg.RateLimitMs
        });
    }

    /// <summary>Sauvegarde les paramètres du plugin.</summary>
    [HttpPost("settings")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult<PluginSettingsDto> SaveSettings([FromBody] PluginSettingsDto dto)
    {
        var instance = Plugin.Instance;
        if (instance is null) return StatusCode(500);
        var cfg = instance.Configuration;
        cfg.PopupEnabled       = dto.PopupEnabled;
        cfg.PopupDelayMs       = Math.Clamp(dto.PopupDelayMs, 0, 30000);
        cfg.MaxMessagesInPopup = Math.Clamp(dto.MaxMessagesInPopup, 1, 50);
        cfg.AllowReplies       = dto.AllowReplies;
        cfg.ReplyMaxLength     = Math.Clamp(dto.ReplyMaxLength, 10, 5000);
        cfg.HistoryEnabled     = dto.HistoryEnabled;
        cfg.RateLimitMs        = Math.Clamp(dto.RateLimitMs, 0, 60000);
        instance.SaveConfiguration();
        _logger.LogInformation("InfoPopup: paramètres mis à jour par l'administrateur");
        return Ok(new PluginSettingsDto
        {
            PopupEnabled       = cfg.PopupEnabled,
            PopupDelayMs       = cfg.PopupDelayMs,
            MaxMessagesInPopup = cfg.MaxMessagesInPopup,
            AllowReplies       = cfg.AllowReplies,
            ReplyMaxLength     = cfg.ReplyMaxLength,
            HistoryEnabled     = cfg.HistoryEnabled,
            RateLimitMs        = cfg.RateLimitMs
        });
    }

    /// <summary>Retourne les paramètres client (sous-ensemble non-sensible, anonyme).</summary>
    [HttpGet("client-settings")]
    [AllowAnonymous]
    public ActionResult<ClientSettingsDto> GetClientSettings()
    {
        var cfg = Plugin.Instance?.Configuration;
        return Ok(new ClientSettingsDto
        {
            PopupEnabled       = cfg?.PopupEnabled ?? true,
            PopupDelayMs       = cfg?.PopupDelayMs ?? 800,
            MaxMessagesInPopup = cfg?.MaxMessagesInPopup ?? 5,
            AllowReplies       = cfg?.AllowReplies ?? false,
            HistoryEnabled     = cfg?.HistoryEnabled ?? true
        });
    }

    // ── Replies ───────────────────────────────────────────────────────────────────────

    /// <summary>Soumet une réponse à un message. Requiert AllowReplies = true.</summary>
    [HttpPost("messages/{id}/reply")]
    [Authorize]
    public ActionResult<ReplyDto> SubmitReply([FromRoute] string id, [FromBody] SubmitReplyRequest request)
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var cfg = Plugin.Instance?.Configuration;
        if (cfg is null || !cfg.AllowReplies)
            return StatusCode(403, new { error = "Replies are disabled." });

        // Vérifier que le message existe et est accessible pour cet utilisateur
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        // Vérifier le ciblage : 404 et non 403 pour ne pas révéler l'existence d'un message non ciblé
        if (msg.TargetUserIds.Count > 0 && !msg.TargetUserIds.Contains(userId))
            return NotFound();

        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Reply body cannot be empty." });

        try
        {
            var reply = _replyStore.AddReply(id, userId, request.Body);
            return StatusCode(201, ToReplyDto(reply));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Retourne toutes les réponses à un message (admin).</summary>
    [HttpGet("messages/{id}/replies")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult<IEnumerable<ReplyDto>> GetMessageReplies([FromRoute] string id)
    {
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();
        var replies = _replyStore.GetByMessageId(id).Select(ToReplyDto);
        return Ok(replies);
    }

    /// <summary>Retourne toutes les réponses groupées par message (admin).</summary>
    [HttpGet("replies")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult<IEnumerable<MessageRepliesDto>> GetAllReplies()
    {
        var allReplies = _replyStore.GetAll();
        var allMessages = _store.GetAll();
        var msgIndex = allMessages.ToDictionary(m => m.Id, m => m.Title ?? string.Empty);

        var groups = allReplies
            .GroupBy(r => r.MessageId)
            .Select(g => new MessageRepliesDto
            {
                MessageId    = g.Key,
                MessageTitle = msgIndex.TryGetValue(g.Key, out var t) ? t : g.Key,
                Replies      = g.Select(ToReplyDto).ToList()
            })
            .ToList();

        return Ok(groups);
    }

    /// <summary>Supprime une réponse individuelle (admin).</summary>
    [HttpDelete("replies/{replyId}")]
    [Authorize(Policy = "RequiresElevation")]
    public IActionResult DeleteReply([FromRoute] string replyId)
    {
        var deleted = _replyStore.DeleteReply(replyId);
        if (!deleted) return NotFound();
        _logger.LogInformation("InfoPopup: réponse {ReplyId} supprimée", replyId);
        return Ok(new { deleted = 1 });
    }

    /// <summary>Supprime toutes les réponses d'un message (admin).</summary>
    [HttpPost("messages/{id}/replies/delete")]
    [Authorize(Policy = "RequiresElevation")]
    public IActionResult DeleteMessageReplies([FromRoute] string id)
    {
        var count = _replyStore.DeleteByMessageIds(new[] { id });
        _logger.LogInformation("InfoPopup: {Count} réponse(s) supprimée(s) pour le message {MessageId}", count, id);
        return Ok(new { deleted = count });
    }

    // ── JS modules ───────────────────────────────────────────────────────────────────

    private static readonly System.Collections.Generic.HashSet<string> _allowedModules =
        new(System.StringComparer.OrdinalIgnoreCase)
        {
            "client.js",
            "ip-i18n.js",
            "ip-utils.js",
            "ip-styles.js",
            "ip-admin.js",
            "ip-popup.js"
        };

    /// <summary>
    /// Sert un module JavaScript embarqué dans l'assembly.
    /// Whitelist : client.js, ip-i18n.js, ip-utils.js, ip-styles.js, ip-admin.js, ip-popup.js.
    /// Note : le SDK .NET remplace les tirets par des underscores dans les noms de ressources
    /// embarquées (ip-admin.js → ip_admin.js dans le manifest). La conversion est appliquée ici.
    /// </summary>
    [HttpGet("{module}.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetJsModule([FromRoute] string module)
    {
        var fileName = module + ".js";
        if (!_allowedModules.Contains(fileName))
            return NotFound();

        // Le SDK .NET conserve les tirets dans les noms de ressources embarquées
        // quand les fichiers sont déclarés explicitement via <EmbeddedResource> dans le .csproj.
        // ip-admin.js → Jellyfin.Plugin.InfoPopup.Web.ip-admin.js (tiret conservé, pas d'underscore).
        var resourceName = "Jellyfin.Plugin.InfoPopup.Web." + fileName;
        var stream = GetType().Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            _logger.LogError("InfoPopup: ressource embarquée {Resource} introuvable dans l'assembly", resourceName);
            return NotFound();
        }
        return File(stream, "application/javascript");
    }
}
