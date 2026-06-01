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
    // Version du plugin embarquée dans l'URL : `?v=X.Y.Z.W`. Indispensable car les reverse
    // proxys (nginx etc.) cachent agressivement les .js et un Ctrl+Shift+R ne purge pas leur
    // cache. À chaque release l'URL change → tous les caches (navigateur, SW, proxy) refetchent
    // automatiquement. Le loader client.js propage ce `?v=…` aux modules qu'il charge.
    private static readonly string _versionQuery =
        "?v=" + (Plugin.Instance?.Version?.ToString() ?? "0");

    // Injection v4.0.1.0 : retry inline avec backoff au lieu d'une simple balise <script src>.
    //
    // Problème résolu : sur une fresh install, Jellyfin redémarre pour charger la DLL du plugin.
    // Pendant ~5-30 s le serveur renvoie 503 sur tout. Si le navigateur tente de fetch
    // `/InfoPopup/client.js` à ce moment-là, il se mange un 503 et n'essaie PAS de retry tout
    // seul — la balise <script> est marquée "done with error", point final. Conséquence :
    // aucun script plugin ne s'exécute → CSS pas injecté → boutons blancs jusqu'au Ctrl+Shift+R.
    //
    // Solution : injecter un loader inline qui retry jusqu'à 5 tentatives au total (load
    // initial + 4 retries) avec backoff (500ms, 1s, 1.5s, 2s entre tentatives — total max
    // ~5s) sur les erreurs réseau / 5xx. Délai suffisant pour que Jellyfin finisse son boot
    // post-install dans la quasi-totalité des cas.
    //
    // L'idempotence (`html.Contains("/InfoPopup/client.js")`) reste vérifiée parce que la chaîne
    // littérale est toujours présente dans le contenu du <script>.
    private static readonly string ScriptTag =
        "<script>(function(){var t=0;function l(){var s=document.createElement('script');" +
        "s.src='/InfoPopup/client.js" + _versionQuery + "';" +
        "s.onerror=function(){if(++t<5){setTimeout(l,500*t);}};" +
        "document.head.appendChild(s);}l();})();</script>";
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

        // v4.1.1.0 : `using` pour libérer le StreamReader avant le write de la réponse.
        // `leaveOpen: true` car `buffer` est utilisé après (await CopyToAsync ci-dessous).
        string html;
        using (var reader = new StreamReader(buffer, Encoding.UTF8, leaveOpen: true))
        {
            html = await reader.ReadToEndAsync();
        }

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

        // v3.8.9.0 : forcer la revalidation côté navigateur pour le HTML modifié.
        // Sans ça, un user qui installe le plugin alors qu'un onglet Jellyfin est déjà
        // ouvert garde un index.html caché AVANT injection → aucun script plugin chargé
        // → CSS non appliqué → boutons sans style (les fameux « boutons blancs »
        // observés au premier load post-install). Avec `no-cache, must-revalidate`, le
        // navigateur revalide systématiquement sur les chargements suivants → un simple
        // F5 normal suffit (plus besoin de Ctrl+Shift+R).
        //
        // Note : ne RÉSOUT PAS le tout premier affichage post-install si le browser a
        // déjà un cache long TTL (les headers d'AVANT l'install restent dans le cache).
        // Mais réduit la fenêtre de mauvaise UX à 1 reload classique au lieu d'un
        // hard-refresh explicite à enseigner aux utilisateurs.
        context.Response.Headers["Cache-Control"] = "no-cache, must-revalidate";
        context.Response.Headers["Pragma"] = "no-cache";
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
