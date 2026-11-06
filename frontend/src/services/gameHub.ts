import * as signalR from "@microsoft/signalr";
import type { GameState } from "../types/game";
import { apiUrl } from "./apiBase";

// -------------------------------------------------------------------------
// join a live game group — hub is /hubs/games (same CloudFront host in prod)
// -------------------------------------------------------------------------
export function connectGameHub(
    gameId: string,
    onGameUpdated: (game: GameState) => void
): signalR.HubConnection {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl(apiUrl("/hubs/games"), {
            withCredentials: true,
        })
        .withAutomaticReconnect()
        .build();

    connection.on("GameStateUpdated", (game: GameState) => {
        onGameUpdated(game);
    });

    // Caller starts + JoinGame so it can track online/offline state
    void gameId;

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
