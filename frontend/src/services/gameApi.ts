import type {
    CountryDefinition,
    GameInitializationResult,
    GameState
} from "../types/game";

// Retrieves the API address from the Vite environment configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// -----------------------------------------------------------------------------
// Function: getCountries
// Retrieves the available countries from the backend country catalogue
// -----------------------------------------------------------------------------
export async function getCountries(): Promise<CountryDefinition[]> {

    // Send a GET request to the backend.
    const response = await fetch(
        `${API_BASE_URL}/api/games/countries`
    );

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
    const response = await fetch(
        `${API_BASE_URL}/api/games`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                selectedCountryId: selectedCountryId,
            }),
        }
    );

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
        `${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}`);

    // Check whether the game was successfully retrieved
    if (!response.ok) {
        throw new Error(
            `Failed to retrieve game HTTP ${response.status}`);
    }

    // Convert the backend response into a GameState
    return await response.json() as GameState;
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->