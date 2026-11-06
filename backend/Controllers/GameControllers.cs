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

        // -----------------------------------------------------------------------------
        // Constructor: GamesController
        // Dependancy injects the requires services and recieves them here
        // -----------------------------------------------------------------------------
        public GamesController(CountryCatalogueService countryCatalogue, GameInitializationService initializationService, GameStore gameStore) {

            _countryCatalogue = countryCatalogue;
            _initializationService = initializationService;
            _gameStore = gameStore;
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
    }

//-----------------------------------------------------------------End of File----------------------------------------------------------------->