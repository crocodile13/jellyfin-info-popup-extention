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
/// </summary>
public class SeenTrackerService
{
    private readonly ILogger<SeenTrackerService> _logger;
    private readonly string _dataFilePath;
    private readonly ReaderWriterLockSlim _lock = new(LockRecursionPolicy.NoRecursion);

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
            WriteStore(new SeenStore());
            _logger.LogInformation("InfoPopup: infopopup_seen.json créé à {Path}", _dataFilePath);
        }
    }

    private SeenStore ReadStore()
    {
        try
        {
            var json = File.ReadAllText(_dataFilePath);
            return JsonSerializer.Deserialize<SeenStore>(json, _jsonOptions) ?? new SeenStore();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "InfoPopup: impossible de lire infopopup_seen.json, reset");
            return new SeenStore();
        }
    }

    private void WriteStore(SeenStore store) =>
        File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(store, _jsonOptions));

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
