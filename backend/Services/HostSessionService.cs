using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Repositories;

namespace Services;

public class HostSessionService(IHostSessionRepository hostSessions)
{
    public static string CookieName(Guid gameId) => $"cc_host_{gameId:N}";

    public async Task<string> CreateSessionAsync(Guid gameId, CancellationToken cancellationToken = default)
    {
        string token = GenerateToken();
        string hash = HashToken(token);
        await hostSessions.CreateAsync(gameId, hash, cancellationToken);
        return token;
    }

    public void SetHostCookie(HttpResponse response, Guid gameId, string token)
    {
        response.Cookies.Append(
            CookieName(gameId),
            token,
            new CookieOptions {
                HttpOnly = true,
                SameSite = SameSiteMode.Lax,
                Path = "/",
            });
    }

    public async Task<bool> IsHostAsync(
        HttpRequest request,
        Guid gameId,
        CancellationToken cancellationToken = default)
    {
        if (!request.Cookies.TryGetValue(CookieName(gameId), out string? token)
            || string.IsNullOrWhiteSpace(token)) {
            return false;
        }

        return await hostSessions.ValidateAsync(gameId, HashToken(token), cancellationToken);
    }

    public static string GenerateToken()
    {
        byte[] bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes);
    }

    public static string HashToken(string token)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(hash);
    }
}
