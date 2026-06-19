# OptionScope — Deployment Handoff Summary

This document describes a full-stack app that needs to be deployed. Please help me set it up. Below is everything you need to know about the architecture, what each piece requires, and the recommended hosting path.

---

## What the project is

A web dashboard that analyses Indian stock market (NSE/BSE) option chains using the **Dhan API**. It shows Max Pain, PCR (Put-Call Ratio), OI buildup, support/resistance from OI walls, IV skew, aggregate Greeks, intraday OI trends, a candlestick chart with OI overlay, and a rule-based sentiment summary. It outputs **analytical observations only — no buy/sell trade advice**.

The code is already written, tested, and builds successfully. I just need help **deploying** it. I am NOT a developer, so please give me click-by-click / copy-paste instructions.

---

## Repository structure (monorepo)

```
option-chain-analyser/
├── docker-compose.yml          # runs all 3 services together
├── README.md                   # full docs (architecture, API guide, deploy notes)
├── backend/                    # Python FastAPI backend
│   ├── Dockerfile              # ready to deploy as-is
│   ├── requirements.txt
│   ├── .env.example            # copy to .env and fill in Dhan credentials
│   └── app/                    # FastAPI app, analytics engine, Dhan client, Redis cache
└── frontend/                   # React + TypeScript + Vite + Tailwind
    ├── Dockerfile + nginx.conf # ready to deploy as-is
    ├── package.json
    └── src/                    # all UI components, charts, hooks
```

---

## Tech stack

| Layer       | Technology                                                       |
| ----------- | ---------------------------------------------------------------- |
| Frontend    | React 18 + TypeScript, Vite, TailwindCSS, Recharts + TradingView Lightweight Charts |
| Backend     | Python 3.12 + FastAPI + Uvicorn (async)                          |
| Real-time   | Native WebSocket (with REST polling fallback)                    |
| Cache/Store | Redis (required)                                                 |
| HTTP        | httpx (async) with retry/backoff                                 |

---

## CRITICAL: hosting constraints (this drives the whole deploy)

The backend **cannot run on static-site / pure-serverless hosts** (Netlify Functions, Vercel serverless, GitHub Pages, plain S3). It requires:

1. **An always-on process** — a background loop polls the Dhan API every ~3.5 seconds continuously. This needs a long-running server, not request-scoped serverless functions.
2. **WebSocket support** — live data is pushed to the browser over a persistent WebSocket connection.
3. **Redis** — stores intraday OI snapshots, PCR/IV history, and a last-known-good cache for graceful fallback.

The **frontend** is a static build (`npm run build` → `dist/` folder) and can be hosted anywhere static.

---

## RECOMMENDED deployment path

I want the **simplest possible setup**. Two options — please recommend ONE and walk me through it:

### Option A — Everything on Render (or Railway) — SIMPLEST, one platform
Host frontend + backend + Redis all on the same platform using the included `docker-compose.yml` (or as separate services). One dashboard, one bill, fewer moving parts. **I lean toward this.**

### Option B — Netlify (frontend) + Render/Railway (backend + Redis) — split
- Frontend on Netlify (it's a static React build)
- Backend + Redis on Render or Railway (they support persistent processes + one-click Redis)
- Note: Netlify CANNOT host the backend — it would only host the frontend.

Please tell me which is easier for a non-developer and give me the exact steps for that one.

---

## Environment variables I need to set

### Backend (`backend/.env`)
```
DHAN_ACCESS_TOKEN=<my Dhan JWT access token>      # I already have this
DHAN_CLIENT_ID=<my Dhan client ID>                # I already have this
REDIS_URL=<connection string for the Redis instance>   # from the host's Redis add-on
CORS_ORIGINS=<the public URL of my deployed frontend>  # e.g. https://mysite.onrender.com
APP_ENV=production
```
(I ALREADY HAVE my Dhan token and client ID. Dhan Data APIs add-on is enabled on my account.)

### Frontend (build-time env vars — Vite inlines these at build)
```
VITE_API_BASE_URL=<public URL of the deployed backend>           # e.g. https://my-backend.onrender.com
VITE_WS_URL=<wss:// URL of the backend websocket>                # e.g. wss://my-backend.onrender.com/ws/option-chain
```

---

## Build & run commands (for reference)

**Backend** (Dockerfile already does this):
```
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Frontend**:
```
npm install
npm run build        # outputs to frontend/dist/
```
Serve the `dist/` folder as a static site.

**Everything at once (local or single-box)**:
```
docker compose up --build
```

---

## Important gotchas to handle during setup

1. **WebSocket must use `wss://` (not `ws://`) on HTTPS** — otherwise the browser blocks it. The hosting platform must support WebSocket upgrades (Render and Railway both do).

2. **CORS** — `CORS_ORIGINS` on the backend must EXACTLY match the frontend's public URL, or the dashboard's API calls get blocked.

3. **Free tiers sleep** — Render/Railway free backends spin down when idle and cold-start on the next request. The poller is meant to run continuously during Indian market hours (Mon–Fri, 9:15 AM–3:30 PM IST), so for real use I'll likely need a paid/always-on tier. For testing, free is fine.

4. **Dhan token expiry** — Dhan access tokens are time-limited. If data stops with a 502 error after working, the token expired and needs regenerating + updating in the backend env vars, then restart the backend.

5. **Index instrument IDs** — NIFTY and BANKNIFTY work out of the box. A few other indices (FINNIFTY, SENSEX, MIDCPNIFTY, BANKEX) use community-cited IDs that may need verification against Dhan's instrument list. Test with NIFTY 50 first.

6. **For a SPA on Netlify**, a `netlify.toml` redirect rule is needed so page refreshes don't 404:
   ```toml
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

---

## What success looks like

After deploy, opening the frontend URL should show a dark-themed trading dashboard. During Indian market hours it shows live NIFTY 50 option chain data updating in real time. Outside market hours it shows a "showing last known data" banner instead of an error (this is expected behavior).

---

## My request to you (ChatGPT)

1. Recommend Option A or Option B for a non-developer.
2. Give me step-by-step instructions for the recommended option, including:
   - Creating accounts / services on the host
   - Adding the Redis instance and getting its connection string
   - Setting all the environment variables above
   - Deploying the backend (from the `backend/` folder, using its Dockerfile)
   - Deploying the frontend (building and hosting the static `dist/`)
   - How to verify it's working
3. Help me troubleshoot if I hit errors (I'll paste them).
