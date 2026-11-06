import * as signalR from "@microsoft/signalr";
import type { GameState } from "../types/game";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

// -------------------------------------------------------------------------
// join a live game group and get shoved state updates
// -------------------------------------------------------------------------
export function connectGameHub(
    gameId: string,
    onGameUpdated: (game: GameState) => void
): signalR.HubConnection {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${API_BASE_URL}/hubs/games`, {
            withCredentials: true,
        })
        .withAutomaticReconnect()
        .build();

    connection.on("GameStateUpdated", (game: GameState) => {
        onGameUpdated(game);
    });

    void connection
        .start()
        .then(() => connection.invoke("JoinGame", gameId))
        .catch((err) => console.warn("SignalR join failed", err));

    return connection;
}

// alias used by older call sites
export function subscribeToGame(
    gameId: string,
    onGameUpdated: (game: GameState) => void
): signalR.HubConnection {
    return connectGameHub(gameId, onGameUpdated);
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
