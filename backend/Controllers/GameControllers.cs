using Microsoft.AspNetCore.Mvc;
using Models;
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
        private readonly GameStore _gameStore;
        private readonly GameActionService _gameActions;

        // -----------------------------------------------------------------------------
        // Constructor: GamesController
        // Dependancy injects the requires services and recieves them here
        // -----------------------------------------------------------------------------
        public GamesController(
            CountryCatalogueService countryCatalogue,
            GameInitializationService initializationService,
            GameStore gameStore,
            GameActionService gameActions) {

            _countryCatalogue = countryCatalogue;
            _initializationService = initializationService;
            _gameStore = gameStore;
            _gameActions = gameActions;
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
        public ActionResult<GameInitializationResult> CreateGame([FromBody] CreateGameRequest request) {
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

            // Save the game temporarily in memory
            _gameStore.AddGame(result.Game);

            // Return HTTP 201 Created and the game data
            return CreatedAtAction(nameof(GetGame), new { gameId = result.Game.Id },result);
        }

        // -------------------------------------------------------------------------
        // Endpoint: GET /api/games/{gameId}
        // Retrieves a previously created game
        // -------------------------------------------------------------------------
        [HttpGet("{gameId:guid}")]
        public ActionResult<GameState> GetGame(Guid gameId)
        {
            GameState? game = _gameStore.GetGame(gameId);

            if (game == null) {
                return NotFound(
                    "The requested game could not be found");
            }
            return Ok(game);
        }

        [HttpPost("{gameId:guid}/actions/advance-phase")]
        public ActionResult<GameState> AdvancePhase(Guid gameId, [FromBody] VersionedActionRequest request) {

            return RunAction(gameId, () =>
                _gameActions.AdvancePhase(gameId, request.ExpectedVersion, request.ActionId));
        }

        [HttpPost("{gameId:guid}/actions/allocate-reinforcements")]
        public ActionResult<GameState> AllocateReinforcements(Guid gameId, [FromBody] AllocateReinforcementsActionRequest request) {

            return RunAction(gameId, () =>
                _gameActions.AllocateReinforcements(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.CountryId,
                    request.SoldierCount));
        }

        [HttpPost("{gameId:guid}/actions/transfer-soldiers")]
        public ActionResult<GameState> TransferSoldiers(Guid gameId, [FromBody] TransferSoldiersActionRequest request) {

            return RunAction(gameId, () =>
                _gameActions.TransferSoldiers(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.SourceCountryId,
                    request.DestinationCountryId,
                    request.SoldierCount));
        }

        [HttpPost("{gameId:guid}/actions/combat/start")]
        public ActionResult<GameState> StartCombat(Guid gameId, [FromBody] StartCombatActionRequest request) {

            return RunAction(gameId, () =>
                _gameActions.StartCombat(
                    gameId,
                    request.ExpectedVersion,
                    request.ActionId,
                    request.SourceCountryId,
                    request.DestinationCountryId,
                    request.SoldierCount));
        }

        [HttpPost("{gameId:guid}/actions/combat/roll")]
        public ActionResult<GameState> RollCombat(Guid gameId, [FromBody] VersionedActionRequest request) {

            return RunAction(gameId, () =>
                _gameActions.ResolveCombatRound(gameId, request.ExpectedVersion, request.ActionId));
        }

        [HttpPost("{gameId:guid}/actions/combat/retreat")]
        public ActionResult<GameState> RetreatCombat(Guid gameId, [FromBody] VersionedActionRequest request) {

            return RunAction(gameId, () =>
                _gameActions.RetreatCombat(gameId, request.ExpectedVersion, request.ActionId));
        }

        [HttpPost("{gameId:guid}/settings/npc-speed")]
        public ActionResult<GameState> SetNpcSpeed(Guid gameId, [FromBody] SetNpcSpeedRequest request) {

            return RunAction(gameId, () =>
                _gameActions.SetNpcSpeed(gameId, request.ExpectedVersion, request.ActionId, request.NpcSpeed));
        }

        private ActionResult<GameState> RunAction(Guid gameId, Func<GameState> action) {

            if (_gameStore.GetGame(gameId) == null) {
                return NotFound("The requested game could not be found");
            }

            try {
                GameState game = action();
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
