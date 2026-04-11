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
/// Gestion des droits utilisateurs non-admin.
/// Persistance dans infopopup_permissions.json. Thread-safe via ReaderWriterLockSlim.
/// Cache en mémoire pour éviter les lectures disque répétées entre chaque opération.
/// </summary>
public class PermissionService
{
    private readonly ILogger<PermissionService> _logger;
    private readonly string _dataFilePath;
    private readonly ReaderWriterLockSlim _lock = new(LockRecursionPolicy.NoRecursion);

    /// <summary>
    /// Cache mémoire du store JSON.
    /// null = cache froid (première lecture depuis le disque).
    /// Invalidé (remis à null) uniquement par WriteStore.
    /// Toujours accédé à l'intérieur du _lock.
    /// </summary>
    private PermissionsRoot? _cache;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    /// <summary>Initialise le service. Crée infopopup_permissions.json s'il n'existe pas.</summary>
    public PermissionService(IApplicationPaths appPaths, ILogger<PermissionService> logger)
    {
        _logger = logger;
        _dataFilePath = Path.Combine(appPaths.PluginConfigurationsPath, "infopopup_permissions.json");
        if (!File.Exists(_dataFilePath))
        {
            // Pas encore de lock ici : appel unique au démarrage depuis le constructeur.
            var initial = new PermissionsRoot();
            File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(initial, _jsonOptions));
            _cache = initial;
            _logger.LogInformation("InfoPopup: infopopup_permissions.json créé à {Path}", _dataFilePath);
        }
    }

    // ── Lecture / écriture ───────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne le store depuis le cache mémoire si disponible,
    /// sinon depuis le disque (et met le cache à jour).
    /// Doit être appelé à l'intérieur d'un lock (_lock.Enter{Read|Write}Lock).
    /// </summary>
    private PermissionsRoot ReadStore()
    {
        if (_cache is not null) return _cache;

        try
        {
            var json = File.ReadAllText(_dataFilePath);
            _cache = JsonSerializer.Deserialize<PermissionsRoot>(json, _jsonOptions) ?? new PermissionsRoot();
            return _cache;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "InfoPopup: impossible de lire infopopup_permissions.json, reset");
            _cache = new PermissionsRoot();
            return _cache;
        }
    }

    /// <summary>
    /// Persiste le store sur disque et met le cache à jour.
    /// Doit être appelé à l'intérieur d'un WriteLock.
    /// </summary>
    private void WriteStore(PermissionsRoot store)
    {
        File.WriteAllText(_dataFilePath, JsonSerializer.Serialize(store, _jsonOptions));
        _cache = store;
    }

    // ── API publique ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne les droits d'un utilisateur, ou un objet par défaut si absent.
    /// Les droits par défaut sont tous à false (accès minimal).
    /// </summary>
    /// <param name="userId">ID Jellyfin de l'utilisateur.</param>
    /// <returns>Les droits de l'utilisateur, jamais null.</returns>
    public UserPermission GetOrDefault(string userId)
    {
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            return store.Permissions.FirstOrDefault(p => p.UserId == userId)
                ?? new UserPermission { UserId = userId };
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>Retourne tous les droits définis, sans ordre particulier.</summary>
    public List<UserPermission> GetAll()
    {
        _lock.EnterReadLock();
        try
        {
            var store = ReadStore();
            return store.Permissions.ToList();
        }
        finally { _lock.ExitReadLock(); }
    }

    /// <summary>
    /// Insère ou remplace les droits d'un utilisateur (clé : UserId).
    /// Si une entrée avec le même UserId existe, elle est remplacée intégralement.
    /// </summary>
    /// <param name="perm">Les droits à persister.</param>
    public void Upsert(UserPermission perm)
    {
        _lock.EnterWriteLock();
        try
        {
            var store = ReadStore();
            var existing = store.Permissions.FindIndex(p => p.UserId == perm.UserId);
            if (existing >= 0)
                store.Permissions[existing] = perm;
            else
                store.Permissions.Add(perm);
            WriteStore(store);
            _logger.LogInformation(
                "InfoPopup: droits mis à jour pour l'utilisateur {UserId}", perm.UserId);
        }
        finally { _lock.ExitWriteLock(); }
    }

    /// <summary>
    /// Supprime les droits d'un utilisateur.
    /// </summary>
    /// <param name="userId">ID Jellyfin de l'utilisateur.</param>
    /// <returns><c>true</c> si l'entrée existait et a été supprimée, <c>false</c> sinon.</returns>
    public bool DeleteByUserId(string userId)
    {
        _lock.EnterWriteLock();
        try
        {
            var store = ReadStore();
            var before = store.Permissions.Count;
            store.Permissions.RemoveAll(p => p.UserId == userId);
            var deleted = before - store.Permissions.Count > 0;
            if (deleted)
            {
                WriteStore(store);
                _logger.LogInformation("InfoPopup: droits supprimés pour l'utilisateur {UserId}", userId);
            }
            return deleted;
        }
        finally { _lock.ExitWriteLock(); }
    }
}
