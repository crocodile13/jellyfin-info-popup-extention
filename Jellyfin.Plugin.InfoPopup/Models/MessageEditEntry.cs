using System;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Entrée dans l'historique de modification d'un message.</summary>
public class MessageEditEntry
{
    /// <summary>Date et heure UTC de la modification.</summary>
    public DateTime EditedAt { get; set; } = DateTime.UtcNow;

    /// <summary>ID Jellyfin de l'utilisateur qui a effectué la modification.</summary>
    public string EditedByUserId { get; set; } = string.Empty;

    /// <summary>Titre avant la modification.</summary>
    public string OldTitle { get; set; } = string.Empty;

    /// <summary>Corps avant la modification.</summary>
    public string OldBody { get; set; } = string.Empty;
}
