export type PresentationItem = {
    id: string;
    kind: "combat-round" | "casualty" | "npc-turn";
    sourceCountryId?: string;
    destinationCountryId?: string;
    attackerLosses?: number;
    defenderLosses?: number;
    speed?: 1 | 2;
};

type Listener = (item: PresentationItem | null) => void;

/** Ordered, deduped presentation queue for map VFX (authoritative events only). */
class PresentationQueue {
    private queue: PresentationItem[] = [];
    private seen = new Set<string>();
    private playing = false;
    private listeners = new Set<Listener>();
    private current: PresentationItem | null = null;

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.current);
        return () => this.listeners.delete(listener);
    }

    enqueue(item: PresentationItem) {
        if (this.seen.has(item.id)) return;
        this.seen.add(item.id);
        if (this.seen.size > 400) {
            const drop = [...this.seen].slice(0, 200);
            for (const id of drop) this.seen.delete(id);
        }
        this.queue.push(item);
        void this.pump();
    }

    reset() {
        this.queue = [];
        this.playing = false;
        this.current = null;
        this.emit(null);
    }

    private emit(item: PresentationItem | null) {
        this.current = item;
        for (const listener of this.listeners) listener(item);
    }

    private async pump() {
        if (this.playing) return;
        this.playing = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            this.emit(item);
            const base = item.kind === "combat-round" ? 1200 : 800;
            const ms = Math.round(base / (item.speed ?? 1));
            await new Promise((r) => setTimeout(r, ms));
        }
        this.emit(null);
        this.playing = false;
    }
}

export const presentationQueue = new PresentationQueue();

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
