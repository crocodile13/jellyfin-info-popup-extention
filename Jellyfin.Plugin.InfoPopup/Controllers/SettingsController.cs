using System;
using Jellyfin.Plugin.InfoPopup.DTOs;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Collections.Generic;
using System.Linq;

namespace Jellyfin.Plugin.InfoPopup.Controllers;

/// <summary>
/// Endpoints réglages plugin (admin), réglages client (anonyme), actions de maintenance
/// (admin), et service des modules JS embarqués (anonyme avec whitelist).
/// (v4.1.1.0 — extrait de l'ancien <c>InfoPopupController</c>).
/// </summary>
[ApiController]
[Route("InfoPopup")]
public class SettingsController : InfoPopupControllerBase
{
    /// <summary>Constructeur DI.</summary>
    public SettingsController(
        MessageStore store, SeenTrackerService seen, ReplyStoreService replyStore,
        PermissionService permService, IUserManager userManager, IJellyfinCompat compat,
        ILogger<SettingsController> logger, IAuthorizationService authorizationService)
        : base(store, seen, replyStore, permService, userManager, compat, logger, authorizationService) { }

    // ── Maintenance / Reset (admin only, v3.8.7.0) ───────────────────────────────────

    /// <summary>
    /// Efface tous les accusés de lecture (<c>infopopup_seen.json</c>). Tous les utilisateurs
    /// reverront tous les messages déjà publiés à leur prochaine connexion.
    /// </summary>
    [HttpPost("admin/clear-seen")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult ClearAllSeen()
    {
        var n = _seen.ClearAll();
        _logger.LogInformation("InfoPopup: admin cleared all seen records ({Count})", n);
        return Ok(new { cleared = n });
    }

    /// <summary>
    /// Efface toutes les réponses (<c>infopopup_replies.json</c>). Les messages sont conservés
    /// mais leurs threads de réponses sont vidés.
    /// </summary>
    [HttpPost("admin/clear-replies")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult ClearAllReplies()
    {
        var n = _replyStore.ClearAll();
        _logger.LogInformation("InfoPopup: admin cleared all replies ({Count})", n);
        return Ok(new { cleared = n });
    }

    /// <summary>
    /// Hard-delete tous les messages soft-deletés. Ne touche pas aux messages actifs.
    /// Les réponses orphelines sont supprimées en cascade.
    /// </summary>
    [HttpPost("admin/purge-deleted")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult PurgeSoftDeleted()
    {
        // Capture les IDs des soft-deletés AVANT purge pour la cascade.
        var deletedIds = _store.GetAll().Where(m => m.IsDeleted).Select(m => m.Id).ToList();
        var n = _store.PurgeSoftDeleted();
        var rn = deletedIds.Count > 0 ? _replyStore.DeleteByMessageIds(deletedIds) : 0;
        _logger.LogInformation(
            "InfoPopup: admin purged {Count} soft-deleted message(s), cascade-deleted {ReplyCount} replies",
            n, rn);
        return Ok(new { messagesDeleted = n, repliesDeleted = rn });
    }

    /// <summary>
    /// Réinitialise <see cref="Configuration.PluginConfiguration"/> à ses valeurs par défaut
    /// (cf. initialiseurs de champs du modèle). N'affecte ni les messages, ni les accusés de
    /// lecture, ni les réponses, ni les droits utilisateurs — uniquement les réglages globaux.
    /// </summary>
    [HttpPost("admin/reset-settings")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public ActionResult<PluginSettingsDto> ResetSettings()
    {
        var instance = Plugin.Instance;
        if (instance is null) return StatusCode(500);
        var cfg = instance.Configuration;
        var defaults = new Configuration.PluginConfiguration();
        // On copie champ par champ pour préserver Messages (séparés des réglages réinitialisables).
        cfg.PopupEnabled              = defaults.PopupEnabled;
        cfg.PopupDelayMs              = defaults.PopupDelayMs;
        cfg.MaxMessagesInPopup        = defaults.MaxMessagesInPopup;
        cfg.AllowReplies              = defaults.AllowReplies;
        cfg.ReplyMaxLength            = defaults.ReplyMaxLength;
        cfg.HistoryEnabled            = defaults.HistoryEnabled;
        cfg.RateLimitMs               = defaults.RateLimitMs;
        cfg.AdminMessageRetentionDays = defaults.AdminMessageRetentionDays;
        cfg.UserMessageRetentionDays  = defaults.UserMessageRetentionDays;
        instance.SaveConfiguration();
        _logger.LogInformation("InfoPopup: admin reset plugin settings to defaults");
        return Ok(new PluginSettingsDto
        {
            PopupEnabled              = cfg.PopupEnabled,
            PopupDelayMs              = cfg.PopupDelayMs,
            MaxMessagesInPopup        = cfg.MaxMessagesInPopup,
            AllowReplies              = cfg.AllowReplies,
            ReplyMaxLength            = cfg.ReplyMaxLength,
            HistoryEnabled            = cfg.HistoryEnabled,
            RateLimitMs               = cfg.RateLimitMs,
            AdminMessageRetentionDays = cfg.AdminMessageRetentionDays,
            UserMessageRetentionDays  = cfg.UserMessageRetentionDays
        });
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
            PopupEnabled              = cfg.PopupEnabled,
            PopupDelayMs              = cfg.PopupDelayMs,
            MaxMessagesInPopup        = cfg.MaxMessagesInPopup,
            AllowReplies              = cfg.AllowReplies,
            ReplyMaxLength            = cfg.ReplyMaxLength,
            HistoryEnabled            = cfg.HistoryEnabled,
            RateLimitMs               = cfg.RateLimitMs,
            AdminMessageRetentionDays = cfg.AdminMessageRetentionDays,
            UserMessageRetentionDays  = cfg.UserMessageRetentionDays
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
        cfg.PopupEnabled              = dto.PopupEnabled;
        cfg.PopupDelayMs              = Math.Clamp(dto.PopupDelayMs, 0, 600000);
        cfg.MaxMessagesInPopup        = Math.Clamp(dto.MaxMessagesInPopup, 1, 50);
        cfg.AllowReplies              = dto.AllowReplies;
        cfg.ReplyMaxLength            = Math.Clamp(dto.ReplyMaxLength, 10, 5000);
        cfg.HistoryEnabled            = dto.HistoryEnabled;
        cfg.RateLimitMs               = Math.Clamp(dto.RateLimitMs, 0, 60000);
        cfg.AdminMessageRetentionDays = Math.Max(0, dto.AdminMessageRetentionDays);
        cfg.UserMessageRetentionDays  = Math.Max(0, dto.UserMessageRetentionDays);
        instance.SaveConfiguration();
        _logger.LogInformation("InfoPopup: paramètres mis à jour par l'administrateur");
        return Ok(new PluginSettingsDto
        {
            PopupEnabled              = cfg.PopupEnabled,
            PopupDelayMs              = cfg.PopupDelayMs,
            MaxMessagesInPopup        = cfg.MaxMessagesInPopup,
            AllowReplies              = cfg.AllowReplies,
            ReplyMaxLength            = cfg.ReplyMaxLength,
            HistoryEnabled            = cfg.HistoryEnabled,
            RateLimitMs               = cfg.RateLimitMs,
            AdminMessageRetentionDays = cfg.AdminMessageRetentionDays,
            UserMessageRetentionDays  = cfg.UserMessageRetentionDays
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

    // ── JS modules ───────────────────────────────────────────────────────────────────

    private static readonly HashSet<string> _allowedModules =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "client.js",
            "ip-i18n.js",
            "ip-utils.js",
            "ip-styles.js",
            "ip-admin-editor.js",
            "ip-admin-targets.js",
            "ip-admin-permissions.js",
            "ip-admin-settings.js",
            "ip-admin-messages.js",
            "ip-admin.js",
            "ip-popup.js",
            "ip-user.js"
        };

    /// <summary>
    /// Sert un module JavaScript embarqué dans l'assembly.
    /// Whitelist : client.js, ip-i18n.js, ip-utils.js, ip-styles.js, ip-admin-*.js (5 sous-modules),
    /// ip-admin.js (entry), ip-popup.js, ip-user.js.
    /// Note : le SDK .NET préserve les tirets dans les noms de ressources embarquées quand les fichiers
    /// sont déclarés explicitement via &lt;EmbeddedResource&gt; dans le .csproj.
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

        // En-têtes durcies (v3.8.2.0) :
        // - `X-Content-Type-Options: nosniff` : empêche les navigateurs de re-deviner le type
        //   (défense en profondeur même si la whitelist garantit que c'est du JS embarqué nous).
        // - Content-Type explicite avec charset=utf-8 : prévient toute ambiguïté d'encodage
        //   (corollaire historique : sur 10.10/10.11 l'absence de charset faisait afficher
        //   les caractères accentués en mojibake dans l'onglet brut du navigateur).
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        // Cache long (v3.8.4.0) : les modules sont servis avec une query `?v=X.Y.Z.W` ajoutée
        // par `ScriptInjectionMiddleware` et propagée par `client.js`. Le contenu est donc
        // *immuable* pour une version donnée — chaque release change le query string et invalide
        // naturellement le cache. Sans Cache-Control, le navigateur re-fetch (200 OK avec corps)
        // les 6 modules à chaque navigation SPA → ~50-150 ms gaspillés par transition. Avec
        // `immutable`, le navigateur ne revalide même pas, le service worker Jellyfin sert
        // depuis son cache HTTP. Quand l'admin met à jour le plugin, le nouveau ?v force le
        // re-download. Si la query est absente (cas dégénéré, ex. requête manuelle), on retombe
        // sur un cache court 5 minutes — pas de cache permanent sur du contenu non-versionné.
        var hasVersionQuery = HttpContext.Request.Query.ContainsKey("v");
        Response.Headers["Cache-Control"] = hasVersionQuery
            ? "public, max-age=31536000, immutable"
            : "public, max-age=300";

        return File(stream, "application/javascript; charset=utf-8");
    }
}
