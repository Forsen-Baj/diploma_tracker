# Build stage: the .NET SDK compiles and publishes the API.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first, on its own layer, so package downloads are cached between code changes.
COPY DiplomaTracker.Api/DiplomaTracker.Api.csproj DiplomaTracker.Api/
RUN dotnet restore DiplomaTracker.Api/DiplomaTracker.Api.csproj

COPY DiplomaTracker.Api/ DiplomaTracker.Api/
RUN dotnet publish DiplomaTracker.Api/DiplomaTracker.Api.csproj -c Release -o /app --no-restore

# Runtime stage: only the ASP.NET runtime (it ships with ICU and tzdata, so Kyiv time resolves).
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Uploaded and generated documents live here; docker-compose mounts a volume over it.
# Creating it in the image gives the volume the non-root `app` user as its owner.
RUN mkdir -p /data/uploads && chown app:app /data/uploads

COPY --from=build /app .
USER app

# The aspnet image listens on 8080 by default (ASPNETCORE_HTTP_PORTS).
EXPOSE 8080
ENTRYPOINT ["dotnet", "DiplomaTracker.Api.dll"]
