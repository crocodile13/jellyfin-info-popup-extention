using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Plugin.InfoPopup.DTOs;
using Jellyfin.Plugin.InfoPopup.Models;
using Jellyfin.Plugin.InfoPopup.Services;
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
    private readonly ILogger<InfoPopupController> _logger;
    private readonly IAuthorizationService _authorizationService;

    /// <summary>Constructeur injecté par DI.</summary>
    public InfoPopupController(
        MessageStore store,
        SeenTrackerService seen,
        ILogger<InfoPopupController> logger,
        IAuthorizationService authorizationService)
    {
        _store = store;
        _seen = seen;
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

        // Le SDK .NET remplace les caractères non valides en identifiant C# (dont "-")
        // par "_" dans les noms de ressources embarquées.
        var resourceFileName = fileName.Replace('-', '_');
        var resourceName = "Jellyfin.Plugin.InfoPopup.Web." + resourceFileName;
        var stream = GetType().Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            _logger.LogError("InfoPopup: ressource embarquée {Resource} introuvable dans l'assembly", resourceName);
            return NotFound();
        }
        return File(stream, "application/javascript");
    }
}
