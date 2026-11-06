using Services;

var builder = WebApplication.CreateBuilder(args);

const string frontendCors = "Frontend";

builder.Services.AddCors(options =>
{
    options.AddPolicy(frontendCors, policy =>
    {
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// ---- core game services ----
builder.Services.AddScoped<TurnService>();
builder.Services.AddScoped<GameInitializationService>();
builder.Services.AddSingleton<IDiceRoller, RandomDiceRoller>();
builder.Services.AddScoped<CombatService>();
builder.Services.AddScoped<GameActionService>();
builder.Services.AddSingleton<INpcDecisionPolicy, SimpleNpcDecisionPolicy>();

builder.Services.AddSingleton<CountryCatalogueService>();
builder.Services.AddSingleton<GameStore>();

builder.Services.AddHostedService<NpcTurnHostedService>();

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

app.Run();

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
