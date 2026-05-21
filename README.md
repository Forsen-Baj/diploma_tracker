# Diploma Tracker - Local Setup

## Overview
Diploma Tracker is a full-stack app with:
- Backend: ASP.NET 8 Web API (`backend/DiplomaTracker.Api`)
- Frontend: React + TypeScript + Vite (`frontend/diploma-tracker-web`)

## Prerequisites
- .NET SDK 8.x
- Node.js 18+ (or 20+ recommended) and npm
- SQL Server instance (local or remote)

## 1) Configure backend settings
Open:
- `backend/DiplomaTracker.Api/appsettings.json`

Update these values before running locally:
1. `ConnectionStrings:DefaultConnection`
2. `Jwt:Secret`

Important:
- Use your own SQL Server credentials/host/database in `DefaultConnection`.
- Replace the sample JWT secret with a strong unique secret (long random string).
- Do not commit real secrets to source control.

Example fields to edit:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=...;Database=...;User Id=...;Password=...;Encrypt=False;TrustServerCertificate=True;"
  },
  "Jwt": {
    "Issuer": "DiplomaTracker.Api",
    "Audience": "DiplomaTracker.Web",
    "Secret": "REPLACE_WITH_STRONG_RANDOM_SECRET",
    "ExpiresInMinutes": 60
  }
}
```

## 2) Run backend
From project root:
```powershell
cd backend/DiplomaTracker.Api
dotnet restore
dotnet build
dotnet run --no-build --urls http://localhost:5000
```

What happens on startup:
- EF Core migrations are applied automatically.
- Seed data is inserted automatically if missing.
- Swagger UI is available at: `http://localhost:5000/swagger`

Health check:
- `GET http://localhost:5000/api/health`

## 3) Run frontend
Open a second terminal, from project root:
```powershell
cd frontend/diploma-tracker-web
npm install
npm run dev
```

Frontend default URL:
- `http://localhost:5173`

Note:
- Frontend API base URL is currently hardcoded to `http://localhost:5000` in:
  - `frontend/diploma-tracker-web/src/api/apiClient.ts`

## 4) Seeded local users
The backend seeder creates demo users:
- Admin: `admin@diploma.local` / `Admin123!`
- Teacher: `teacher@diploma.local` / `Teacher123!`
- Student: `student@diploma.local` / `Student123!`

Use these only for local development.

## 5) Build commands
Backend:
```powershell
cd backend/DiplomaTracker.Api
dotnet build
```

Frontend:
```powershell
cd frontend/diploma-tracker-web
npm run build
```

## 6) Troubleshooting
- 401/403 errors:
  - Re-login to refresh token.
  - Verify JWT settings (`Issuer`, `Audience`, `Secret`) are consistent.
- Database connection failures:
  - Recheck `DefaultConnection` in `appsettings.json`.
  - Confirm SQL Server is reachable and credentials are correct.
- CORS errors:
  - Backend allows `http://localhost:5173` by default.
- Frontend cannot call backend:
  - Ensure backend is running on `http://localhost:5000` or update `apiClient.ts`.
