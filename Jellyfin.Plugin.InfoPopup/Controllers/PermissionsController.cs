using System.Collections.Generic;
using System.Linq;
using System.Threading;
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
/// Endpoints permissions per-user : lecture admin, lecture self, update unitaire, bulk
/// (v4.1.1.0 — extrait de l'ancien <c>InfoPopupController</c>).
/// </summary>
[ApiController]
[Route("InfoPopup")]
public class PermissionsController : InfoPopupControllerBase
{
    /// <summary>Constructeur DI.</summary>
    public PermissionsController(
        MessageStore store, SeenTrackerService seen, ReplyStoreService replyStore,
        PermissionService permService, IUserManager userManager, IJellyfinCompat compat,
        ILogger<PermissionsController> logger, IAuthorizationService authorizationService)
        : base(store, seen, replyStore, permService, userManager, compat, logger, authorizationService) { }

    /// <summary>
    /// Retourne les droits de tous les utilisateurs Jellyfin non-admin, fusionnés avec
    /// les entrées existantes dans infopopup_permissions.json.
    /// </summary>
    [HttpGet("permissions")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<UserPermissionDto>> GetAllPermissions()
    {
        var perms = _permService.GetAll();
        // Optim v3.8.4.0 : on indexe les permissions par UserId normalisé une seule fois,
        // au lieu de faire un `perms.FirstOrDefault(...)` O(P) par utilisateur (autrefois
        // O(P·U) sur la liste totale). On passe aussi `userName` directement à ToPermissionDto
        // pour éviter le second `_userManager.GetUserById` redondant.
        var permIndex = new Dictionary<string, UserPermission>(perms.Count);
        foreach (var p in perms)
        {
            permIndex[PermissionService.NormalizeUserId(p.UserId)] = p;
        }

        var result = new List<UserPermissionDto>();
        foreach (var (uid, userName, isAdmin) in EnumerateUsers())
        {
            var norm = PermissionService.NormalizeUserId(uid);
            var perm = permIndex.TryGetValue(norm, out var p) ? p : new UserPermission { UserId = uid };
            var dto = ToPermissionDto(perm, userName);
            dto.IsAdmin = isAdmin;
            result.Add(dto);
        }

        return Ok(result.OrderBy(d => d.UserName));
    }

    /// <summary>Retourne les droits effectifs de l'utilisateur courant.</summary>
    [HttpGet("permissions/me")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<EffectivePermissionsDto>> GetMyPermissions(CancellationToken ct = default)
    {
        var userId = GetUserId();
        if (userId is null) return Unauthorized();

        // v4.0.3.0 : `AllowReplies` est un master-switch global qui s'applique
        // aussi aux admins (le endpoint /reply renvoie 403 si global=off, y compris
        // pour admin). Cf. GetPopupData : même logique pour éviter une UI trompeuse.
        var cfg = Plugin.Instance!.Configuration;
        if (await IsAdminAsync())
            return Ok(new EffectivePermissionsDto
            {
                CanSendMessages = true,
                CanReply = cfg.AllowReplies,
                CanEditOwnMessages = true,
                CanDeleteOwnMessages = true,
                CanEditOthersMessages = true,
                CanDeleteOthersMessages = true,
                IsAdmin = true
            });

        var p = _permService.GetOrDefault(userId);
        return Ok(new EffectivePermissionsDto
        {
            CanSendMessages = p.CanSendMessages,
            CanReply = cfg.AllowReplies && p.CanReply,
            CanEditOwnMessages = p.CanEditOwnMessages,
            CanDeleteOwnMessages = p.CanDeleteOwnMessages,
            CanEditOthersMessages = p.CanEditOthersMessages,
            CanDeleteOthersMessages = p.CanDeleteOthersMessages,
            IsAdmin = false
        });
    }

    /// <summary>
    /// Définit ou remplace les droits d'un utilisateur. Réservé aux administrateurs.
    /// </summary>
    [HttpPut("permissions/{userId}")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<UserPermissionDto> UpdatePermissions(
        [FromRoute] string userId,
        [FromBody] UpdatePermissionsRequest request)
    {
        if (!IsValidId(userId)) return BadRequest(new { error = "Format d'identifiant utilisateur invalide." });
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var perm = new UserPermission
        {
            UserId = userId,
            CanSendMessages = request.CanSendMessages,
            CanReply = request.CanReply,
            CanEditOwnMessages = request.CanEditOwnMessages,
            CanDeleteOwnMessages = request.CanDeleteOwnMessages,
            CanEditOthersMessages = request.CanEditOthersMessages,
            CanDeleteOthersMessages = request.CanDeleteOthersMessages,
            MaxMessagesPerDay = request.MaxMessagesPerDay,
            MaxRepliesPerDay = request.MaxRepliesPerDay,
            Role = request.Role ?? string.Empty
        };

        _permService.Upsert(perm);
        return Ok(ToPermissionDto(perm));
    }

    /// <summary>
    /// Met à jour les droits de plusieurs utilisateurs en une seule opération.
    /// Réservé aux administrateurs.
    /// </summary>
    [HttpPost("permissions/bulk")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult BulkUpdatePermissions([FromBody] BulkUpdatePermissionsRequest request)
    {
        if (!ModelState.IsValid || request.UserIds.Count == 0)
            return BadRequest(new { error = "Liste d'IDs vide ou invalide." });

        if (!AreValidUserIds(request.UserIds))
            return BadRequest(new { error = "Un ou plusieurs UserIds ne sont pas des GUIDs valides." });

        foreach (var userId in request.UserIds)
        {
            var perm = new UserPermission
            {
                UserId = userId,
                CanSendMessages = request.CanSendMessages,
                CanReply = request.CanReply,
                CanEditOwnMessages = request.CanEditOwnMessages,
                CanDeleteOwnMessages = request.CanDeleteOwnMessages,
                CanEditOthersMessages = request.CanEditOthersMessages,
                CanDeleteOthersMessages = request.CanDeleteOthersMessages,
                MaxMessagesPerDay = request.MaxMessagesPerDay,
                MaxRepliesPerDay = request.MaxRepliesPerDay,
                Role = request.Role ?? string.Empty
            };
            _permService.Upsert(perm);
        }

        _logger.LogInformation("InfoPopup: droits mis à jour en masse pour {Count} utilisateur(s)", request.UserIds.Count);
        return Ok(new { updated = request.UserIds.Count });
    }
}
