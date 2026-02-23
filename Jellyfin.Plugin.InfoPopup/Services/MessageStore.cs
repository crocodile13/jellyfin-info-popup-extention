using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Jellyfin.Plugin.InfoPopup.Models;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Services;

/// <summary>
/// Service de gestion des messages popup. Thread-safe via ReaderWriterLockSlim.
/// </summary>
public class MessageStore
{
    private readonly ILogger<MessageStore> _logger;
    private readonly ReaderWriterLockSlim _lock = new(LockRecursionPolicy.NoRecursion);

    /// <summary>Initialise le store.</summary>
    public MessageStore(ILogger<MessageStore> logger) => _logger = logger;

    private static Configuration.PluginConfiguration Config =>
        Plugin.Instance?.Configuration
        ?? throw new InvalidOperationException("InfoPopup: Plugin.Instance est null.");

    private static void SaveConfig() => Plugin.Instance?.SaveConfiguration();

    /// <summary>Retourne tous les messages, du plus récent au plus ancien.</summary>
    public List<PopupMessage> GetAll()
    {
        _lock.EnterReadLock();
        try { return Config.Messages.OrderByDescending(m => m.PublishedAt).ToList(); }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>Retourne un message par son ID, ou null.</summary>
    public PopupMessage? GetById(string id)
    {
        _lock.EnterReadLock();
        try { return Config.Messages.FirstOrDefault(m => m.Id == id); }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Crée et persiste un nouveau message.
    /// </summary>
    /// <param name="title">Titre du message.</param>
    /// <param name="body">Corps texte brut.</param>
    /// <param name="publishedBy">ID Jellyfin de l'admin.</param>
    /// <param name="targetUserIds">IDs ciblés. Null ou vide = tous les utilisateurs.</param>
    /// <exception cref="ArgumentException">Si titre/corps vide ou trop long.</exception>
    public PopupMessage Create(string title, string body, string publishedBy, List<string>? targetUserIds = null)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Le titre ne peut pas être vide.", nameof(title));
        if (title.Length > 200)
            throw new ArgumentException("Le titre ne peut pas dépasser 200 caractères.", nameof(title));
        if (string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Le corps du message ne peut pas être vide.", nameof(body));
        if (body.Length > 10_000)
            throw new ArgumentException("Le corps ne peut pas dépasser 10 000 caractères.", nameof(body));

        var message = new PopupMessage
        {
            Id = Guid.NewGuid().ToString(),
            Title = title.Trim(),
            Body = body,
            PublishedAt = DateTime.UtcNow,
            PublishedBy = publishedBy,
            TargetUserIds = targetUserIds?.Count > 0 ? new List<string>(targetUserIds) : new List<string>()
        };

        _lock.EnterWriteLock();
        try
        {
            Config.Messages.Add(message);
            SaveConfig();
            var targetInfo = message.TargetUserIds.Count > 0
                ? $"{message.TargetUserIds.Count} utilisateur(s) ciblé(s)"
                : "tous les utilisateurs";
            _logger.LogInformation("InfoPopup: message publié '{Title}' par {UserId} → {Target}", message.Title, publishedBy, targetInfo);
        }
        finally { _lock.ExitWriteLock(); }

        return message;
    }

    /// <summary>
    /// Met à jour le titre et le corps d'un message existant sans changer son ID.
    /// Le suivi des vues (<c>infopopup_seen.json</c>) est préservé : un message
    /// modifié ne se réaffiche pas aux utilisateurs qui l'avaient déjà vu.
    /// </summary>
    /// <param name="id">ID du message à modifier.</param>
    /// <param name="title">Nouveau titre (max 200 car.).</param>
    /// <param name="body">Nouveau corps (max 10 000 car., supporte le markup IP).</param>
    /// <returns><c>true</c> si trouvé et mis à jour, <c>false</c> si introuvable.</returns>
    public bool Update(string id, string title, string body)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Le titre ne peut pas être vide.", nameof(title));
        if (title.Length > 200)
            throw new ArgumentException("Le titre ne peut pas dépasser 200 caractères.", nameof(title));
        if (string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Le corps du message ne peut pas être vide.", nameof(body));
        if (body.Length > 10_000)
            throw new ArgumentException("Le corps ne peut pas dépasser 10 000 caractères.", nameof(body));

        _lock.EnterWriteLock();
        try
        {
            var msg = Config.Messages.FirstOrDefault(m => m.Id == id);
            if (msg is null) return false;
            msg.Title = title.Trim();
            msg.Body = body;
            SaveConfig();
            _logger.LogInformation("InfoPopup: message '{Id}' mis à jour — nouveau titre : '{Title}'", id, msg.Title);
            return true;
        }
        finally { _lock.ExitWriteLock(); }
    }

    /// <summary>
    /// Supprime définitivement des messages. Un message supprimé disparaît
    /// partout et pour tous les utilisateurs, sans exception.
    /// </summary>
    /// <returns>Nombre de messages supprimés.</returns>
    public int DeleteMany(IEnumerable<string> ids)
    {
        var idSet = new HashSet<string>(ids);
        if (idSet.Count == 0) return 0;

        _lock.EnterWriteLock();
        try
        {
            var before = Config.Messages.Count;
            Config.Messages.RemoveAll(m => idSet.Contains(m.Id));
            var deleted = before - Config.Messages.Count;
            if (deleted > 0) SaveConfig();
            _logger.LogInformation("InfoPopup: {Count} message(s) supprimé(s) définitivement", deleted);
            return deleted;
        }
        finally { _lock.ExitWriteLock(); }
    }
}
