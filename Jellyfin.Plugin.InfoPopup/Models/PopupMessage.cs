using System;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Représente un message popup publié par un administrateur.</summary>
public class PopupMessage
{
    /// <summary>Identifiant unique (GUID).</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Titre (max 200 caractères).</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Corps du message en texte brut (max 10 000 car.).
    /// Jamais de HTML ni Markdown — rendu par CSS white-space:pre-wrap.
    /// </summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>Date de publication UTC.</summary>
    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;

    /// <summary>ID Jellyfin de l'admin ayant publié.</summary>
    public string PublishedBy { get; set; } = string.Empty;
}
