using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Réponse d'un utilisateur à un message popup.</summary>
public class MessageReply
{
    /// <summary>Identifiant unique de la réponse (GUID string).</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Identifiant du message auquel l'utilisateur répond.</summary>
    public string MessageId { get; set; } = string.Empty;

    /// <summary>Identifiant Jellyfin de l'utilisateur.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Contenu textuel de la réponse.</summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>Date et heure UTC de la réponse.</summary>
    public DateTime RepliedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// ID Jellyfin de l'utilisateur destinataire de cette réponse (= SentByUserId du message).
    /// Permet de filtrer les réponses reçues par un utilisateur via GET /InfoPopup/replies/mine.
    /// </summary>
    public string RecipientUserId { get; set; } = string.Empty;
}

/// <summary>Racine du fichier de persistance infopopup_replies.json.</summary>
public class RepliesRoot
{
    /// <summary>Liste de toutes les réponses.</summary>
    public List<MessageReply> Replies { get; set; } = new();
}
