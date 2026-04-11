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

    /// <summary>
    /// IDs Jellyfin des utilisateurs cibles.
    /// Liste vide = tous les utilisateurs (même comportement que CreateMessageRequest).
    /// </summary>
    public List<string> TargetUserIds { get; set; } = new();
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

// ── Settings ─────────────────────────────────────────────────────────────────

/// <summary>Paramètres du plugin (admin : lecture/écriture).</summary>
public class PluginSettingsDto
{
    /// <summary>Activer ou désactiver la popup pour tous les utilisateurs.</summary>
    public bool PopupEnabled       { get; set; }

    /// <summary>Délai en millisecondes avant affichage de la popup après navigation.</summary>
    public int  PopupDelayMs       { get; set; }

    /// <summary>Nombre maximum de messages non-vus affichés simultanément dans la popup.</summary>
    public int  MaxMessagesInPopup { get; set; }

    /// <summary>Activer le système de réponses utilisateurs aux messages popup.</summary>
    public bool AllowReplies       { get; set; }

    /// <summary>Longueur maximale d'une réponse utilisateur (caractères).</summary>
    public int  ReplyMaxLength     { get; set; }

    /// <summary>Afficher l'historique des messages vus dans la popup.</summary>
    public bool HistoryEnabled     { get; set; }

    /// <summary>Délai minimum en millisecondes entre deux publications d'un administrateur.</summary>
    public int  RateLimitMs        { get; set; }
}

/// <summary>Sous-ensemble des paramètres exposé aux clients non-admin.</summary>
public class ClientSettingsDto
{
    /// <summary>Activer ou désactiver la popup pour tous les utilisateurs.</summary>
    public bool PopupEnabled       { get; set; }

    /// <summary>Délai en millisecondes avant affichage de la popup après navigation.</summary>
    public int  PopupDelayMs       { get; set; }

    /// <summary>Nombre maximum de messages non-vus affichés simultanément dans la popup.</summary>
    public int  MaxMessagesInPopup { get; set; }

    /// <summary>Activer le système de réponses utilisateurs aux messages popup.</summary>
    public bool AllowReplies       { get; set; }

    /// <summary>Afficher l'historique des messages vus dans la popup.</summary>
    public bool HistoryEnabled     { get; set; }
}

// ── Replies ───────────────────────────────────────────────────────────────────

/// <summary>Requête de soumission d'une réponse utilisateur.</summary>
public class SubmitReplyRequest
{
    /// <summary>Contenu de la réponse (non vide, max ReplyMaxLength car.).</summary>
    public string Body { get; set; } = string.Empty;
}

/// <summary>DTO de réponse retourné par l'API.</summary>
public class ReplyDto
{
    /// <summary>ID de la réponse.</summary>
    public string   Id         { get; set; } = string.Empty;

    /// <summary>ID du message auquel la réponse est associée.</summary>
    public string   MessageId  { get; set; } = string.Empty;

    /// <summary>ID Jellyfin de l'utilisateur.</summary>
    public string   UserId     { get; set; } = string.Empty;

    /// <summary>Nom d'affichage de l'utilisateur.</summary>
    public string   UserName   { get; set; } = string.Empty;

    /// <summary>Contenu de la réponse.</summary>
    public string   Body       { get; set; } = string.Empty;

    /// <summary>Date et heure UTC de la réponse.</summary>
    public DateTime RepliedAt  { get; set; }
}

/// <summary>Groupe de réponses pour un message donné (vue admin).</summary>
public class MessageRepliesDto
{
    /// <summary>ID du message.</summary>
    public string        MessageId    { get; set; } = string.Empty;

    /// <summary>Titre du message.</summary>
    public string        MessageTitle { get; set; } = string.Empty;

    /// <summary>Liste des réponses associées au message.</summary>
    public List<ReplyDto> Replies     { get; set; } = new();
}
