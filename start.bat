@echo off
setlocal
echo ============================================
echo  HERM Platform -- Starting Development Stack
echo ============================================
echo.

echo [1/5] Ensuring .env exists...
if not exist .env (
    copy .env.example .env > nul
    echo   .env created from .env.example
) else (
    echo   .env already present
)
echo.

echo [2/5] Starting Docker services (PostgreSQL + Redis)...
docker-compose up -d
if errorlevel 1 (
    echo.
    echo   Docker failed to start. If you see "port is already allocated"
    echo   for 5434 or 6380, an old container is still pinned to the old
    echo   port mapping, or another container on this host is using the
    echo   port. Recover with:
    echo       docker-compose down
    echo       docker ps -a --format "table {{.Names}}\t{{.Ports}}"
    echo       start.bat
    exit /b 1
)
echo.

echo [3/5] Waiting for PostgreSQL to be ready...
set /a RETRIES=0
:waitpg
docker-compose exec -T postgres pg_isready -U herm -d herm_platform > nul 2>&1
if not errorlevel 1 goto pgready
set /a RETRIES+=1
if %RETRIES% GEQ 30 (
    echo   PostgreSQL did not become ready within 30s. Check "docker-compose logs postgres".
    exit /b 1
)
timeout /t 1 /nobreak > nul
goto waitpg
:pgready
echo   PostgreSQL is ready.
echo.

echo [4/5] Syncing Prisma client and schema...
call npm run db:generate
if errorlevel 1 exit /b 1
call npm run db:push
if errorlevel 1 exit /b 1
echo.
echo   If this is the first time you are starting the platform, run:
echo       npm run db:seed
echo   (in a second terminal) to populate frameworks, capabilities, vendors.
echo.

echo [5/5] Starting development servers...
echo   API:    http://localhost:3002
echo   UI:     http://localhost:5173
echo.
npm run dev
