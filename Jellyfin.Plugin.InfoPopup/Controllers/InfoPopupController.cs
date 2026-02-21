using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using Jellyfin.Plugin.InfoPopup.Models;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Authentication;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Controllers;

// ── DTOs ───────────────────────────────────────────────────────────────────────────

/// <summary>Requête de création d'un message.</summary>
public class CreateMessageRequest
{
    /// <summary>Titre (max 200 car.).</summary>
    [Required][MaxLength(200)] public string Title { get; set; } = string.Empty;
    /// <summary>Corps texte brut (max 10 000 car.).</summary>
    [Required][MaxLength(10_000)] public string Body { get; set; } = string.Empty;
    /// <summary>
    /// IDs Jellyfin des utilisateurs cibles.
    /// Liste vide ou absente = tous les utilisateurs.
    /// </summary>
    public List<string> TargetUserIds { get; set; } = new();
}

/// <summary>Requête de suppression groupée.</summary>
public class DeleteMessagesRequest
{
    /// <summary>IDs à supprimer définitivement.</summary>
    [Required] public List<string> Ids { get; set; } = new();
}

/// <summary>Requête de marquage comme vu (batch).</summary>
public class MarkSeenRequest
{
    /// <summary>IDs à marquer comme vus.</summary>
    [Required] public List<string> Ids { get; set; } = new();
}

/// <summary>Vue résumée d'un message (sans body).</summary>
public class MessageSummary
{
    /// <summary>ID.</summary>
    public string Id { get; set; } = string.Empty;
    /// <summary>Titre.</summary>
    public string Title { get; set; } = string.Empty;
    /// <summary>Date de publication UTC.</summary>
    public DateTime PublishedAt { get; set; }
    /// <summary>
    /// IDs Jellyfin des utilisateurs cibles.
    /// Liste vide = tous les utilisateurs.
    /// </summary>
    public List<string> TargetUserIds { get; set; } = new();
}

/// <summary>Vue complète d'un message (avec body).</summary>
public class MessageDetail
{
    /// <summary>ID.</summary>
    public string Id { get; set; } = string.Empty;
    /// <summary>Titre.</summary>
    public string Title { get; set; } = string.Empty;
    /// <summary>Corps texte brut.</summary>
    public string Body { get; set; } = string.Empty;
    /// <summary>Date de publication UTC.</summary>
    public DateTime PublishedAt { get; set; }
}

// ── Controller ──────────────────────────────────────────────────────────────────────────────

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

    /// <summary>Constructeur injecté par DI.</summary>
    public InfoPopupController(MessageStore store, SeenTrackerService seen, ILogger<InfoPopupController> logger)
    {
        _store = store;
        _seen = seen;
        _logger = logger;
    }

    // GET /InfoPopup/messages ─────────────────────────────────────────────────────

    /// <summary>Liste résumée de tous les messages, du plus récent au plus ancien.</summary>
    [HttpGet("messages")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<MessageSummary>> GetMessages() =>
        Ok(_store.GetAll().Select(m => new MessageSummary
        {
            Id = m.Id,
            Title = m.Title,
            PublishedAt = m.PublishedAt,
            TargetUserIds = m.TargetUserIds
        }));

    // GET /InfoPopup/messages/{id} ───────────────────────────────────────────────

    /// <summary>Détail complet d'un message (avec body).</summary>
    [HttpGet("messages/{id}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<MessageDetail> GetMessage([FromRoute] string id)
    {
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();
        return Ok(new MessageDetail { Id = msg.Id, Title = msg.Title, Body = msg.Body, PublishedAt = msg.PublishedAt });
    }

    // POST /InfoPopup/messages ─── ADMIN ONLY ─────────────────────────────────────────────

    /// <summary>Publie un nouveau message popup. Réservé aux administrateurs.</summary>
    [HttpPost("messages")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<MessageDetail> CreateMessage([FromBody] CreateMessageRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var userId = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value ?? string.Empty;
        try
        {
            var msg = _store.Create(request.Title, request.Body, userId, request.TargetUserIds);
            var detail = new MessageDetail { Id = msg.Id, Title = msg.Title, Body = msg.Body, PublishedAt = msg.PublishedAt };
            return CreatedAtAction(nameof(GetMessage), new { id = msg.Id }, detail);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // DELETE /InfoPopup/messages ── ADMIN ONLY ─────────────────────────────────────────────

    /// <summary>
    /// Supprime définitivement des messages. Réservé aux administrateurs.
    /// Un message supprimé disparaît partout pour tous les utilisateurs.
    /// </summary>
    [HttpDelete("messages")]
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

    // GET /InfoPopup/unseen ───────────────────────────────────────────────────────────────────────

    /// <summary>Messages non encore vus par l'utilisateur connecté, filtrés par ciblage.</summary>
    [HttpGet("unseen")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<MessageSummary>> GetUnseen()
    {
        var userId = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value ?? string.Empty;
        var all = _store.GetAll();

        // Filtrer : ne garder que les messages ciblant cet utilisateur
        // (TargetUserIds vide = tous les utilisateurs)
        var targeted = all
            .Where(m => m.TargetUserIds.Count == 0 || m.TargetUserIds.Contains(userId))
            .ToList();

        var unseenIds = new HashSet<string>(_seen.GetUnseenIds(userId, targeted.Select(m => m.Id)));
        return Ok(targeted
            .Where(m => unseenIds.Contains(m.Id))
            .Select(m => new MessageSummary
            {
                Id = m.Id,
                Title = m.Title,
                PublishedAt = m.PublishedAt,
                TargetUserIds = m.TargetUserIds
            }));
    }

    // POST /InfoPopup/seen ──────────────────────────────────────────────────────────────────────────────

    /// <summary>Marque des messages comme vus (batch). Appelé à la fermeture de la popup.</summary>
    [HttpPost("seen")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult MarkSeen([FromBody] MarkSeenRequest request)
    {
        if (!ModelState.IsValid || request.Ids.Count == 0)
            return BadRequest(new { error = "Liste d'IDs vide ou invalide." });
        var userId = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value ?? string.Empty;
        _seen.MarkAsSeen(userId, request.Ids, _store.GetAll().Select(m => m.Id));
        return NoContent();
    }

    // GET /InfoPopup/client.js ──────────────────────────────────────────────────────────────────────────────

    /// <summary>Sert le script JavaScript client (public, injecté dans index.html).</summary>
    [HttpGet("client.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetClientScript()
    {
        var stream = GetType().Assembly.GetManifestResourceStream("Jellyfin.Plugin.InfoPopup.Web.client.js");
        if (stream is null)
        {
            _logger.LogError("InfoPopup: ressource embarquée client.js introuvable dans l'assembly");
            return NotFound();
        }
        return File(stream, "application/javascript");
    }
}
