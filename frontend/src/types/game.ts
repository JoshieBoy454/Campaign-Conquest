
// -------------------------------------------------------------------------
    // Interface: CountryDefinition
    // Represents a country from the population catalogue
    // The backend calculates soldierValue using its population
    // -------------------------------------------------------------------------
    export interface CountryDefinition {
        countryId: string;
        name: string;
        population: number;
        soldierValue: number;
    }

    // -------------------------------------------------------------------------
    // Interface: Faction
    // Represents a human or NPC faction participating in a game
    // -------------------------------------------------------------------------
    export interface Faction {
        id: string;
        name: string;
        type: FactionType;
        color: string;
        turnPosition: number;
        turnsPlayed: number;
        isDefeated: boolean;
    }

    // -------------------------------------------------------------------------
    // Interface: Territory
    // Represents an active country controlled by a faction
    // -------------------------------------------------------------------------
    export interface Territory {
        countryId: string;
        name: string;
        population: number;
        soldierValue: number;
        ownerFactionId: string;
        soldiers: number;
    }

    // -------------------------------------------------------------------------
    // Interface: GameState
    // Represents the current state of a Campaign Conquest game
    // -------------------------------------------------------------------------
    export interface CombatState {
        attackerFactionId: string;
        defenderFactionId: string;
        sourceCountryId: string;
        destinationCountryId: string;
        attackerSoldiers: number;
        defenderSoldiers: number;
        lastAttackerDice: number[];
        lastDefenderDice: number[];
        lastAttackerLosses: number;
        lastDefenderLosses: number;
    }

    export interface GameState {
        id: string;
        status: GameStatus;
        factions: Faction[];
        territories: Territory[];
    
        currentFactionId: string | null;
        currentPhase: TurnPhase;
    
        round: number;
        reinforcementPool: number;
    
        conqueredThisTurn: string[];
        winnerFactionId: string | null;
    
        version: number;
        activeCombat?: CombatState | null;
        npcSpeed?: number;
    }

    // -------------------------------------------------------------------------
    // Interface: TurnOrderRoll
    // Represents an individual D20 roll used when deciding turn order
    // -------------------------------------------------------------------------
    export interface TurnOrderRoll {
        factionId: string;
        roll: number;
        rollStage: number;
    }

    // -------------------------------------------------------------------------
    // Interface: GameInitializationResult
    // Represents the response when the backend creates a new game
    // -------------------------------------------------------------------------
    export interface GameInitializationResult {
        game: GameState;
        turnOrderRolls: TurnOrderRoll[];
    }

    
    // -------------------------------------------------------------------------
    // Constant: GameStatus
    // Represents the current lifecycle state of a game
    // -------------------------------------------------------------------------
    export const GameStatus = {
        Setup: 0,
        Initialising: 1,
        InProgress: 2,
        Finished: 3,
    } as const;

    export type GameStatus =
        (typeof GameStatus)[keyof typeof GameStatus];

    // -------------------------------------------------------------------------
    // Constant: TurnPhase
    // Represents the five phases of a faction's turn
    // -------------------------------------------------------------------------
    export const TurnPhase = {
        Upkeep: 0,
        ReinforcementOne: 1,
        Combat: 2,
        ReinforcementTwo: 3,
        EndTurn: 4,
    } as const;

    export type TurnPhase =
        (typeof TurnPhase)[keyof typeof TurnPhase];

    // -------------------------------------------------------------------------
    // Constant: FactionType
    // Identifies human-controlled and NPC-controlled factions
    // -------------------------------------------------------------------------
    export const FactionType = {
        Human: 0,
        Npc: 1,
    } as const;

    export type FactionType =
        (typeof FactionType)[keyof typeof FactionType];


//-----------------------------------------------------------------End of File----------------------------------------------------------------->
