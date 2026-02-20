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
    /// <exception cref="ArgumentException">Si titre/corps vide ou trop long.</exception>
    public PopupMessage Create(string title, string body, string publishedBy)
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
            PublishedBy = publishedBy
        };

        _lock.EnterWriteLock();
        try
        {
            Config.Messages.Add(message);
            SaveConfig();
            _logger.LogInformation("InfoPopup: message publié '{Title}' par {UserId}", message.Title, publishedBy);
        }
        finally { _lock.ExitWriteLock(); }

        return message;
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
