using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.InfoPopup.Middleware;

/// <summary>
/// Middleware qui injecte client.js dans la page index.html de Jellyfin.
/// Nécessaire car Jellyfin 10.9+ est une SPA React et n'exécute pas les scripts
/// injectés via innerHTML dans les pages de configuration de plugins.
/// </summary>
public sealed class ScriptInjectionMiddleware
{
    private const string ScriptTag = "<script src=\"/InfoPopup/client.js\"></script>";
    private readonly RequestDelegate _next;

    /// <summary>Constructeur.</summary>
    public ScriptInjectionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    /// <summary>Intercepte index.html et y injecte notre script.</summary>
    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        // On ne traite que les URLs d'entrée de la SPA Jellyfin
        if (!IsWebUiPath(path))
        {
            await _next(context);
            return;
        }

        // Forcer une réponse non-compressée pour pouvoir lire le HTML en clair
        context.Request.Headers["Accept-Encoding"] = "identity";

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context);
        }
        catch
        {
            context.Response.Body = originalBody;
            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody);
            throw;
        }

        context.Response.Body = originalBody;
        buffer.Position = 0;

        // Passer en l'état tout ce qui n'est pas un 200 HTML
        var contentType = context.Response.ContentType ?? string.Empty;
        if (context.Response.StatusCode != 200 ||
            !contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
        {
            await buffer.CopyToAsync(originalBody);
            return;
        }

        var html = await new StreamReader(buffer, Encoding.UTF8).ReadToEndAsync();

        // Ne pas injecter deux fois
        if (html.Contains("/InfoPopup/client.js", StringComparison.Ordinal))
        {
            var raw = Encoding.UTF8.GetBytes(html);
            context.Response.ContentLength = raw.Length;
            await originalBody.WriteAsync(raw);
            return;
        }

        var injected = InjectScript(html);
        var bytes = Encoding.UTF8.GetBytes(injected);
        context.Response.ContentLength = bytes.Length;
        await originalBody.WriteAsync(bytes);
    }

    private static bool IsWebUiPath(string path) =>
        path is "/" or "/web" or "/web/"
        || path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase);

    private static string InjectScript(string html)
    {
        // Injection avant </body> de préférence, sinon avant </html>, sinon en fin de fichier
        if (html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            return html.Replace("</body>", ScriptTag + "</body>", StringComparison.OrdinalIgnoreCase);

        if (html.Contains("</html>", StringComparison.OrdinalIgnoreCase))
            return html.Replace("</html>", ScriptTag + "</html>", StringComparison.OrdinalIgnoreCase);

        return html + ScriptTag;
    }
}
