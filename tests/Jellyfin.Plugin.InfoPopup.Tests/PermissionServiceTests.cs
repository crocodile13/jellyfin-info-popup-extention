using Jellyfin.Plugin.InfoPopup.Services;
using Xunit;

namespace Jellyfin.Plugin.InfoPopup.Tests;

/// <summary>
/// Tests pour <see cref="PermissionService.NormalizeUserId"/> — le helper le plus critique
/// du plugin (cf. CLAUDE.md [[guid-format-userid]]). Si ces tests cassent, les droits
/// utilisateur deviennent silencieusement inopérants car les clés Admin ("D" avec tirets)
/// ne matchent plus les claims utilisateur ("N" sans tirets).
/// </summary>
public class PermissionServiceTests
{
    // ── Format N (canonique, 32 hex sans tirets) ─────────────────────────────────────

    [Fact]
    public void NormalizeUserId_FormatN_StaysN()
    {
        // Input déjà au format "N" (32 hex sans tirets) — doit rester identique.
        const string id = "abcdef0123456789abcdef0123456789";
        Assert.Equal(id, PermissionService.NormalizeUserId(id));
    }

    [Fact]
    public void NormalizeUserId_FormatN_Lowercase()
    {
        // Le format "N" de Guid est en lowercase ; un input uppercase doit être lowercased.
        var input = "ABCDEF0123456789ABCDEF0123456789";
        var expected = "abcdef0123456789abcdef0123456789";
        Assert.Equal(expected, PermissionService.NormalizeUserId(input));
    }

    // ── Format D (avec tirets) → conversion vers N ───────────────────────────────────

    [Fact]
    public void NormalizeUserId_FormatD_StripsHyphens()
    {
        // Cas critique : Admin enregistre avec User.Id.ToString() = "D",
        // utilisateur lit via claim = "N". Sans normalisation, mismatch.
        var formatD = "abcdef01-2345-6789-abcd-ef0123456789";
        var formatN = "abcdef0123456789abcdef0123456789";
        Assert.Equal(formatN, PermissionService.NormalizeUserId(formatD));
    }

    [Fact]
    public void NormalizeUserId_FormatD_Uppercase_StripsHyphensAndLowercases()
    {
        var formatDUpper = "ABCDEF01-2345-6789-ABCD-EF0123456789";
        var formatN = "abcdef0123456789abcdef0123456789";
        Assert.Equal(formatN, PermissionService.NormalizeUserId(formatDUpper));
    }

    [Fact]
    public void NormalizeUserId_FormatB_StripsBracesAndHyphens()
    {
        // Format Guid avec accolades — Jellyfin ne devrait jamais l'utiliser mais
        // Guid.TryParse l'accepte, autant vérifier qu'on tombe bien sur "N".
        var formatB = "{abcdef01-2345-6789-abcd-ef0123456789}";
        var formatN = "abcdef0123456789abcdef0123456789";
        Assert.Equal(formatN, PermissionService.NormalizeUserId(formatB));
    }

    // ── Inputs invalides — comportement de repli ─────────────────────────────────────

    [Fact]
    public void NormalizeUserId_Null_ReturnsEmpty()
    {
        // Defensive : null arrive si le claim Jellyfin-UserId est absent.
        // Le retour vide est OK car le caller doit ensuite renvoyer 401 (R10).
        Assert.Equal(string.Empty, PermissionService.NormalizeUserId(null));
    }

    [Fact]
    public void NormalizeUserId_Empty_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, PermissionService.NormalizeUserId(string.Empty));
    }

    [Fact]
    public void NormalizeUserId_Invalid_PreservesInputAsIs()
    {
        // Pour un input non-Guid (corrompu, ID malformé en base), on préserve le
        // string tel quel. C'est moins propre qu'un throw mais évite de masquer des
        // données légacy potentiellement déjà persistées avant la mise en place de
        // la normalisation.
        var garbage = "not-a-guid-at-all";
        Assert.Equal(garbage, PermissionService.NormalizeUserId(garbage));
    }

    [Fact]
    public void NormalizeUserId_Whitespace_PreservesInput()
    {
        // Comportement attendu : ne pas trim — laisse au caller le soin de décider.
        Assert.Equal("  ", PermissionService.NormalizeUserId("  "));
    }

    // ── Cohérence : deux formats équivalents produisent la même sortie ──────────────

    [Fact]
    public void NormalizeUserId_FormatsAreEquivalent()
    {
        // Garantie clé pour [[guid-format-userid]] : deux formats du même Guid
        // donnent le même output. Si jamais cette propriété casse, tout le système
        // d'IsOwner / GetOrDefault / Upsert se met silencieusement à mal fonctionner.
        var formatN = "abcdef0123456789abcdef0123456789";
        var formatD = "abcdef01-2345-6789-abcd-ef0123456789";
        var formatB = "{abcdef01-2345-6789-abcd-ef0123456789}";

        var nNormalized = PermissionService.NormalizeUserId(formatN);
        var dNormalized = PermissionService.NormalizeUserId(formatD);
        var bNormalized = PermissionService.NormalizeUserId(formatB);

        Assert.Equal(nNormalized, dNormalized);
        Assert.Equal(dNormalized, bNormalized);
    }

    // ── Symmetric IsOwner-like comparison via NormalizeUserId ───────────────────────

    [Theory]
    [InlineData("abcdef0123456789abcdef0123456789", "abcdef01-2345-6789-abcd-ef0123456789", true)]   // N vs D du même
    [InlineData("ABCDEF0123456789ABCDEF0123456789", "abcdef0123456789abcdef0123456789", true)]       // casse différente
    [InlineData("abcdef0123456789abcdef0123456789", "11111111111111111111111111111111", false)]      // GUIDs différents
    [InlineData(null, "abcdef0123456789abcdef0123456789", false)]                                    // un côté null
    [InlineData(null, null, true)]                                                                   // les deux null
    public void IsOwner_CompareNormalized(string? a, string? b, bool expectedEqual)
    {
        // Reproduit la logique de InfoPopupControllerBase.IsOwner sans exposer la base
        // (qui est protected). Ce test garantit que l'identité d'ownership reste
        // cohérente quelle que soit la combinaison de formats des deux IDs.
        var aNorm = PermissionService.NormalizeUserId(a);
        var bNorm = PermissionService.NormalizeUserId(b);
        Assert.Equal(expectedEqual, aNorm == bNorm);
    }
}
