using Configuration;
using Hubs;
using MongoDB.Driver;
using Repositories;
using Services;

var builder = WebApplication.CreateBuilder(args);

const string frontendCors = "Frontend";

builder.Services.Configure<MongoDbOptions>(
    builder.Configuration.GetSection(MongoDbOptions.SectionName));

builder.Services.AddCors(options =>
{
    options.AddPolicy(frontendCors, policy =>
    {
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

string? mongoConnectionString = builder.Configuration["MongoDb:ConnectionString"];
bool useMongo = !string.IsNullOrWhiteSpace(mongoConnectionString);

if (useMongo)
{
    builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoConnectionString));
    builder.Services.AddSingleton<IGameRepository, MongoGameRepository>();
    builder.Services.AddSingleton<IGameEventRepository, MongoGameEventRepository>();
    builder.Services.AddSingleton<IHostSessionRepository, MongoHostSessionRepository>();
}
else
{
    builder.Services.AddSingleton<GameStore>();
    builder.Services.AddSingleton<IGameRepository, InMemoryGameRepository>();
    builder.Services.AddSingleton<IGameEventRepository, InMemoryGameEventRepository>();
    builder.Services.AddSingleton<IHostSessionRepository, InMemoryHostSessionRepository>();
}

// ---- core game services ----
builder.Services.AddScoped<TurnService>();
builder.Services.AddScoped<GameInitializationService>();
builder.Services.AddSingleton<IDiceRoller, RandomDiceRoller>();
builder.Services.AddScoped<CombatService>();
builder.Services.AddScoped<GameActionService>();
builder.Services.AddSingleton<INpcDecisionPolicy, SimpleNpcDecisionPolicy>();

builder.Services.AddSingleton<CountryCatalogueService>();
builder.Services.AddSingleton<GameConcurrencyGate>();
builder.Services.AddSingleton<HostSessionService>();
builder.Services.AddSingleton<IGameStateNotifier, SignalRGameStateNotifier>();
builder.Services.AddHttpClient("llm");
builder.Services.AddSingleton<ICombatCommentaryService, GeminiCombatCommentaryService>();

builder.Services.AddHostedService<NpcTurnHostedService>();

builder.Services.AddHealthChecks();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors(frontendCors);
app.UseAuthorization();
app.MapControllers();
app.MapHub<GameHub>("/hubs/games");
app.MapHealthChecks("/health");

app.Run();

public partial class Program { }

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
