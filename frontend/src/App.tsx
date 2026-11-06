import { useEffect, useState } from "react";
import "./App.css";
import Map from "./components/Map";
import HomePage from "./pages/HomePage";

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

// App being the root component — light routing, no react-router dependency yet
export default function App() {
    const [route, setRoute] = useState<Route>(() => parseRoute());

    useEffect(() => {
        const onPop = () => setRoute(parseRoute());
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    function navigate(path: string) {
        window.history.pushState({}, "", path);
        setRoute(parseRoute());
    }

    if (route.name === "home") {
        return (
            <HomePage
                onPlay={() => navigate("/play")}
                onSpectate={(gameId) => navigate(`/game/${gameId}`)}
            />
        );
    }

    // play + game both use the map shell for now; Map loads/creates as needed
    return (
        <div>
            <Map initialGameId={route.name === "game" ? route.gameId : null} />
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->
