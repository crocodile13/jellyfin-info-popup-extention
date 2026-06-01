using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.InfoPopup.Services;

/// <summary>
/// Frontière unique pour toutes les APIs Jellyfin dont la signature a changé
/// entre versions majeures du serveur (v4.1.0.0).
/// </summary>
/// <remarks>
/// Une implémentation par variant cible est fournie dans <c>Compat/Jellyfin10_XX/</c> :
/// le csproj <c>jf10.10</c> compile celle de <c>Jellyfin10_10</c> (et exclut l'autre via
/// <c>Compile Remove</c>), <c>jf10.11</c> fait l'inverse. Cette interface ne doit JAMAIS
/// dépendre d'un type Jellyfin propre à une version — uniquement des primitives .NET
/// (<see cref="string"/>, <see cref="Guid"/>, tuples) pour rester stable des deux côtés.
/// Tout nouvel appel à une API Jellyfin instable doit passer par une nouvelle méthode
/// ajoutée ici, pas par un nouvel appel direct dispersé dans le contrôleur.
/// </remarks>
public interface IJellyfinCompat
{
    /// <summary>
    /// Énumère tous les utilisateurs Jellyfin avec leur statut admin.
    /// </summary>
    /// <returns>Tuples <c>(Id format "N", Username, IsAdmin)</c>. Les IDs sont déjà
    /// normalisés au format hex 32-chars sans tirets (cf. <see cref="PermissionService.NormalizeUserId"/>).</returns>
    IEnumerable<(string Id, string Name, bool IsAdmin)> EnumerateUsers();

    /// <summary>
    /// Détermine si un utilisateur est administrateur Jellyfin.
    /// </summary>
    /// <param name="userId">ID utilisateur (format "N" ou "D" — sera normalisé).</param>
    /// <returns><c>true</c> si admin ; <c>false</c> si non-admin ou utilisateur introuvable.</returns>
    bool IsAdmin(Guid userId);
}
