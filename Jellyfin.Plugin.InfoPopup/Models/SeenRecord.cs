using System.Collections.Generic;

namespace Jellyfin.Plugin.InfoPopup.Models;

/// <summary>Registre des messages vus par un utilisateur donné.</summary>
public class SeenRecord
{
    /// <summary>ID Jellyfin de l'utilisateur.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>IDs des messages déjà vus et fermés par cet utilisateur.</summary>
    public List<string> SeenMessageIds { get; set; } = new();
}

/// <summary>Racine du fichier JSON infopopup_seen.json.</summary>
public class SeenStore
{
    /// <summary>Tous les registres utilisateur.</summary>
    public List<SeenRecord> Records { get; set; } = new();
}
