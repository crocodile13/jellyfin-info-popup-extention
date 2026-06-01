using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.InfoPopup.Compat;

/// <summary>
/// Implémentation Jellyfin 10.11.9+ de <see cref="IJellyfinCompat"/>.
/// Utilise <c>IUserManager.GetUsers()</c> (méthode, introduite en 10.11.9 par le
/// refactor EFcore) et accède à <c>user.Permissions</c> directement pour vérifier
/// le statut admin — l'entité <c>User</c> en 10.11 n'expose PAS de méthode
/// <c>HasPermission(PermissionKind)</c> (différence majeure vs 10.10 où la
/// méthode existe). Le check est fait via LINQ sur la collection.
/// </summary>
/// <remarks>
/// Compilé uniquement par <c>Jellyfin.Plugin.InfoPopup.jf10.11.csproj</c>.
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
        _logger.LogInformation("InfoPopup: JellyfinCompat (10.11.9+) bound");
    }

    /// <inheritdoc />
    public IEnumerable<(string Id, string Name, bool IsAdmin)> EnumerateUsers()
    {
        foreach (var user in _userManager.GetUsers())
        {
            if (user is null) continue;
            var id = PermissionService.NormalizeUserId(user.Id.ToString());
            var name = user.Username ?? string.Empty;
            var isAdmin = IsUserAdmin(user);
            yield return (id, name, isAdmin);
        }
    }

    /// <inheritdoc />
    public bool IsAdmin(Guid userId)
    {
        var user = _userManager.GetUserById(userId);
        return user is not null && IsUserAdmin(user);
    }

    /// <summary>
    /// Lookup local — l'entité User en 10.11 ne fournit pas HasPermission. On filtre
    /// la collection Permissions par Kind=IsAdministrator et Value=true.
    /// </summary>
    private static bool IsUserAdmin(Jellyfin.Database.Implementations.Entities.User user)
    {
        return user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value);
    }
}
