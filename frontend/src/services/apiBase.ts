// -------------------------------------------------------------------------
// apiBase — empty in production so /api and /hubs stay on the CloudFront host
// -------------------------------------------------------------------------
export function apiBase(): string {
    const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
    if (raw == null || String(raw).trim() === "") {
        return "";
    }
    return String(raw).trim().replace(/\/+$/, "");
}

export function apiUrl(path: string): string {
    const base = apiBase();
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalized}`;
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
