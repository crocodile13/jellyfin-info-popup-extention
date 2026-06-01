using System;
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
/// Endpoints système de réponses : soumettre, lire, modérer (v4.1.1.0 — extrait de l'ancien
/// <c>InfoPopupController</c>).
/// </summary>
[ApiController]
[Route("InfoPopup")]
public class RepliesController : InfoPopupControllerBase
{
    /// <summary>Constructeur DI.</summary>
    public RepliesController(
        MessageStore store, SeenTrackerService seen, ReplyStoreService replyStore,
        PermissionService permService, IUserManager userManager, IJellyfinCompat compat,
        ILogger<RepliesController> logger, IAuthorizationService authorizationService)
        : base(store, seen, replyStore, permService, userManager, compat, logger, authorizationService) { }

    /// <summary>
    /// Soumet une réponse à un message.
    /// Requiert AllowReplies = true au niveau global ET CanReply pour l'utilisateur.
    /// Un utilisateur ne peut répondre qu'une seule fois à un message donné.
    /// </summary>
    [HttpPost("messages/{id}/reply")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ReplyDto>> SubmitReply([FromRoute] string id, [FromBody] SubmitReplyRequest request, CancellationToken ct = default)
    {
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var cfg = Plugin.Instance?.Configuration;
        if (cfg is null) return StatusCode(500);

        // Vérifier les droits de réponse.
        var isAdmin = await IsAdminAsync();
        if (!isAdmin)
        {
            var perm = _permService.GetOrDefault(userId);
            if (!cfg.AllowReplies || !perm.CanReply)
                return StatusCode(403, new { error = "Replies are disabled." });
        }
        else if (!cfg.AllowReplies)
        {
            return StatusCode(403, new { error = "Replies are disabled." });
        }

        // Vérifier que le message existe et est accessible pour cet utilisateur.
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        // 404 et non 403 pour ne pas révéler l'existence d'un message non ciblé.
        if (!isAdmin && msg.TargetUserIds.Count > 0 && !msg.TargetUserIds.Contains(userId))
            return NotFound();

        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Reply body cannot be empty." });

        // Vérification anticipée pour retourner 409 avant d'entrer dans le lock.
        if (_replyStore.HasUserReplied(id, userId))
            return Conflict(new { error = "Vous avez déjà répondu à ce message." });

        // Récupérer les paramètres de limite et le destinataire.
        var userPerm = isAdmin ? null : _permService.GetOrDefault(userId);
        var maxRepliesPerDay = userPerm?.MaxRepliesPerDay ?? 0;
        var recipientUserId = msg.SentByUserId ?? string.Empty;

        try
        {
            var reply = _replyStore.AddReply(id, userId, request.Body, recipientUserId, maxRepliesPerDay);
            return StatusCode(201, ToReplyDto(reply));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Retourne toutes les réponses à un message.
    /// Admin : toutes. Non-admin : autorisé uniquement si c'est SON message envoyé.
    /// </summary>
    [HttpGet("messages/{id}/replies")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IEnumerable<ReplyDto>>> GetMessageReplies([FromRoute] string id, CancellationToken ct = default)
    {
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        var msg = _store.GetById(id);
        if (msg is null) return NotFound();

        if (!await IsAdminAsync())
        {
            var userId = GetUserId();
            if (userId is null) return Unauthorized();
            if (!IsOwner(msg.SentByUserId, userId)) return Forbid();
        }

        var replies = _replyStore.GetByMessageId(id).Select(ToReplyDto);
        return Ok(replies);
    }

    /// <summary>
    /// Retourne les réponses « récentes » reçues par l'utilisateur courant — c.-à-d. les
    /// réponses à des messages dont il est l'expéditeur. Mécanisme léger pour la notification
    /// toast en temps réel ; le client poll périodiquement et compare avec son Set local des
    /// IDs déjà notifiés. <c>since</c> est optionnel (date UTC ISO 8601) pour limiter la fenêtre.
    /// </summary>
    [HttpGet("replies/received")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<IEnumerable<ReceivedReplyNotification>> GetReceivedReplies([FromQuery] DateTime? since)
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        // Liste des IDs de messages dont l'utilisateur est l'expéditeur, indexée pour O(1).
        var ownMessages = _store.GetAll().Where(m => m.SentByUserId == userId).ToDictionary(m => m.Id, m => m.Title);
        if (ownMessages.Count == 0) return Ok(Array.Empty<ReceivedReplyNotification>());

        var sinceCutoff = since ?? DateTime.UtcNow.AddDays(-7);

        var notifications = _replyStore.GetAll()
            .Where(r => ownMessages.ContainsKey(r.MessageId))
            .Where(r => r.RepliedAt >= sinceCutoff)
            .OrderByDescending(r => r.RepliedAt)
            .Take(50)
            .Select(r => new ReceivedReplyNotification
            {
                ReplyId = r.Id,
                MessageId = r.MessageId,
                MessageTitle = ownMessages.TryGetValue(r.MessageId, out var t) ? t : string.Empty,
                FromUserName = ResolveUserName(r.UserId),
                Body = r.Body,
                RepliedAt = r.RepliedAt
            });
        return Ok(notifications);
    }

    /// <summary>Retourne toutes les réponses groupées par message (admin), avec filtres optionnels.</summary>
    [HttpGet("replies")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult<IEnumerable<MessageRepliesDto>> GetAllReplies(
        [FromQuery] string? messageId = null,
        [FromQuery] string? recipientUserId = null,
        [FromQuery] string? senderUserId = null)
    {
        var allReplies = _replyStore.GetAll();
        var allMessages = _store.GetAll();
        var msgIndex = allMessages.ToDictionary(m => m.Id, m => m.Title ?? string.Empty);

        // Appliquer les filtres optionnels.
        if (!string.IsNullOrEmpty(messageId))
            allReplies = allReplies.Where(r => r.MessageId == messageId).ToList();
        if (!string.IsNullOrEmpty(recipientUserId))
            allReplies = allReplies.Where(r => r.RecipientUserId == recipientUserId).ToList();
        if (!string.IsNullOrEmpty(senderUserId))
            allReplies = allReplies.Where(r => r.UserId == senderUserId).ToList();

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

    /// <summary>Retourne les réponses reçues par l'utilisateur courant (destinataire).</summary>
    [HttpGet("replies/mine")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<IEnumerable<ReplyDto>> GetMyReplies()
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        var replies = _replyStore.GetByRecipient(userId).Select(ToReplyDto);
        return Ok(replies);
    }

    /// <summary>Supprime une réponse individuelle (admin).</summary>
    [HttpDelete("replies/{replyId}")]
    [Authorize(Policy = "RequiresElevation")]
    public IActionResult DeleteReply([FromRoute] string replyId)
    {
        if (!IsValidId(replyId)) return BadRequest(new { error = "Format d'identifiant invalide." });
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
        if (!IsValidId(id)) return BadRequest(new { error = "Format d'identifiant invalide." });
        var count = _replyStore.DeleteByMessageIds(new[] { id });
        _logger.LogInformation("InfoPopup: {Count} réponse(s) supprimée(s) pour le message {MessageId}", count, id);
        return Ok(new { deleted = count });
    }
}
