import { apiUrl } from "./apiBase";

export type GameEventRow = {
    eventId: string;
    sequence: number;
    type: string;
    occurredAtUtc: string;
    payloadJson?: string;
};

/** Normalize ASP.NET camelCase or PascalCase event payloads. */
export function normalizeEvent(raw: Record<string, unknown>): GameEventRow | null {
    const eventId = String(raw.eventId ?? raw.EventId ?? "");
    if (!eventId) return null;
    const sequence = Number(raw.sequence ?? raw.Sequence ?? 0);
    return {
        eventId,
        sequence: Number.isFinite(sequence) ? sequence : 0,
        type: String(raw.type ?? raw.Type ?? ""),
        occurredAtUtc: String(
            raw.occurredAtUtc ?? raw.OccurredAtUtc ?? new Date().toISOString()
        ),
        payloadJson:
            raw.payloadJson != null
                ? String(raw.payloadJson)
                : raw.PayloadJson != null
                  ? String(raw.PayloadJson)
                  : undefined,
    };
}

async function readErrorMessage(
    response: Response,
    fallback: string
): Promise<string> {
    try {
        const body = (await response.json()) as {
            message?: string;
            title?: string;
        };
        if (body.message) return body.message;
        if (body.title) return body.title;
    } catch {
        /* ignore non-JSON */
    }
    return fallback;
}

export async function fetchEventsAfter(
    gameId: string,
    afterSequence: number,
    limit = 100
): Promise<{ rows: GameEventRow[]; error: string | null }> {
    try {
        const response = await fetch(
            apiUrl(
                `/api/games/${encodeURIComponent(gameId)}/events?afterSequence=${afterSequence}&limit=${limit}`
            ),
            { credentials: "include" }
        );
        if (!response.ok) {
            const detail = await readErrorMessage(
                response,
                `Events HTTP ${response.status}`
            );
            return {
                rows: [],
                error:
                    detail === `Events HTTP ${response.status}`
                        ? detail
                        : `Events HTTP ${response.status}: ${detail}`,
            };
        }
        const raw = (await response.json()) as Record<string, unknown>[];
        if (!Array.isArray(raw)) {
            return { rows: [], error: "Events response was not a list." };
        }
        const rows = raw
            .map((r) => normalizeEvent(r))
            .filter((r): r is GameEventRow => r != null);
        return { rows, error: null };
    } catch {
        return { rows: [], error: "Unable to reach event log." };
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
