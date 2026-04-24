# Sharing the HERM platform with a colleague

Ways to let a colleague exercise a running local instance **without Tailscale**, ranked by fit. Pick based on how long the testing window is and whether the colleague is technical.

| Option | Setup time | Durability | Best for |
|---|---|---|---|
| A. ngrok | 5 min | Session (URL dies when you Ctrl-C) | One-off demo, 30–60 min |
| B. Cloudflare Tunnel | 10 min | Session or persistent (with domain) | Short session with no signup |
| C. Deploy to Fly.io / Render | 30–60 min | Permanent URL | Week-long test window |
| D. Send them the repo | 15 min (their side) | N/A — they run their own | Technical colleague, fully offline |

**Rule of thumb:** < 1 hour → A. > 1 day → C. Anything else → B.

---

## A · ngrok (recommended for short sessions)

Free account + free tier are enough. URL rotates each restart; $8/mo plan gives a stable subdomain.

**One-time setup:**
```bash
# macOS
brew install ngrok
# Linux
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc \
  && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list \
  && sudo apt update && sudo apt install ngrok
# Windows
winget install ngrok.ngrok

# Sign up at https://ngrok.com, grab your auth token, then:
ngrok config add-authtoken <YOUR_TOKEN>
```

**Each session:**
```bash
# Start your stack as usual
npm run dev

# In a second terminal — expose the Vite dev server
ngrok http 5173
```

ngrok prints a line like:
```
Forwarding  https://7f2a-1-2-3-4.ngrok-free.app -> http://localhost:5173
```
Send that HTTPS URL to your colleague.

**API calls:** the Vite dev server's built-in proxy (`client/vite.config.ts`) forwards `/api/*` to port 3002 — so long as your colleague's requests flow through the Vite URL, the API works transparently. If they call the API directly, expose it separately with a second `ngrok http 3002` and set `VITE_API_URL` accordingly before rebuilding.

**Caveats:**
- Free tier: 40 connections/minute. Fine for one colleague, tight if you're demoing to a group.
- The URL changes every restart. Re-send it.
- ngrok's interstitial page appears once per new visitor — they click "Visit Site" and it goes away.

---

## B · Cloudflare Tunnel (free, no account for random URLs)

No signup needed for the quick form. If you own a domain on Cloudflare, you can pin a permanent `*.yourdomain.com` subdomain.

**Install:**
```bash
# macOS
brew install cloudflared
# Linux
sudo apt install cloudflared      # or from https://pkg.cloudflare.com
# Windows
winget install --id Cloudflare.cloudflared
```

**Quick tunnel (random URL, no account):**
```bash
cloudflared tunnel --url http://localhost:5173
```
Outputs a line like `https://foo-bar-baz.trycloudflare.com`. Share that.

**Caveats:** same API-port notes as ngrok. No rate limits for small use. Random hostname dies when you Ctrl-C.

---

## C · Host it on Fly.io (recommended for week-long testing)

Persistent HTTPS URL, managed Postgres, no tunnel to keep alive on your laptop.

**One-time setup (30–60 min):**

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. `fly auth signup` (or `fly auth login`)
3. In the repo root: `fly launch` — answer the prompts:
   - App name: pick something like `herm-demo-<yourname>`
   - Region: `lhr` (London) is closest for UK testers
   - Postgres: yes, create a new one (launches a managed Postgres app)
   - Redis: yes (or skip — the app degrades gracefully without Redis)
   - Deploy now: **no** (we need to set secrets first)
4. Set the secrets flyctl will not auto-detect:
   ```bash
   fly secrets set \
     NODE_ENV=production \
     JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(64).toString("hex"))')" \
     ANTHROPIC_API_KEY="sk-ant-api03-…" \
     FRONTEND_URL="https://herm-demo-<yourname>.fly.dev" \
     DEV_UNLOCK_ALL_TIERS=true
   ```
   (`DATABASE_URL` and `REDIS_URL` were set automatically when you attached the Postgres/Redis apps.)
5. `fly deploy`.
6. Run migrations + seed (one-off):
   ```bash
   fly ssh console -C "npx prisma migrate deploy"
   fly ssh console -C "npx tsx prisma/seed.ts"
   ```
7. Browse `https://herm-demo-<yourname>.fly.dev`, log in with `demo@demo-university.ac.uk` / `demo12345`.

**Updating after a code change:** `fly deploy`. Takes ~2–3 min.

**When you're done testing:**
```bash
fly apps destroy herm-demo-<yourname>
fly apps destroy herm-demo-<yourname>-db
```
Both apps go away and billing stops.

**Cost:** on Fly's free-ish tier, a small app + a small Postgres run at roughly $0–5/mo for light testing traffic. Stop the machines (`fly scale count 0`) when idle.

**Render is an alternative** with similar ergonomics — free tier spins down after 15 min of inactivity, which is fine for async testing but annoying for live demos. Use Fly unless you have a Render account already.

---

## D · Send them the repo (for a technical colleague)

Lowest-friction, fully-offline, and they get their own throwaway database. No hosting cost, no exposure of your machine.

**Tell them:**
```bash
git clone <repo-url> herm-platform
cd herm-platform

cp .env.example .env
# Generate a JWT secret for their copy:
node -e "console.log('JWT_SECRET=\"' + require('crypto').randomBytes(64).toString('hex') + '\"')" >> .env
# They'll also want their own ANTHROPIC_API_KEY in .env if testing AI features.
# For the testing window, also add:
echo 'DEV_UNLOCK_ALL_TIERS="true"' >> .env

docker compose up -d                 # Postgres + Redis
npm install
cd server && npx prisma generate && npx prisma db push --accept-data-loss && npx tsx prisma/seed.ts && cd ..
npm run dev                          # client + server in one terminal
```
Then browse `http://localhost:5173` and log in as `demo@demo-university.ac.uk` / `demo12345`.

**Prereqs on their machine:** Docker, Node 20+, git. If they can't install Docker, they'll need a local Postgres 16 on port 5434 (see `docker-compose.yml` for creds).

---

## Security notes

Tunnelling your dev machine makes your running API reachable from the internet for as long as the tunnel is up.

- **Don't leave a tunnel open overnight.** Ctrl-C when done.
- **Don't tunnel in a mode that's reachable from public routing tables persistently** (i.e. A, B) if your dev DB contains anything you wouldn't put on a public URL. Demo seed data is fine.
- **Do not disable `DEV_UNLOCK_ALL_TIERS`'s production guard** — the env-check warns if it sees `NODE_ENV=production` with the flag set.
- `.env` stays on your machine. Do not paste its contents into any chat / PR / issue.
- The demo account password (`demo12345`) is weak intentionally, so rotate it before exposing anything past testing.

---

## Troubleshooting

**"Blocked: Invalid Host header" on the ngrok URL** — Vite is in dev mode and rejects the unknown host. Add the ngrok host to `client/vite.config.ts`:
```ts
server: { host: true, hmr: { host: '<your-ngrok-hostname>' }, allowedHosts: ['.ngrok-free.app', '.trycloudflare.com'] }
```

**`CORS` errors when calling the API** — set `FRONTEND_URL` in `.env` to the tunnel URL and restart the server.

**Fly deploy loops / crashes on startup** — `fly logs`. First-run problems are almost always unset secrets or a missed `prisma migrate deploy`.

**AI Assistant returns a fallback message** — `ANTHROPIC_API_KEY` is unset or invalid on the deployed host. See `docs/AI_GOVERNANCE.md` → "Rotating the API key".
