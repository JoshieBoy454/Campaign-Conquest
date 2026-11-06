import { useEffect, useState } from "react";
import "./App.css";
import "./styles/holo.css";
import Map from "./components/Map";
import MainMenuPanel from "./components/MainMenuPanel";

type Route =
    | { name: "home" }
    | { name: "play" }
    | { name: "game"; gameId: string };

function parseRoute(): Route {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/play" || path === "/new") {
        return { name: "play" };
    }
    const match = path.match(/^\/game\/([^/]+)$/i);
    if (match?.[1]) {
        return { name: "game", gameId: match[1] };
    }
    return { name: "home" };
}

function readStoredName(): string {
    try {
        return localStorage.getItem("cc-player-name") ?? "";
    } catch {
        return "";
    }
}

export default function App() {
    const [route, setRoute] = useState<Route>(() => parseRoute());
    const [playerName, setPlayerName] = useState(readStoredName);

    useEffect(() => {
        const onPop = () => setRoute(parseRoute());
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    function navigate(path: string) {
        window.history.pushState({}, "", path);
        setRoute(parseRoute());
    }

    function handleNameChange(name: string) {
        setPlayerName(name);
        try {
            localStorage.setItem("cc-player-name", name.trim());
        } catch {
            /* ignore */
        }
    }

    const showMenu = route.name === "home";
    const mapMode = showMenu ? "menu" : route.name === "play" ? "select" : "play";

    return (
        <div className="holo-shell">
            <Map
                mode={mapMode}
                playerName={playerName.trim()}
                initialGameId={route.name === "game" ? route.gameId : null}
            />
            {showMenu && (
                <MainMenuPanel
                    playerName={playerName}
                    onPlayerNameChange={handleNameChange}
                    onPlay={() => {
                        if (!playerName.trim()) return;
                        navigate("/play");
                    }}
                    onSpectate={(gameId) => navigate(`/game/${gameId}`)}
                />
            )}
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
