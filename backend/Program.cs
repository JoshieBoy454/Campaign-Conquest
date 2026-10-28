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

