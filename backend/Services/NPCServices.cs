using Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Models;
using Repositories;

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
    private readonly IGameRepository _gameRepository;
    private readonly GameConcurrencyGate _concurrencyGate;
    private readonly IGameStateNotifier _gameStateNotifier;

    private static readonly TimeSpan BaseDelay = TimeSpan.FromMilliseconds(750);

    public NpcTurnHostedService(
        IServiceScopeFactory scopeFactory,
        IGameRepository gameRepository,
        GameConcurrencyGate concurrencyGate,
        IGameStateNotifier gameStateNotifier) {
        _scopeFactory = scopeFactory;
        _gameRepository = gameRepository;
        _concurrencyGate = concurrencyGate;
        _gameStateNotifier = gameStateNotifier;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {

        while (!stoppingToken.IsCancellationRequested) {

            await foreach (GameState snapshot in _gameRepository.GetAllAsync(stoppingToken)) {

                if (snapshot.Status != GameStatus.InProgress || snapshot.CurrentFactionId == null) {
                    continue;
                }

                Faction? current = snapshot.Factions.FirstOrDefault(f => f.Id == snapshot.CurrentFactionId);

                if (current == null || current.Type != FactionType.NPC || current.IsDefeated) {
                    continue;
                }

                SemaphoreSlim gate = _concurrencyGate.Get(snapshot.Id);

                if (!await gate.WaitAsync(0, stoppingToken)) {
                    continue;
                }

                try {
                    await RunNpcTurn(snapshot.Id, current.Id, stoppingToken);
                }
                finally {
                    gate.Release();
                }
            }

            await Task.Delay(TimeSpan.FromMilliseconds(250), stoppingToken);
        }
    }

    private async Task RunNpcTurn(Guid gameId, Guid npcFactionId, CancellationToken stoppingToken) {

        GameState? game = await _gameRepository.GetAsync(gameId, stoppingToken);

        if (game == null) {
            return;
        }

        int speed = Math.Clamp(game.NpcSpeed, 1, 8);
        TimeSpan delay = TimeSpan.FromMilliseconds(BaseDelay.TotalMilliseconds / speed);

        using IServiceScope scope = _scopeFactory.CreateScope();

        INpcDecisionPolicy policy = scope.ServiceProvider.GetRequiredService<INpcDecisionPolicy>();
        TurnService turnService = scope.ServiceProvider.GetRequiredService<TurnService>();
        CombatService combatService = scope.ServiceProvider.GetRequiredService<CombatService>();

        Guid startingFaction = game.CurrentFactionId ?? npcFactionId;
        TurnPhase startingPhase = game.CurrentPhase;
        long versionAtStart = game.Version;

        policy.PlayTurn(game, npcFactionId, turnService, combatService);

        if (game.Version > versionAtStart) {
            bool saved = await _gameRepository.TryReplaceAsync(game, versionAtStart, stoppingToken);

            if (saved) {
                await _gameStateNotifier.NotifyGameStateUpdatedAsync(gameId, game, stoppingToken);
            }
        }

        if (game.CurrentFactionId != startingFaction || game.CurrentPhase != startingPhase || game.ActiveCombat != null) {
            await Task.Delay(delay, stoppingToken);
        }
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
