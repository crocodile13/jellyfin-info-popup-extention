using System.Collections.Generic;
using Jellyfin.Plugin.InfoPopup.Models;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.InfoPopup.Configuration;

/// <summary>Configuration persistée du plugin (fichier XML Jellyfin).</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Liste des messages publiés par les administrateurs.</summary>
    public List<PopupMessage> Messages { get; set; } = new();
}
