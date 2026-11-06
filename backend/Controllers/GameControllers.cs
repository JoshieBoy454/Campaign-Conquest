using Microsoft.AspNetCore.Mvc;
using Models;
using Repositories;
using Rules;
using Services;

namespace Controllers;

    // -----------------------------------------------------------------------------
    // Record: CreateGameRequest
    // Represetns the info sent by the front end to create a new game
    // -----------------------------------------------------------------------------
    public record CreateGameRequest(string SelectedCountryId);

    public record VersionedActionRequest(long ExpectedVersion, string? ActionId);

    public record AllocateReinforcementsActionRequest(
        long ExpectedVersion,
        string? ActionId,
        string CountryId,
        int SoldierCount);

    public record TransferSoldiersActionRequest(
        long ExpectedVersion,
        string? ActionId,
        string SourceCountryId,
        string DestinationCountryId,
        int SoldierCount);

    public record StartCombatActionRequest(
        long ExpectedVersion,
        string? ActionId,
        string SourceCountryId,
        string DestinationCountryId,
        int SoldierCount);

    public record SetNpcSpeedRequest(long ExpectedVersion, string? ActionId, int NpcSpeed);

    // -----------------------------------------------------------------------------
    // Class: GamesController
    // Provodes ednpoints for listing ountries, creating and retrieving games
    // -----------------------------------------------------------------------------
    [ApiController]
    [Route("api/games")]
    public class GamesController : ControllerBase {

        private readonly CountryCatalogueService _countryCatalogue;
        private readonly GameInitializationService _initializationService;
        private readonly IGameRepository _gameRepository;
        private readonly IGameEventRepository _gameEventRepository;
        private readonly GameActionService _gameActions;
        private readonly HostSessionService _hostSessionService;

        // -----------------------------------------------------------------------------
        // Constructor: GamesController
        // Dependancy injects the requires services and recieves them here
        // -----------------------------------------------------------------------------
        public GamesController(
            CountryCatalogueService countryCatalogue,
            GameInitializationService initializationService,
            IGameRepository gameRepository,
            IGameEventRepository gameEventRepository,
            GameActionService gameActions,
            HostSessionService hostSessionService) {

            _countryCatalogue = countryCatalogue;
            _initializationService = initializationService;
            _gameRepository = gameRepository;
            _gameEventRepository = gameEventRepository;
            _gameActions = gameActions;
            _hostSessionService = hostSessionService;
        }

        // -----------------------------------------------------------------------------
        // Endpoint: Get /api.games/countries
        // This returns all available countries and their starting soldier values
        // -----------------------------------------------------------------------------
        [HttpGet("countries")]
        public IActionResult GetCountries() {

            var countries = _countryCatalogue.GetCountries().Select(country => new 
            {
                    country.CountryId,
                    country.Name,
                    country.Population,

                    SoldierValue = PopulationRules.CalculateSoldierValue(country.Population)
            })
                .ToList();
            return Ok(countries);
        }

        // -------------------------------------------------------------------------
        // Endpoint: POST /api/games
        // Creates a game using the human player's selected country
        // -------------------------------------------------------------------------
        [HttpPost]
        public async Task<ActionResult<GameInitializationResult>> CreateGame(
            [FromBody] CreateGameRequest request,
            CancellationToken cancellationToken) {
            if (request == null || string.IsNullOrWhiteSpace(request.SelectedCountryId)) {
                return BadRequest(
                    "A starting country must be selected");
            }

            // Get the validated country catalogue
            var countries = _countryCatalogue.GetCountries();

            // Ensure the selected country is available
            bool countryExists = countries.Any(country =>
                string.Equals(country.CountryId, request.SelectedCountryId, StringComparison.OrdinalIgnoreCase));

            if (!countryExists) {
                return BadRequest(
                    "The selected country is not available");
            }

            // Create the factions, territories and D20 turn order
            GameInitializationResult result = _initializationService.CreateGame(request.SelectedCountryId, countries);

            await _gameRepository.AddAsync(result.Game, cancellationToken);

            string hostToken = await _hostSessionService.CreateSessionAsync(result.Game.Id, cancellationToken);
            _hostSessionService.SetHostCookie(Response, result.Game.Id, hostToken);

            // Return HTTP 201 Created and the game data
            return CreatedAtAction(nameof(GetGame), new { gameId = result.Game.Id },result);
        }

        // -------------------------------------------------------------------------
        // Endpoint: GET /api/games/{gameId}
        // Retrieves a previously created game
        // -------------------------------------------------------------------------
        [HttpGet("{gameId:guid}")]
        public async Task<ActionResult<GameState>> GetGame(Guid gameId, CancellationToken cancellationToken)
        {
            GameState? game = await _gameRepository.GetAsync(gameId, cancellationToken);

            if (game == null) {
                return NotFound(
                    "The requested game could not be found");
            }
            return Ok(game);
        }

        [HttpGet("{gameId:guid}/host-status")]
        public async Task<IActionResult> GetHostStatus(Guid gameId, CancellationToken cancellationToken)
        {
            if (await _gameRepository.GetAsync(gameId, cancellationToken) == null) {
                return NotFound("The requested game could not be found");
            }

            bool isHost = await _hostSessionService.IsHostAsync(Request, gameId, cancellationToken);
            return Ok(new { isHost });
        }

        [HttpGet("{gameId:guid}/events")]
        public async Task<IActionResult> GetEvents(
            Guid gameId,
            [FromQuery] long afterSequence = 0,
            [FromQuery] int limit = 100,
            CancellationToken cancellationToken = default)
        {
            if (await _gameRepository.GetAsync(gameId, cancellationToken) == null) {
                return NotFound("The requested game could not be found");
            }

            int pageSize = Math.Clamp(limit, 1, 200);
            IReadOnlyList<GameEvent> events = await _gameEventRepository.GetAfterAsync(
                gameId,
                afterSequence,
                pageSize,
                cancellationToken);

            return Ok(events);
        }

        [HttpPost("{gameId:guid}/actions/advance-phase")]
        public Task<ActionResult<GameState>> AdvancePhase(
            Guid gameId,
            [FromBody] VersionedActionRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.AdvancePhase(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    cancellationToken),
                cancellationToken);
        }

        [HttpPost("{gameId:guid}/actions/allocate-reinforcements")]
        public Task<ActionResult<GameState>> AllocateReinforcements(
            Guid gameId,
            [FromBody] AllocateReinforcementsActionRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.AllocateReinforcements(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.CountryId,
                    request.SoldierCount,
                    cancellationToken),
                cancellationToken);
        }

        [HttpPost("{gameId:guid}/actions/transfer-soldiers")]
        public Task<ActionResult<GameState>> TransferSoldiers(
            Guid gameId,
            [FromBody] TransferSoldiersActionRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.TransferSoldiers(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.SourceCountryId,
                    request.DestinationCountryId,
                    request.SoldierCount,
                    cancellationToken),
                cancellationToken);
        }

        [HttpPost("{gameId:guid}/actions/combat/start")]
        public Task<ActionResult<GameState>> StartCombat(
            Guid gameId,
            [FromBody] StartCombatActionRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.StartCombat(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.SourceCountryId,
                    request.DestinationCountryId,
                    request.SoldierCount,
                    cancellationToken),
                cancellationToken);
        }

        [HttpPost("{gameId:guid}/actions/combat/roll")]
        public Task<ActionResult<GameState>> RollCombat(
            Guid gameId,
            [FromBody] VersionedActionRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.ResolveCombatRound(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    cancellationToken),
                cancellationToken);
        }

        [HttpPost("{gameId:guid}/actions/combat/retreat")]
        public Task<ActionResult<GameState>> RetreatCombat(
            Guid gameId,
            [FromBody] VersionedActionRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.RetreatCombat(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    cancellationToken),
                cancellationToken);
        }

        [HttpPost("{gameId:guid}/settings/npc-speed")]
        public Task<ActionResult<GameState>> SetNpcSpeed(
            Guid gameId,
            [FromBody] SetNpcSpeedRequest request,
            CancellationToken cancellationToken) {

            return RunAction(
                gameId,
                () => _gameActions.SetNpcSpeed(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.NpcSpeed,
                    cancellationToken),
                cancellationToken);
        }

        private async Task<ActionResult<GameState>> RunAction(
            Guid gameId,
            Func<Task<GameState>> action,
            CancellationToken cancellationToken) {

            if (await _gameRepository.GetAsync(gameId, cancellationToken) == null) {
                return NotFound("The requested game could not be found");
            }

            if (!await _hostSessionService.IsHostAsync(Request, gameId, cancellationToken)) {
                return StatusCode(StatusCodes.Status403Forbidden, "Only the host can change this game");
            }

            try {
                GameState game = await action();
                return Ok(game);
            }
            catch (KeyNotFoundException) {
                return NotFound("The requested game could not be found");
            }
            catch (GameVersionConflictException conflict) {
                return Conflict(new {
                    message = conflict.Message,
                    expectedVersion = conflict.ExpectedVersion,
                    actualVersion = conflict.ActualVersion
                });
            }
            catch (ArgumentException ex) {
                return BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex) {
                return BadRequest(ex.Message);
            }
        }
    }

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
