using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using Jellyfin.Plugin.InfoPopup.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Services;

/// <summary>
/// Suivi des réponses utilisateurs aux messages popup.
/// Persistance dans infopopup_replies.json. Thread-safe via ReaderWriterLockSlim.
/// Cache en mémoire pour éviter les lectures disque répétées entre chaque opération.
/// </summary>
public class ReplyStoreService
{
    private readonly ILogger<ReplyStoreService> _logger;
    private readonly string _dataFilePath;
    private readonly ReaderWriterLockSlim _lock = new(LockRecursionPolicy.NoRecursion);

    /// <summary>
    /// Cache mémoire du store JSON.
    /// null = cache froid (première lecture depuis le disque).
    /// Invalidé (remis à null) uniquement par WriteStore.
    /// Toujours accédé à l'intérieur du _lock.
    /// </summary>
    private RepliesRoot? _cache;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    /// <summary>Initialise le service. Crée infopopup_replies.json s'il n'existe pas.</summary>
    public ReplyStoreService(IApplicationPaths appPaths, ILogger<ReplyStoreService> logger)
    {
        _logger = logger;
        _dataFilePath = Path.Combine(appPaths.PluginConfigurationsPath, "infopopup_replies.json");
        if (!File.Exists(_dataFilePath))
        {
            // Pas encore de lock ici : appel unique au démarrage depuis le constructeur.
            var initial = new RepliesRoot();
            File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(initial, _jsonOptions));
            _cache = initial;
            _logger.LogInformation("InfoPopup: infopopup_replies.json créé à {Path}", _dataFilePath);
        }
    }

    // ── Lecture / écriture ───────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne le store depuis le cache mémoire si disponible,
    /// sinon depuis le disque (et met le cache à jour).
    /// Doit être appelé à l'intérieur d'un lock (_lock.Enter{Read|Write}Lock).
    /// </summary>
    private RepliesRoot ReadStore()
    {
        if (_cache is not null) return _cache;

        try
        {
            var json = File.ReadAllText(_dataFilePath);
            _cache = JsonSerializer.Deserialize<RepliesRoot>(json, _jsonOptions) ?? new RepliesRoot();
            return _cache;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "InfoPopup: impossible de lire infopopup_replies.json, reset");
            _cache = new RepliesRoot();
            return _cache;
        }
    }

    /// <summary>
    /// Persiste le store sur disque et met le cache à jour.
    /// Doit être appelé à l'intérieur d'un WriteLock.
    /// </summary>
    private void WriteStore(RepliesRoot store)
    {
        File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(store, _jsonOptions));
        _cache = store;
    }

    // ── API publique ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Ajoute une réponse d'un utilisateur à un message.
    /// Valide la longueur maximale depuis la configuration du plugin.
    /// Un utilisateur ne peut répondre qu'une seule fois à un message donné.
    /// </summary>
    /// <param name="messageId">ID du message auquel l'utilisateur répond.</param>
    /// <param name="userId">ID Jellyfin de l'utilisateur.</param>
    /// <param name="body">Contenu de la réponse.</param>
    /// <param name="recipientUserId">ID Jellyfin du destinataire de la réponse (SentByUserId du message).</param>
    /// <param name="maxRepliesPerDay">Limite journalière de réponses. 0 = illimité.</param>
    /// <returns>La réponse créée.</returns>
    /// <exception cref="ArgumentException">Si le corps est vide ou dépasse la longueur maximale.</exception>
    /// <exception cref="InvalidOperationException">Si l'utilisateur a déjà répondu ou atteint sa limite journalière.</exception>
    public MessageReply AddReply(
        string messageId,
        string userId,
        string body,
        string recipientUserId = "",
        int maxRepliesPerDay = 0)
    {
        if (string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Le corps de la réponse ne peut pas être vide.", nameof(body));

        var maxLength = Plugin.Instance?.Configuration.ReplyMaxLength ?? 500;
        if (body.Length > maxLength)
            throw new ArgumentException($"La réponse ne peut pas dépasser {maxLength} caractères.", nameof(body));

        var reply = new MessageReply
        {
            Id = Guid.NewGuid().ToString(),
            MessageId = messageId,
            UserId = userId,
            Body = body,
            RepliedAt = DateTime.UtcNow,
            RecipientUserId = recipientUserId
        };

        _lock.EnterWriteLock();
        try
        {
            var store = ReadStore();

            // Un utilisateur ne peut répondre qu'une seule fois à un message donné.
            if (store.Replies.Any(r => r.MessageId == messageId && r.UserId == userId))
                throw new InvalidOperationException("Vous avez déjà répondu à ce message.");

            // Vérifier la limite journalière de réponses.
            if (maxRepliesPerDay > 0)
            {
                var today = DateTime.UtcNow.Date;
                var countToday = store.Replies.Count(r => r.UserId == userId && r.RepliedAt >= today);
                if (countToday >= maxRepliesPerDay)
                    throw new InvalidOperationException("Limite journalière de réponses atteinte.");
            }

            store.Replies.Add(reply);
            WriteStore(store);
            _logger.LogInformation(
                "InfoPopup: réponse ajoutée au message {MessageId} par l'utilisateur {UserId}",
                messageId, userId);
        }
        finally { _lock.ExitWriteLock(); }

        return reply;
    }

    /// <summary>
    /// Vérifie si un utilisateur a déjà répondu à un message donné.
    /// </summary>
    /// <param name="messageId">ID du message.</param>
    /// <param name="userId">ID Jellyfin de l'utilisateur.</param>
    /// <returns><c>true</c> si l'utilisateur a déjà répondu, <c>false</c> sinon.</returns>
    public bool HasUserReplied(string messageId, string userId)
    {
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            return store.Replies.Any(r => r.MessageId == messageId && r.UserId == userId);
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Retourne toutes les réponses reçues par un utilisateur (destinataire),
    /// triées par date ascendante.
    /// </summary>
    /// <param name="recipientUserId">ID Jellyfin de l'utilisateur destinataire.</param>
    public List<MessageReply> GetByRecipient(string recipientUserId)
    {
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            return store.Replies
                .Where(r => r.RecipientUserId == recipientUserId)
                .OrderBy(r => r.RepliedAt)
                .ToList();
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Retourne toutes les réponses pour un message donné, triées par date ascendante.
    /// </summary>
    public List<MessageReply> GetByMessageId(string messageId)
    {
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            return store.Replies
                .Where(r => r.MessageId == messageId)
                .OrderBy(r => r.RepliedAt)
                .ToList();
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Retourne toutes les réponses, triées par date ascendante.
    /// </summary>
    public List<MessageReply> GetAll()
    {
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            return store.Replies
                .OrderBy(r => r.RepliedAt)
                .ToList();
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Supprime une réponse par son ID.
    /// </summary>
    /// <returns><c>true</c> si la réponse a été trouvée et supprimée, <c>false</c> sinon.</returns>
    public bool DeleteReply(string replyId)
    {
        _lock.EnterWriteLock();
        try
        {
            var store = ReadStore();
            var before = store.Replies.Count;
            store.Replies.RemoveAll(r => r.Id == replyId);
            var deleted = before - store.Replies.Count > 0;
            if (deleted)
            {
                WriteStore(store);
                _logger.LogInformation("InfoPopup: réponse {ReplyId} supprimée", replyId);
            }
            return deleted;
        }
        finally { _lock.ExitWriteLock(); }
    }

    /// <summary>
    /// Supprime en cascade toutes les réponses associées aux messages donnés.
    /// </summary>
    /// <returns>Nombre de réponses supprimées.</returns>
    public int DeleteByMessageIds(IEnumerable<string> messageIds)
    {
        var idSet = new HashSet<string>(messageIds);
        if (idSet.Count == 0) return 0;

        _lock.EnterWriteLock();
        try
        {
            var store = ReadStore();
            var before = store.Replies.Count;
            store.Replies.RemoveAll(r => idSet.Contains(r.MessageId));
            var deleted = before - store.Replies.Count;
            if (deleted > 0)
            {
                WriteStore(store);
                _logger.LogInformation("InfoPopup: {Count} réponse(s) supprimée(s) en cascade", deleted);
            }
            return deleted;
        }
        finally { _lock.ExitWriteLock(); }
    }
}
