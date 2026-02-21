using System;
using System.Collections.Generic;
using Jellyfin.Plugin.InfoPopup.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.InfoPopup;

/// <summary>
/// Plugin principal jellyfin-info-popup-extention.
/// Permet aux administrateurs de diffuser des messages popup aux utilisateurs.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Identifiant unique du plugin — NE JAMAIS MODIFIER après publication.
    /// </summary>
    public override Guid Id => new Guid("a1b2c3d4-e5f6-7890-abcd-ef1234567890");

    /// <inheritdoc />
    public override string Name => "Info Popup";

    /// <inheritdoc />
    public override string Description =>
        "Permet aux administrateurs de diffuser des messages popup aux utilisateurs lors de leur connexion.";

    /// <summary>Instance statique pour accès depuis les services.</summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>Initialise le plugin.</summary>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            // Page de configuration admin
            new PluginPageInfo
            {
                Name = "InfoPopupConfigPage",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.configurationpage.html",
                DisplayName = "Info Popup",
                MenuSection = "server",
                MenuIcon = "notifications"
            },
            // Script client injecté globalement dans la SPA Jellyfin.
            // Jellyfin détecte les PluginPageInfo dont le nom finit en .js
            // et les charge automatiquement dans la SPA via son plugin manager.
            new PluginPageInfo
            {
                Name = "infopopup.js",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.client.js"
            }
        };
    }
}
