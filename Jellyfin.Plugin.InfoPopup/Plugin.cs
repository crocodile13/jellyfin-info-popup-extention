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
    /// Changé en v3.7.2.0 : l'ancien GUID modèle (a1b2c3d4-e5f6-7890-abcd-ef1234567890)
    /// entrait en collision avec le plugin "QualityGate" (GeiserX) présent dans
    /// l'Universal Plugin Repository, ce qui fusionnait les deux et masquait
    /// Info Popup dans le catalogue Jellyfin.
    /// </summary>
    public override Guid Id => new Guid("ceeb3040-9fe5-451f-ac05-8587ea3c3718");

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
            new PluginPageInfo
            {
                Name = "InfoPopupConfigPage",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.configurationpage.html",
                DisplayName = "Info Popup",
                EnableInMainMenu = true,
                MenuSection = "server",
                MenuIcon = "notifications"
            },
            new PluginPageInfo
            {
                Name = "InfoPopupUserPage",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.usermessagespage.html",
                DisplayName = "Messages",
                EnableInMainMenu = false,
                MenuSection = "server",
                MenuIcon = "message"
            }
        };
    }
}
