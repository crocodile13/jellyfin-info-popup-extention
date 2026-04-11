using System.Collections.Generic;
using Jellyfin.Plugin.InfoPopup.Models;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.InfoPopup.Configuration;

/// <summary>Configuration persistée du plugin (fichier XML Jellyfin).</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Liste des messages publiés par les administrateurs.</summary>
    public List<PopupMessage> Messages { get; set; } = new();

    /// <summary>Activer ou désactiver la popup pour tous les utilisateurs.</summary>
    public bool PopupEnabled { get; set; } = true;

    /// <summary>
    /// Durée d'affichage de la popup en millisecondes avant fermeture automatique.
    /// 0 = pas de fermeture automatique (l'utilisateur ferme manuellement).
    /// </summary>
    public int PopupDelayMs { get; set; } = 0;

    /// <summary>Nombre maximum de messages non-vus affichés simultanément dans la popup.</summary>
    public int MaxMessagesInPopup { get; set; } = 5;

    /// <summary>Activer le système de réponses utilisateurs aux messages popup.</summary>
    public bool AllowReplies { get; set; } = false;

    /// <summary>Longueur maximale d'une réponse utilisateur (caractères).</summary>
    public int ReplyMaxLength { get; set; } = 500;

    /// <summary>Afficher l'historique des messages vus dans la popup.</summary>
    public bool HistoryEnabled { get; set; } = true;

    /// <summary>Délai minimum en millisecondes entre deux publications d'un administrateur.</summary>
    public int RateLimitMs { get; set; } = 2000;

    /// <summary>
    /// Durée de conservation des messages envoyés par les admins (jours).
    /// 0 = pas de nettoyage automatique.
    /// </summary>
    public int AdminMessageRetentionDays { get; set; } = 0;

    /// <summary>
    /// Durée de conservation des messages envoyés par les utilisateurs (jours).
    /// 0 = pas de nettoyage automatique.
    /// </summary>
    public int UserMessageRetentionDays { get; set; } = 30;
}
