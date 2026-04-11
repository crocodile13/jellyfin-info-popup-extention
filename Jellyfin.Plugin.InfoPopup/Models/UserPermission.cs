using System.Collections.Generic;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Droits accordés à un utilisateur non-admin.</summary>
public class UserPermission
{
    /// <summary>Identifiant Jellyfin de l'utilisateur.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Autoriser l'utilisateur à envoyer des messages popup.</summary>
    public bool CanSendMessages { get; set; } = false;

    /// <summary>Autoriser l'utilisateur à répondre aux messages popup.</summary>
    public bool CanReply { get; set; } = false;

    /// <summary>Autoriser l'utilisateur à modifier ses propres messages.</summary>
    public bool CanEditOwnMessages { get; set; } = false;

    /// <summary>Autoriser l'utilisateur à supprimer (soft-delete) ses propres messages.</summary>
    public bool CanDeleteOwnMessages { get; set; } = false;

    /// <summary>Autoriser l'utilisateur à modifier les messages des autres utilisateurs.</summary>
    public bool CanEditOthersMessages { get; set; } = false;

    /// <summary>Autoriser l'utilisateur à supprimer (soft-delete) les messages des autres utilisateurs.</summary>
    public bool CanDeleteOthersMessages { get; set; } = false;

    /// <summary>Nombre maximum de messages par jour. 0 = illimité.</summary>
    public int MaxMessagesPerDay { get; set; } = 5;

    /// <summary>Nombre maximum de réponses par jour. 0 = illimité.</summary>
    public int MaxRepliesPerDay { get; set; } = 10;
}

/// <summary>Root du fichier infopopup_permissions.json.</summary>
public class PermissionsRoot
{
    /// <summary>Liste de toutes les permissions utilisateurs.</summary>
    public List<UserPermission> Permissions { get; set; } = new();
}
