    using System.Globalization;
    using Microsoft.VisualBasic.FileIO;
    using Models;

    namespace Services;

    // -----------------------------------------------------------------------------
    // Class: CountryCatalogueService
    // This will load and validate the country population dataset loaded in : countries_population.csv
    // -----------------------------------------------------------------------------
    public class CountryCatalogueService {

        // Countries available in the population dataset but missing from GeoJSON
        // These countries cannot be selected as active game territories
        private static readonly HashSet<string> ExcludedCountryIds = new(
            StringComparer.OrdinalIgnoreCase
        )
        {
            "GUF",
            "GLP",
            "MTQ",
            "MYT",
            "REU",
            "TKL"
        };

        private readonly List<CountryDefinition> _countries;


        // -----------------------------------------------------------------------------
        // Constructor: CountryCatalogueService
        // Loads the country data from the data folder
        // -----------------------------------------------------------------------------
        public CountryCatalogueService(IWebHostEnvironment environment) {

            string filePath = Path.Combine(environment.ContentRootPath, "Data", "countries_population.csv");

            _countries = LoadCountries(filePath);
        }

        // -------------------------------------------------------------------------
        // Method: GetCountries
        // Returns all available countries to be used on game creation
        // -------------------------------------------------------------------------
        public IReadOnlyList<CountryDefinition> GetCountries() {

            return _countries.AsReadOnly();

        }

        // -------------------------------------------------------------------------
        // Method: LoadCountries
        // Reads the CSV file, validates its contents and creates country records
        // -------------------------------------------------------------------------
        private static List<CountryDefinition> LoadCountries(string filePath) {

            // Checcks if the population data set exists
            if(!File.Exists(filePath)) {
                throw new FileNotFoundException(
                    "The country population dataset could not be found", filePath);
            }

            List<CountryDefinition> countries = new();

            HashSet<string> countryIds = new(StringComparer.OrdinalIgnoreCase);

            using TextFieldParser parser = new(filePath);

            parser.TextFieldType = FieldType.Delimited;
            parser.SetDelimiters(",");
            parser.HasFieldsEnclosedInQuotes = true;
            parser.TrimWhiteSpace = true;


            // Reads the first row with teh titiles
            string[] headers = parser.ReadFields() ?? throw new InvalidDataException(
                                                        "The CSV file is empty");
                                
            // Vaidates the titles
            string[] expectedHeaders = 
            {
                "CountryId",
                "Name",
                "Population"
            };

            if (headers.Length != expectedHeaders.Length || !headers.Select(h => h.Trim()).SequenceEqual(expectedHeaders, StringComparer.OrdinalIgnoreCase)) {
                throw new InvalidDataException(
                    "CVS Headers must match CountryId,Name,Population"
                );
            }

            // Reads each row of country data
            while (!parser.EndOfData) {
                
                string[] fields = parser.ReadFields() ?? throw new InvalidDataException(
                                                            "Could not read the CSV rows");

                // if the country code is more than 3 throws an exception
                if (fields.Length != 3) {
                    throw new InvalidDataException(
                        $"Invalid CSV row on line {parser.LineNumber}");
                }

                string countryId = fields[0].Trim().ToUpperInvariant();
                string countryName = fields[1].Trim();
                string populationText = fields[2].Trim();

                // checks if country ids match the code format
                if (countryId.Length != 3 || !countryId.All(c => c >= 'A' && c <= 'Z')) {
                    throw new InvalidDataException(
                        $"Invalid country ID: {countryId}");
                }

                // checks if country names are empty
                if (string.IsNullOrWhiteSpace(countryName)) {
                    throw new InvalidDataException(
                        $"Country {countryId} has no name");
                }

                // checks if countr populations are valid number, not negative
                if (!long.TryParse(populationText, NumberStyles.None, CultureInfo.InvariantCulture, out long population)) {
                    throw new InvalidDataException(
                        $"Country {countryId} has an invalid population");
                }

                // Ensure country id's are unique
                if (!countryIds.Add(countryId)) { 
                    throw new InvalidDataException(
                        $"Duplicate country ID: {countryId}");
                }

                countries.Add(new CountryDefinition(countryId, countryName, population));
            }

            // ensures atleast 10 countries are present for the game
            if (countries.Count < 10) {
                throw new InvalidDataException(
                    "The catalogue must contain at least 10 countries");
            }

            // Exclude countries not supported by the frontend's GeoJSON map
            List<CountryDefinition> playableCountries = countries.Where(country => !ExcludedCountryIds.Contains(country.CountryId)).ToList();

            if (playableCountries.Count < 10)
            {
                throw new InvalidDataException(
                    "At least 10 playable countries must be available."
                );
            }
            return playableCountries;
        }
    }

//-----------------------------------------------------------------End of File----------------------------------------------------------------->