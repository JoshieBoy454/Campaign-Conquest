using System.Collections.Concurrent;
using Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Models;

namespace Services;

// ---- Simple NPC heuristics (no LLM yet) ----
public interface INpcDecisionPolicy {
    void PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService);
}

public class SimpleNpcDecisionPolicy : INpcDecisionPolicy {

    public void PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService) {

        if (game.CurrentFactionId != npcFactionId) {
            return;
        }

        Faction npc = game.Factions.Single(f => f.Id == npcFactionId);

        if (npc.Type != FactionType.NPC || npc.IsDefeated) {
            return;
        }

        while (game.Status == GameStatus.InProgress && game.CurrentFactionId == npcFactionId) {

            switch (game.CurrentPhase) {

                case TurnPhase.Upkeep:
                    turnService.AdvancePhase(game, npcFactionId);
                    break;

                case TurnPhase.ReinforcementOne:
                case TurnPhase.ReinforcementTwo:
                    SpendReinforcementPool(game, npcFactionId, turnService);
                    turnService.AdvancePhase(game, npcFactionId);
                    break;

                case TurnPhase.Combat:
                    TryCombatOrSkip(game, npcFactionId, combatService);
                    break;

                case TurnPhase.EndTurn:
                    turnService.AdvancePhase(game, npcFactionId);
                    break;

                default:
                    return;
            }

            if (game.ActiveCombat != null) {
                ResolveCombatUntilDone(game, npcFactionId, combatService);
            }
        }
    }

    private static void SpendReinforcementPool(GameState game, Guid factionId, TurnService turnService) {

        while (game.ReinforcementPool > 0) {

            Territory? target = game.Territories
                .Where(t => t.OwnerFactionId == factionId)
                .OrderByDescending(t => t.Soldiers)
                .FirstOrDefault();

            if (target == null) {
                break;
            }

            int amount = Math.Min(game.ReinforcementPool, 1);
            turnService.AllocateReinforcements(game, factionId, target.CountryId, amount);
        }
    }

    private static void TryCombatOrSkip(GameState game, Guid factionId, CombatService combatService) {

        if (game.ConqueredThisTurn.Count > 0 || game.ActiveCombat != null) {
            combatService.SkipCombat(game, factionId);
            return;
        }

        Territory? source = game.Territories
            .Where(t => t.OwnerFactionId == factionId && t.Soldiers > 1)
            .OrderByDescending(t => t.Soldiers)
            .FirstOrDefault();

        Territory? target = game.Territories
            .Where(t => t.OwnerFactionId != factionId && !IsDefeatedOwner(game, t.OwnerFactionId))
            .OrderBy(t => t.Soldiers)
            .FirstOrDefault();

        if (source == null || target == null) {
            combatService.SkipCombat(game, factionId);
            return;
        }

        int commit = Math.Min(source.Soldiers - 1, 2);

        try {
            combatService.StartCombat(game, factionId, source.CountryId, target.CountryId, commit);
        }
        catch (InvalidOperationException) {
            combatService.SkipCombat(game, factionId);
        }
    }

    private static void ResolveCombatUntilDone(GameState game, Guid factionId, CombatService combatService) {

        int safety = 64;

        while (game.ActiveCombat != null && safety-- > 0) {

            CombatState combat = game.ActiveCombat;

            if (combat.AttackerSoldiers <= combat.DefenderSoldiers) {
                combatService.Retreat(game, factionId);
                break;
            }

            combatService.ResolveNextRound(game, factionId);
        }
    }

    private static bool IsDefeatedOwner(GameState game, Guid ownerId) {

        Faction? owner = game.Factions.FirstOrDefault(f => f.Id == ownerId);
        return owner == null || owner.IsDefeated;
    }
}

// ---- Background loop: advance NPC turns when it is their go ----
public class NpcTurnHostedService : BackgroundService {

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly GameStore _gameStore;
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _gameLocks = new();

    private static readonly TimeSpan BaseDelay = TimeSpan.FromMilliseconds(750);

    public NpcTurnHostedService(IServiceScopeFactory scopeFactory, GameStore gameStore) {
        _scopeFactory = scopeFactory;
        _gameStore = gameStore;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {

        while (!stoppingToken.IsCancellationRequested) {

            foreach (GameState game in _gameStore.GetAllGames()) {

                if (game.Status != GameStatus.InProgress || game.CurrentFactionId == null) {
                    continue;
                }

                Faction? current = game.Factions.FirstOrDefault(f => f.Id == game.CurrentFactionId);

                if (current == null || current.Type != FactionType.NPC || current.IsDefeated) {
                    continue;
                }

                SemaphoreSlim gate = _gameLocks.GetOrAdd(game.Id, _ => new SemaphoreSlim(1, 1));

                if (!await gate.WaitAsync(0, stoppingToken)) {
                    continue;
                }

                try {
                    await RunNpcTurn(game, current.Id, stoppingToken);
                }
                finally {
                    gate.Release();
                }
            }

            await Task.Delay(TimeSpan.FromMilliseconds(250), stoppingToken);
        }
    }

    private async Task RunNpcTurn(GameState game, Guid npcFactionId, CancellationToken stoppingToken) {

        int speed = Math.Clamp(game.NpcSpeed, 1, 8);
        TimeSpan delay = TimeSpan.FromMilliseconds(BaseDelay.TotalMilliseconds / speed);

        using IServiceScope scope = _scopeFactory.CreateScope();

        INpcDecisionPolicy policy = scope.ServiceProvider.GetRequiredService<INpcDecisionPolicy>();
        TurnService turnService = scope.ServiceProvider.GetRequiredService<TurnService>();
        CombatService combatService = scope.ServiceProvider.GetRequiredService<CombatService>();

        Guid startingFaction = game.CurrentFactionId ?? npcFactionId;
        TurnPhase startingPhase = game.CurrentPhase;

        policy.PlayTurn(game, npcFactionId, turnService, combatService);

        if (game.CurrentFactionId != startingFaction || game.CurrentPhase != startingPhase || game.ActiveCombat != null) {
            await Task.Delay(delay, stoppingToken);
        }
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
