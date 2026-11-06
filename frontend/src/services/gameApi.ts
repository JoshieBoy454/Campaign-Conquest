import type {
    CountryDefinition,
    GameInitializationResult,
    GameState
} from "../types/game";
import { apiUrl } from "./apiBase";

function newActionId(): string {
    return crypto.randomUUID();
}

async function readGameOrThrow(response: Response, fallback: string): Promise<GameState> {
    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            body || `${fallback} HTTP ${response.status}`
        );
    }
    return await response.json() as GameState;
}

// -----------------------------------------------------------------------------
// Function: getCountries
// Retrieves the available countries from the backend country catalogue
// -----------------------------------------------------------------------------
export async function getCountries(): Promise<CountryDefinition[]> {

    // Send a GET request to the backend.
    const response = await fetch(apiUrl("/api/games/countries"));

    // Check if the HTTP request succeeded.
    if (!response.ok) {
        throw new Error(
            `Failed to retrieve countries HTTP ${response.status}`
        );
    }

    // Convert the JSON response into teh  TypeScript representation.
    return await response.json() as CountryDefinition[];
}

// -----------------------------------------------------------------------------
// Function: createGame
// Creates a new game using the country selected by the human player
// -----------------------------------------------------------------------------
export async function createGame(selectedCountryId: string): Promise<GameInitializationResult> {

    // Send the selected country to thebackend
    const response = await fetch(apiUrl("/api/games"), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                selectedCountryId: selectedCountryId,
            }),
        });

    // Reject unsuccessful requests
    if (!response.ok) {
        throw new Error(
            `Failed to create game HTTP ${response.status}`
        );
    }

    // Return the game state and recorded D20 rolls
    return await response.json() as GameInitializationResult;
}

// -----------------------------------------------------------------------------
// Function: getGame
// gets an existing game using its unique ID
// -----------------------------------------------------------------------------
export async function getGame(
    gameId: string
): Promise<GameState> {

    // Request an existing game from the backend
    const response = await fetch(
        apiUrl(`/api/games/${encodeURIComponent(gameId)}`),
        { credentials: "include" }
    );

    // Check whether the game was successfully retrieved
    if (!response.ok) {
        throw new Error(
            `Failed to retrieve game HTTP ${response.status}`);
    }

    // Convert the backend response into a GameState
    return await response.json() as GameState;
}

async function postAction(
    gameId: string,
    path: string,
    body: Record<string, unknown>
): Promise<GameState> {
    const response = await fetch(
        apiUrl(`/api/games/${encodeURIComponent(gameId)}/${path}`),
        {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                actionId: newActionId(),
                ...body,
            }),
        }
    );
    return readGameOrThrow(response, `Action ${path} failed`);
}

export function advancePhase(gameId: string, expectedVersion: number) {
    return postAction(gameId, "actions/advance-phase", { expectedVersion });
}

export function allocateReinforcements(
    gameId: string,
    expectedVersion: number,
    countryId: string,
    soldierCount: number
) {
    return postAction(gameId, "actions/allocate-reinforcements", {
        expectedVersion,
        countryId,
        soldierCount,
    });
}

export function transferSoldiers(
    gameId: string,
    expectedVersion: number,
    sourceCountryId: string,
    destinationCountryId: string,
    soldierCount: number
) {
    return postAction(gameId, "actions/transfer-soldiers", {
        expectedVersion,
        sourceCountryId,
        destinationCountryId,
        soldierCount,
    });
}

export function startCombat(
    gameId: string,
    expectedVersion: number,
    sourceCountryId: string,
    destinationCountryId: string,
    soldierCount: number
) {
    return postAction(gameId, "actions/combat/start", {
        expectedVersion,
        sourceCountryId,
        destinationCountryId,
        soldierCount,
    });
}

export function rollCombat(gameId: string, expectedVersion: number) {
    return postAction(gameId, "actions/combat/roll", { expectedVersion });
}

export function retreatCombat(gameId: string, expectedVersion: number) {
    return postAction(gameId, "actions/combat/retreat", { expectedVersion });
}

export function setNpcSpeed(
    gameId: string,
    expectedVersion: number,
    npcSpeed: number
) {
    return postAction(gameId, "settings/npc-speed", {
        expectedVersion,
        npcSpeed,
    });
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->
