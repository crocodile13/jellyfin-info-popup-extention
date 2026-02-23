using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Représente un message popup publié par un administrateur.</summary>
public class PopupMessage
{
    /// <summary>Identifiant unique (GUID).</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Titre (max 200 caractères).</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Corps du message (max 10 000 car.).
    /// Supporte le markup IP : **gras**, _italique_, ~~barré~~, __souligné__, - liste.
    /// Rendu côté client par <c>renderBody()</c> en HTML sécurisé (whitelist).
    /// </summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>Date de publication UTC.</summary>
    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;

    /// <summary>ID Jellyfin de l'admin ayant publié.</summary>
    public string PublishedBy { get; set; } = string.Empty;

    /// <summary>
    /// IDs Jellyfin des utilisateurs ciblés.
    /// Liste vide = tous les utilisateurs (comportement par défaut).
    /// </summary>
    public List<string> TargetUserIds { get; set; } = new();
}
