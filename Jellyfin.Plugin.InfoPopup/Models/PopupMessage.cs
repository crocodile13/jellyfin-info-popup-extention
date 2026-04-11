using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Représente un message popup publié par un administrateur ou un utilisateur autorisé.</summary>
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

    /// <summary>
    /// ID de l'utilisateur qui a envoyé le message (admin ou user avec CanSendMessages).
    /// Identique à PublishedBy pour compatibilité ascendante.
    /// </summary>
    public string SentByUserId { get; set; } = string.Empty;

    /// <summary>
    /// True si l'expéditeur était administrateur Jellyfin au moment de l'envoi.
    /// Détermine la règle de rétention appliquée par CleanupRetention().
    /// </summary>
    public bool IsSentByAdmin { get; set; } = true;

    /// <summary>True si le message a été soft-deleté par un utilisateur (reste visible en admin avec marqueur).</summary>
    public bool IsDeleted { get; set; } = false;

    /// <summary>Date et heure UTC du soft-delete, ou null si non supprimé.</summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>ID Jellyfin de l'utilisateur qui a effectué le soft-delete, ou null.</summary>
    public string? DeletedByUserId { get; set; }

    /// <summary>
    /// Historique des modifications. Chaque entrée contient l'ancienne version avant modification.
    /// </summary>
    public List<MessageEditEntry> EditHistory { get; set; } = new();
}
