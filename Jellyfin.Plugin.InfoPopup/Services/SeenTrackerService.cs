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
/// Suivi des messages vus par chaque utilisateur.
/// Persistance dans infopopup_seen.json. Thread-safe via ReaderWriterLockSlim.
/// Cache en mémoire pour éviter les lectures disque répétées entre chaque opération.
/// </summary>
public class SeenTrackerService
{
    private readonly ILogger<SeenTrackerService> _logger;
    private readonly string _dataFilePath;
    private readonly ReaderWriterLockSlim _lock = new(LockRecursionPolicy.NoRecursion);

    /// <summary>
    /// Cache mémoire du store JSON.
    /// null = cache froid (première lecture depuis le disque).
    /// Invalidé (remis à null) uniquement par WriteStore.
    /// Toujours accédé à l'intérieur du _lock.
    /// </summary>
    private SeenStore? _cache;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    /// <summary>Initialise le service. Crée infopopup_seen.json s'il n'existe pas.</summary>
    public SeenTrackerService(IApplicationPaths appPaths, ILogger<SeenTrackerService> logger)
    {
        _logger = logger;
        _dataFilePath = Path.Combine(appPaths.PluginConfigurationsPath, "infopopup_seen.json");
        if (!File.Exists(_dataFilePath))
        {
            // Pas encore de lock ici : appel unique au démarrage depuis le constructeur.
            var initial = new SeenStore();
            File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(initial, _jsonOptions));
            _cache = initial;
            _logger.LogInformation("InfoPopup: infopopup_seen.json créé à {Path}", _dataFilePath);
        }
    }

    // ── Lecture / écriture ───────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne le store depuis le cache mémoire si disponible,
    /// sinon depuis le disque (et met le cache à jour).
    /// Doit être appelé à l'intérieur d'un lock (_lock.Enter{Read|Write}Lock).
    /// </summary>
    private SeenStore ReadStore()
    {
        if (_cache is not null) return _cache;

        try
        {
            var json = File.ReadAllText(_dataFilePath);
            _cache = JsonSerializer.Deserialize<SeenStore>(json, _jsonOptions) ?? new SeenStore();
            return _cache;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "InfoPopup: impossible de lire infopopup_seen.json, reset");
            _cache = new SeenStore();
            return _cache;
        }
    }

    /// <summary>
    /// Persiste le store sur disque et met le cache à jour.
    /// Doit être appelé à l'intérieur d'un WriteLock.
    /// </summary>
    private void WriteStore(SeenStore store)
    {
        File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(store, _jsonOptions));
        _cache = store;
    }

    // ── API publique ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne les IDs de messages non encore vus par l'utilisateur,
    /// parmi les messages existants uniquement (les supprimés sont exclus).
    /// </summary>
    public List<string> GetUnseenIds(string userId, IEnumerable<string> allExistingIds)
    {
        var existingSet = new HashSet<string>(allExistingIds);
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            var seen = store.Records.FirstOrDefault(r => r.UserId == userId)?.SeenMessageIds
                       ?? new List<string>();
            return existingSet.Where(id => !seen.Contains(id)).ToList();
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Marque des messages comme vus. Nettoie les orphelins (messages supprimés) de façon paresseuse.
    /// </summary>
    public void MarkAsSeen(string userId, IEnumerable<string> messageIds, IEnumerable<string> allExistingIds)
    {
        var existingSet = new HashSet<string>(allExistingIds);
        var newSeen = new HashSet<string>(messageIds);

        _lock.EnterWriteLock();
        try
        {
            var store = ReadStore();
            var record = store.Records.FirstOrDefault(r => r.UserId == userId);
            if (record is null)
            {
                record = new SeenRecord { UserId = userId };
                store.Records.Add(record);
            }

            foreach (var id in newSeen)
                if (!record.SeenMessageIds.Contains(id))
                    record.SeenMessageIds.Add(id);

            // Nettoyage paresseux : retirer les orphelins (messages supprimés)
            record.SeenMessageIds.RemoveAll(id => !existingSet.Contains(id));

            WriteStore(store);
        }
        finally { _lock.ExitWriteLock(); }
    }
}
