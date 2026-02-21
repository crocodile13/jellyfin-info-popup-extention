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

        // Enregistre le filtre de démarrage qui injecte client.js dans index.html.
        // IStartupFilter est traité par ASP.NET Core lors du Configure(), après
        // que RegisterServices() ait été appelé — l'injection arrive donc au bon moment.
        serviceCollection.AddTransient<IStartupFilter, ScriptInjectionStartupFilter>();
    }
}
