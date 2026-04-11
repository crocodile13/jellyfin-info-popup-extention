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

    /// <summary>ID Jellyfin de l'expéditeur du message.</summary>
    public string SentByUserId { get; set; } = string.Empty;

    /// <summary>True si le message a été soft-deleté.</summary>
    public bool IsDeleted { get; set; }

    /// <summary>Date et heure UTC du soft-delete, ou null si non supprimé.</summary>
    public DateTime? DeletedAt { get; set; }
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

    /// <summary>ID Jellyfin de l'expéditeur du message.</summary>
    public string SentByUserId { get; set; } = string.Empty;

    /// <summary>True si le message a été soft-deleté.</summary>
    public bool IsDeleted { get; set; }

    /// <summary>Nombre d'entrées dans l'historique de modifications.</summary>
    public int EditHistoryCount { get; set; }
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

    /// <summary>Droits effectifs de l'utilisateur courant pour les actions sur les messages.</summary>
    public EffectivePermissionsDto Permissions { get; set; } = new();
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

    /// <summary>Durée de conservation des messages envoyés par les admins (jours). 0 = pas de nettoyage.</summary>
    public int  AdminMessageRetentionDays { get; set; }

    /// <summary>Durée de conservation des messages envoyés par les utilisateurs (jours). 0 = pas de nettoyage.</summary>
    public int  UserMessageRetentionDays  { get; set; }
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

// ── Permissions ───────────────────────────────────────────────────────────────

/// <summary>Droits d'un utilisateur non-admin (vue admin).</summary>
public class UserPermissionDto
{
    /// <summary>ID Jellyfin de l'utilisateur.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Nom d'affichage de l'utilisateur.</summary>
    public string UserName { get; set; } = string.Empty;

    /// <summary>Autoriser l'utilisateur à envoyer des messages popup.</summary>
    public bool CanSendMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à répondre aux messages popup.</summary>
    public bool CanReply { get; set; }

    /// <summary>Autoriser l'utilisateur à modifier ses propres messages.</summary>
    public bool CanEditOwnMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à supprimer (soft-delete) ses propres messages.</summary>
    public bool CanDeleteOwnMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à modifier les messages des autres utilisateurs.</summary>
    public bool CanEditOthersMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à supprimer (soft-delete) les messages des autres utilisateurs.</summary>
    public bool CanDeleteOthersMessages { get; set; }

    /// <summary>Nombre maximum de messages par jour. 0 = illimité.</summary>
    public int MaxMessagesPerDay { get; set; }

    /// <summary>Nombre maximum de réponses par jour. 0 = illimité.</summary>
    public int MaxRepliesPerDay { get; set; }
}

/// <summary>Requête de mise à jour des droits d'un utilisateur.</summary>
public class UpdatePermissionsRequest
{
    /// <summary>Autoriser l'utilisateur à envoyer des messages popup.</summary>
    public bool CanSendMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à répondre aux messages popup.</summary>
    public bool CanReply { get; set; }

    /// <summary>Autoriser l'utilisateur à modifier ses propres messages.</summary>
    public bool CanEditOwnMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à supprimer (soft-delete) ses propres messages.</summary>
    public bool CanDeleteOwnMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à modifier les messages des autres utilisateurs.</summary>
    public bool CanEditOthersMessages { get; set; }

    /// <summary>Autoriser l'utilisateur à supprimer (soft-delete) les messages des autres utilisateurs.</summary>
    public bool CanDeleteOthersMessages { get; set; }

    /// <summary>Nombre maximum de messages par jour. 0 = illimité.</summary>
    [Range(0, 1000)] public int MaxMessagesPerDay { get; set; } = 5;

    /// <summary>Nombre maximum de réponses par jour. 0 = illimité.</summary>
    [Range(0, 1000)] public int MaxRepliesPerDay { get; set; } = 10;
}

/// <summary>Droits effectifs de l'utilisateur courant retournés dans popup-data et permissions/me.</summary>
public class EffectivePermissionsDto
{
    /// <summary>L'utilisateur peut envoyer des messages popup.</summary>
    public bool CanSendMessages { get; set; }

    /// <summary>Droit effectif = AllowReplies global ET CanReply par utilisateur.</summary>
    public bool CanReply { get; set; }

    /// <summary>L'utilisateur peut modifier ses propres messages.</summary>
    public bool CanEditOwnMessages { get; set; }

    /// <summary>L'utilisateur peut soft-supprimer ses propres messages.</summary>
    public bool CanDeleteOwnMessages { get; set; }
}

/// <summary>Requête de soft-delete d'un message par un utilisateur. L'ID est dans la route.</summary>
public class SoftDeleteMessageRequest
{
    // Pas de body nécessaire — l'ID est dans la route.
}
