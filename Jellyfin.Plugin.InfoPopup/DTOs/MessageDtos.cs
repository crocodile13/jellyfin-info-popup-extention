using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Jellyfin.Plugin.InfoPopup.DTOs;

/// <summary>Requête de création d'un message.</summary>
public class CreateMessageRequest
{
    /// <summary>Titre (max 200 car.).</summary>
    [Required][MaxLength(200)] public string Title { get; set; } = string.Empty;

    /// <summary>Corps texte brut (max 10 000 car.).</summary>
    [Required][MaxLength(10_000)] public string Body { get; set; } = string.Empty;

    /// <summary>
    /// IDs Jellyfin des utilisateurs cibles.
    /// Liste vide ou absente = tous les utilisateurs.
    /// </summary>
    public List<string> TargetUserIds { get; set; } = new();
}

/// <summary>Requête de suppression groupée.</summary>
public class DeleteMessagesRequest
{
    /// <summary>IDs à supprimer définitivement.</summary>
    [Required] public List<string> Ids { get; set; } = new();
}

/// <summary>Requête de modification d'un message existant.</summary>
public class UpdateMessageRequest
{
    /// <summary>Nouveau titre (max 200 car.).</summary>
    [Required][MaxLength(200)] public string Title { get; set; } = string.Empty;

    /// <summary>Nouveau corps (max 10 000 car., supporte le markup IP).</summary>
    [Required][MaxLength(10_000)] public string Body { get; set; } = string.Empty;
}

/// <summary>Requête de marquage comme vu (batch).</summary>
public class MarkSeenRequest
{
    /// <summary>IDs à marquer comme vus.</summary>
    [Required] public List<string> Ids { get; set; } = new();
}

/// <summary>Vue résumée d'un message (sans body).</summary>
public class MessageSummary
{
    /// <summary>ID.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Titre.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Date de publication UTC.</summary>
    public DateTime PublishedAt { get; set; }

    /// <summary>
    /// IDs Jellyfin des utilisateurs cibles.
    /// Liste vide = tous les utilisateurs.
    /// </summary>
    public List<string> TargetUserIds { get; set; } = new();
}

/// <summary>Vue complète d'un message (avec body).</summary>
public class MessageDetail
{
    /// <summary>ID.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Titre.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>Corps texte brut.</summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>Date de publication UTC.</summary>
    public DateTime PublishedAt { get; set; }
}

/// <summary>
/// Données complètes pour la popup utilisateur, retournées en un seul appel API.
/// Élimine le pattern N+1 (unseen + N×GET body + GET all + M×GET body).
/// </summary>
public class PopupDataResponse
{
    /// <summary>
    /// Messages non vus avec leur corps complet — affichés immédiatement dans la popup.
    /// </summary>
    public List<MessageDetail> Unseen { get; set; } = new();

    /// <summary>
    /// Messages déjà vus (résumés sans corps) — chargés à la demande au clic dans l'historique.
    /// </summary>
    public List<MessageSummary> History { get; set; } = new();
}
