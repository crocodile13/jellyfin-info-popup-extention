using Jellyfin.Plugin.InfoPopup.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
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
    }
}
