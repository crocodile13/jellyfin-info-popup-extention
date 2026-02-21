using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.InfoPopup.Middleware;

/// <summary>
/// Enregistre le ScriptInjectionMiddleware dans le pipeline ASP.NET Core au démarrage.
/// Doit être enregistré AVANT le build de l'application pour être pris en compte.
/// </summary>
public sealed class ScriptInjectionStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<ScriptInjectionMiddleware>();
            next(app);
        };
    }
}
