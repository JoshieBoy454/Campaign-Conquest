using System.Globalization;
using System.Text.Json;
using Microsoft.VisualBasic.FileIO;
using Models;

namespace Services;

// -----------------------------------------------------------------------------
// Class: CountryCatalogueService
// This will load and validate the country population dataset loaded in : countries_population.csv
// -----------------------------------------------------------------------------
public class CountryCatalogueService {

    // Countries available in the population dataset but missing from GeoJSON
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

        List<CountryDefinition> countries = LoadCountries(filePath);

        string supportedPath = Path.Combine(environment.ContentRootPath, "Data", "supported_country_ids.json");

        _countries = ApplySupportedCountryFilter(countries, supportedPath);
    }

    // -------------------------------------------------------------------------
    // Method: GetCountries
    // Returns all available countries to be used on game creation
    // -------------------------------------------------------------------------
    public IReadOnlyList<CountryDefinition> GetCountries() {

        return _countries.AsReadOnly();
    }

    // ---- Optional GeoJSON id list narrows the playable catalogue ----
    private static List<CountryDefinition> ApplySupportedCountryFilter(
        List<CountryDefinition> countries,
        string supportedPath) {

        if (!File.Exists(supportedPath)) {
            return countries;
        }

        SupportedCountryIdsFile? supported = JsonSerializer.Deserialize<SupportedCountryIdsFile>(
            File.ReadAllText(supportedPath),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (supported?.CountryIds == null || supported.CountryIds.Count == 0) {
            return countries;
        }

        HashSet<string> allowed = new(supported.CountryIds, StringComparer.OrdinalIgnoreCase);

        List<CountryDefinition> filtered = countries
            .Where(country => allowed.Contains(country.CountryId))
            .ToList();

        if (filtered.Count < 10) {
            throw new InvalidDataException(
                "At least 10 playable countries must remain after applying supported_country_ids.json."
            );
        }

        return filtered;
    }

    // -------------------------------------------------------------------------
    // Method: LoadCountries
    // Reads the CSV file, validates its contents and creates country records
    // -------------------------------------------------------------------------
    private static List<CountryDefinition> LoadCountries(string filePath) {

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

        string[] headers = parser.ReadFields() ?? throw new InvalidDataException(
                                                        "The CSV file is empty");

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

        while (!parser.EndOfData) {
                
            string[] fields = parser.ReadFields() ?? throw new InvalidDataException(
                                                            "Could not read the CSV rows");

            if (fields.Length != 3) {
                throw new InvalidDataException(
                    $"Invalid CSV row on line {parser.LineNumber}");
            }

            string countryId = fields[0].Trim().ToUpperInvariant();
            string countryName = fields[1].Trim();
            string populationText = fields[2].Trim();

            if (countryId.Length != 3 || !countryId.All(c => c >= 'A' && c <= 'Z')) {
                throw new InvalidDataException(
                    $"Invalid country ID: {countryId}");
            }

            if (string.IsNullOrWhiteSpace(countryName)) {
                throw new InvalidDataException(
                    $"Country {countryId} has no name");
            }

            if (!long.TryParse(populationText, NumberStyles.None, CultureInfo.InvariantCulture, out long population)) {
                throw new InvalidDataException(
                    $"Country {countryId} has an invalid population");
            }

            if (!countryIds.Add(countryId)) { 
                throw new InvalidDataException(
                    $"Duplicate country ID: {countryId}");
            }

            countries.Add(new CountryDefinition(countryId, countryName, population));
        }

        if (countries.Count < 10) {
            throw new InvalidDataException(
                "The catalogue must contain at least 10 countries");
        }

        List<CountryDefinition> playableCountries = countries
            .Where(country => !ExcludedCountryIds.Contains(country.CountryId))
            .ToList();

        if (playableCountries.Count < 10)
        {
            throw new InvalidDataException(
                "At least 10 playable countries must be available."
            );
        }

        return playableCountries;
    }

    private sealed class SupportedCountryIdsFile {
        public List<string> CountryIds { get; set; } = new();
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
