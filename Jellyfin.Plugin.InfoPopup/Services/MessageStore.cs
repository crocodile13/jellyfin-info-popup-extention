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

    /// <summary>
    /// Accède à la configuration du plugin.
    /// La référence est capturée une fois par opération à l'intérieur du lock
    /// pour garantir la cohérence si Jellyfin recharge la configuration.
    /// </summary>
    private static Configuration.PluginConfiguration GetConfig() =>
        Plugin.Instance?.Configuration
        ?? throw new InvalidOperationException("InfoPopup: Plugin.Instance est null.");

    private static void SaveConfig() => Plugin.Instance?.SaveConfiguration();

    /// <summary>Retourne tous les messages, du plus récent au plus ancien.</summary>
    public List<PopupMessage> GetAll()
    {
        _lock.EnterReadLock();
        try
        {
            var cfg = GetConfig();
            return cfg.Messages.OrderByDescending(m => m.PublishedAt).ToList();
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>Retourne un message par son ID, ou null.</summary>
    public PopupMessage? GetById(string id)
    {
        _lock.EnterReadLock();
        try
        {
            var cfg = GetConfig();
            return cfg.Messages.FirstOrDefault(m => m.Id == id);
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Crée et persiste un nouveau message.
    /// La validation ici est la source de vérité : elle s'applique même si le DTO
    /// est contourné (appel direct à ce service, tests, etc.).
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
            // Capturer la référence une seule fois pour travailler sur le même objet
            // pendant toute la durée de l'opération (cohérence si rechargement config).
            var cfg = GetConfig();
            cfg.Messages.Add(message);
            SaveConfig();

            var targetInfo = message.TargetUserIds.Count > 0
                ? $"{message.TargetUserIds.Count} utilisateur(s) ciblé(s)"
                : "tous les utilisateurs";
            _logger.LogInformation(
                "InfoPopup: message publié '{Title}' par {UserId} → {Target}",
                message.Title, publishedBy, targetInfo);
        }
        finally { _lock.ExitWriteLock(); }

        return message;
    }

    /// <summary>
    /// Met à jour le titre, le corps et le ciblage d'un message existant sans changer son ID.
    /// Le suivi des vues est préservé : un message modifié ne se réaffiche pas
    /// aux utilisateurs qui l'avaient déjà vu.
    /// </summary>
    /// <param name="id">ID du message à mettre à jour.</param>
    /// <param name="title">Nouveau titre.</param>
    /// <param name="body">Nouveau corps.</param>
    /// <param name="targetUserIds">Nouveaux IDs cibles. Null ou vide = tous les utilisateurs.</param>
    /// <returns>
    /// Un snapshot du message mis à jour, ou <c>null</c> si l'ID est introuvable.
    /// Le snapshot est capturé à l'intérieur du lock pour éviter toute race condition
    /// (TOCTOU) entre la mise à jour et la lecture du résultat par l'appelant.
    /// </returns>
    public PopupMessage? Update(string id, string title, string body, List<string>? targetUserIds = null)
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
            var cfg = GetConfig();
            var msg = cfg.Messages.FirstOrDefault(m => m.Id == id);
            if (msg is null) return null;
            msg.Title = title.Trim();
            msg.Body = body;
            msg.TargetUserIds = targetUserIds?.Count > 0
                ? new List<string>(targetUserIds)
                : new List<string>();
            SaveConfig();

            var targetInfo = msg.TargetUserIds.Count > 0
                ? $"{msg.TargetUserIds.Count} utilisateur(s) ciblé(s)"
                : "tous les utilisateurs";
            _logger.LogInformation(
                "InfoPopup: message '{Id}' mis à jour — titre : '{Title}', cible : {Target}",
                id, msg.Title, targetInfo);

            // Retourner un snapshot immutable capturé dans le lock.
            // Évite la TOCTOU qu'aurait causé un second appel à GetById() depuis le controller.
            return new PopupMessage
            {
                Id = msg.Id,
                Title = msg.Title,
                Body = msg.Body,
                PublishedAt = msg.PublishedAt,
                PublishedBy = msg.PublishedBy,
                TargetUserIds = new List<string>(msg.TargetUserIds)
            };
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
            var cfg = GetConfig();
            var before = cfg.Messages.Count;
            cfg.Messages.RemoveAll(m => idSet.Contains(m.Id));
            var deleted = before - cfg.Messages.Count;
            if (deleted > 0) SaveConfig();
            _logger.LogInformation("InfoPopup: {Count} message(s) supprimé(s) définitivement", deleted);
            return deleted;
        }
        finally { _lock.ExitWriteLock(); }
    }
}
