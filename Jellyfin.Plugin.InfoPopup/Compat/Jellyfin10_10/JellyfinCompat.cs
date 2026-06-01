using System;
using System.Collections.Generic;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Compat;

/// <summary>
/// Implémentation Jellyfin 10.10.x de <see cref="IJellyfinCompat"/>.
/// Utilise <c>IUserManager.Users</c> (propriété, présente en 10.10) et
/// <c>user.HasPermission(PermissionKind.IsAdministrator)</c> avec PermissionKind
/// importé depuis <c>Jellyfin.Data.Enums</c> (namespace 10.10).
/// </summary>
/// <remarks>
/// Compilé uniquement par <c>Jellyfin.Plugin.InfoPopup.jf10.10.csproj</c>.
/// La 10.11 expose les mêmes méthodes (<c>HasPermission</c> via interface
/// <c>IHasPermissions</c>) MAIS sous d'autres namespaces (<c>Jellyfin.Database.Implementations.*</c>)
/// — c'est pour ça que le code DOIT exister en deux variants typés statiquement.
/// </remarks>
public sealed class JellyfinCompat : IJellyfinCompat
{
    private readonly IUserManager _userManager;
    private readonly ILogger<JellyfinCompat> _logger;

    /// <summary>Constructeur DI.</summary>
    public JellyfinCompat(IUserManager userManager, ILogger<JellyfinCompat> logger)
    {
        _userManager = userManager;
        _logger = logger;
        _logger.LogInformation("InfoPopup: JellyfinCompat (10.10.x) bound");
    }

    /// <inheritdoc />
    public IEnumerable<(string Id, string Name, bool IsAdmin)> EnumerateUsers()
    {
        foreach (var user in _userManager.Users)
        {
            if (user is null) continue;
            var id = PermissionService.NormalizeUserId(user.Id.ToString());
            var name = user.Username ?? string.Empty;
            var isAdmin = user.HasPermission(PermissionKind.IsAdministrator);
            yield return (id, name, isAdmin);
        }
    }

    /// <inheritdoc />
    public bool IsAdmin(Guid userId)
    {
        var user = _userManager.GetUserById(userId);
        return user is not null && user.HasPermission(PermissionKind.IsAdministrator);
    }
}
