using Jellyfin.Plugin.InfoPopup.Compat;
using Jellyfin.Plugin.InfoPopup.Middleware;
using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.InfoPopup;

/// <summary>Enregistre les services du plugin dans le conteneur DI de Jellyfin.</summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<MessageStore>();
        serviceCollection.AddSingleton<SeenTrackerService>();
        serviceCollection.AddSingleton<ReplyStoreService>();
        serviceCollection.AddSingleton<PermissionService>();

        // v4.1.0.0 : la frontière IJellyfinCompat isole le code version-dependent.
        // L'implémentation concrète (JellyfinCompat) est fournie par UN SEUL csproj
        // à la fois — soit Compat/Jellyfin10_10/JellyfinCompat.cs (variant jf10.10),
        // soit Compat/Jellyfin10_11/JellyfinCompat.cs (variant jf10.11). L'autre est
        // exclu via <Compile Remove> dans le csproj correspondant.
        serviceCollection.AddSingleton<IJellyfinCompat, JellyfinCompat>();

        // Enregistre le filtre de démarrage qui injecte client.js dans index.html.
        // IStartupFilter est traité par ASP.NET Core lors du Configure(), après
        // que RegisterServices() ait été appelé — l'injection arrive donc au bon moment.
        serviceCollection.AddTransient<IStartupFilter, ScriptInjectionStartupFilter>();
    }
}
