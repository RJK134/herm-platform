@echo off
echo ============================================
echo  HERM Platform — Starting Development Stack
echo ============================================
echo.

echo [1/3] Starting Docker services (PostgreSQL + Redis)...
docker-compose up -d
echo Docker services started.
echo.

echo [2/3] Waiting for PostgreSQL to be ready...
timeout /t 5 /nobreak > nul
echo.

echo [3/3] Starting development servers...
echo   API:    http://localhost:3001
echo   UI:     http://localhost:5173
echo.
npm run dev
