@echo off
setlocal
echo ============================================
echo  HERM Platform -- One-Shot Demo Bootstrap
echo ============================================
echo  Runs install + Prisma sync + seed + dev servers in one go.
echo  For day-two start/stop use start.bat / stop.bat.
echo ============================================
echo.

echo [1/6] Checking prerequisites...
where node >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Node.js is not on PATH. Install Node 20+ from https://nodejs.org
    exit /b 1
)
where docker >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Docker is not on PATH. Install Docker Desktop and ensure it's running.
    exit /b 1
)
echo   Node and Docker present.
echo.

echo [2/6] Ensuring .env exists...
if not exist .env (
    copy .env.example .env > nul
    echo   .env created from .env.example
) else (
    echo   .env already present (not overwritten)
)
echo.

echo [3/6] Starting Docker services (PostgreSQL + Redis)...
docker compose up -d
if errorlevel 1 (
    echo   docker compose failed. If you see "port is already allocated" for
    echo   5434 or 6380, an old container or another local Postgres/Redis is
    echo   pinned to the port. Recover with:
    echo       docker compose down
    echo       docker ps -a --format "table {{.Names}}\t{{.Ports}}"
    echo       demo.bat
    exit /b 1
)
echo.

echo [4/6] Waiting for PostgreSQL to be ready...
set /a RETRIES=0
:waitpg
docker compose exec -T postgres pg_isready -U herm -d herm_platform > nul 2>&1
if not errorlevel 1 goto pgready
set /a RETRIES+=1
if %RETRIES% GEQ 30 (
    echo   PostgreSQL did not become ready within 30s. Inspect "docker compose logs postgres".
    exit /b 1
)
timeout /t 1 /nobreak > nul
goto waitpg
:pgready
echo   PostgreSQL is ready.
echo.

echo [5/6] Bootstrapping the workspace (install + generate + db push + seed)...
call npm run demo:bootstrap
if errorlevel 1 (
    echo   demo:bootstrap failed. Re-run after fixing the error reported above.
    exit /b 1
)
echo.

echo ============================================
echo  Demo ready. Credentials are surfaced on the
echo  Login page and documented in DEMO.md.
echo    URL:   http://localhost:5173
echo    Email: demo@demo-university.ac.uk
echo    Pass:  demo12345
echo  Validate from a second terminal with:
echo    npm run demo:validate
echo ============================================
echo.

echo [6/6] Starting development servers (Ctrl+C to stop)...
call npm run dev
