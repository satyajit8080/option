# OptionScope — Option Chain & Data Analyser

A production-grade web dashboard for analysing **NSE/BSE option chains** using the **Dhan API**. Covers Max Pain, PCR, OI buildup, OI-based support/resistance, IV skew/rank, an aggregate Greeks dashboard, intraday OI trends, a candlestick-with-OI-overlay chart, and a rule-based sentiment summary.

> **Important:** This tool produces **analytical observations only** — never buy/sell/enter/exit advice. It is not SEBI-registered investment advice. See the disclaimer in the app footer and in [`§7 Constraints`](#7-constraints--rules-as-implemented).

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Project structure](#2-project-structure)
3. [Data flow](#3-data-flow)
4. [Backend](#4-backend)
5. [Frontend](#5-frontend)
6. [Real-time pipeline](#6-real-time-pipeline)
7. [Historical / intraday snapshot logic](#7-historical--intraday-snapshot-logic)
8. [Local setup](#8-local-setup)
9. [Deployment](#9-deployment)
10. [Dhan API configuration guide](#10-dhan-api-configuration-guide)
11. [Constraints & rules as implemented](#11-constraints--rules-as-implemented)
12. [Extending the tool](#12-extending-the-tool)

---

## 1. Architecture

```
                         ┌───────────────────────────────────────────────┐
                         │                  BROWSER (SPA)                 │
                         │  React + TypeScript + Tailwind + Recharts +    │
                         │  TradingView Lightweight Charts                │
                         │                                                │
                         │  ┌────────────┐   WebSocket    ┌────────────┐  │
                         │  │ useLiveData│◀──────────────▶│ OptionChain│  │
                         │  │   hook     │   (live push)  │  Socket    │  │
                         │  └────────────┘                └────────────┘  │
                         │        │  REST (initial load, snapshots,       │
                         │        │  charts, instrument search)           │
                         └────────┼───────────────────────────────────────┘
                                  │
                       ┌──────────▼───────────────────────────────────────┐
                       │             FASTAPI BACKEND (Python)              │
                       │                                                   │
                       │  routers/  →  option_chain · analytics · charts · │
                       │               snapshots · instruments · websocket │
                       │                        │                          │
                       │  services/poller.py  ──┤  one throttled poll loop │
                       │   (per underlying+expiry, broadcasts to WS subs)  │
                       │                        │                          │
                       │   ┌────────────────────┼────────────────────┐     │
                       │   │ dhan_client.py     │   analytics.py      │     │
                       │   │ (REST + 3s throttle)│  chain_builder.py  │     │
                       │   └─────────┬──────────┴─────────┬──────────┘     │
                       └─────────────┼────────────────────┼────────────────┘
                                     │                     │
                          ┌──────────▼─────────┐   ┌───────▼────────┐
                          │     DHAN API v2    │   │     REDIS      │
                          │  /optionchain      │   │ intraday OI    │
                          │  /optionchain/...  │   │ snapshots,     │
                          │  /charts/intraday  │   │ PCR & IV hist, │
                          │                    │   │ last-good cache│
                          └────────────────────┘   └────────────────┘
```

**Tech stack (as built):**

| Layer       | Choice                                                              |
| ----------- | ------------------------------------------------------------------ |
| Frontend    | React 18 + TypeScript, TailwindCSS                                  |
| Charts      | Recharts (analytics charts) + TradingView Lightweight Charts (candles) |
| Backend     | Python 3.12 + FastAPI + Uvicorn                                     |
| Real-time   | Native WebSocket (FastAPI) with REST polling fallback              |
| Cache/Store | Redis (intraday snapshots, time-series history, stale fallback)    |
| HTTP client | httpx (async) with tenacity retry/backoff                          |

---

## 2. Project structure

```
option-chain-analyser/
├── docker-compose.yml          # redis + backend + frontend (single-box deploy)
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py             # FastAPI app, CORS, router wiring, lifespan
│   │   ├── config.py           # pydantic-settings, single source of config
│   │   ├── models/
│   │   │   └── schemas.py      # ALL pydantic models (raw Dhan + derived + analytics)
│   │   ├── services/
│   │   │   ├── dhan_client.py  # typed Dhan REST wrapper + rate-limit guard
│   │   │   ├── instruments.py  # index seed list + scrip-master stock search
│   │   │   ├── chain_builder.py# raw Dhan → processed chain + OI buildup
│   │   │   ├── analytics.py    # Max Pain, PCR, S/R, IV, Greeks, sentiment
│   │   │   ├── cache.py        # Redis: snapshots, PCR/IV history, last-good
│   │   │   └── poller.py       # the live pipeline orchestrator
│   │   ├── routers/
│   │   │   ├── option_chain.py # GET /api/option-chain (+ intraday-baseline)
│   │   │   ├── analytics.py    # GET /api/analytics/* (per-widget slices)
│   │   │   ├── charts.py       # GET /api/charts/intraday-with-oi
│   │   │   ├── snapshots.py    # GET /api/snapshots/* (history, OI series)
│   │   │   ├── instruments.py  # indices, stock search, expiry list
│   │   │   └── websocket.py    # WS /ws/option-chain (subscribe/unsubscribe)
│   │   └── utils/
│   │       └── throttle.py     # generic async rate limiter
│   └── tests/
│       └── test_analytics.py   # 15 unit tests incl. "no trade advice" guard
│
└── frontend/
    ├── Dockerfile + nginx.conf
    ├── package.json · vite.config.ts · tailwind.config.ts · tsconfig.json
    ├── .env.example
    └── src/
        ├── main.tsx · App.tsx · index.css
        ├── types/index.ts      # TS mirror of backend schemas
        ├── api/
        │   ├── client.ts       # typed REST client
        │   └── websocket.ts    # auto-reconnecting WS wrapper
        ├── hooks/
        │   ├── useOptionChain.ts   # instrument + expiry selection
        │   ├── useLiveData.ts      # WS live feed (+ polling fallback, pause)
        │   └── useAuxiliaryData.ts # PCR + OI time-series polling
        ├── lib/format.ts       # Indian number formatting, color tokens
        ├── components/
        │   ├── Layout/         # Header, Footer
        │   ├── Controls/       # Instrument/Expiry/AutoRefresh/Snapshot selectors
        │   ├── OptionChainTable/   # virtualized NSE-style chain table
        │   ├── Charts/         # OIBar, MaxPain, PCRGauge, PCRTrend, IVSkew,
        │   │                   # OIHeatmap, OITimeSeries, CandlestickOI
        │   ├── GreeksCards/    # aggregate Greeks summary cards
        │   ├── SentimentPanel/ # rule-based sentiment summary
        │   └── Panels/         # Support/Resistance, Unusual OI alerts
        └── pages/Dashboard.tsx # composition of everything
```

---

## 3. Data flow

1. **Selection** — `useOptionChain` loads the index list (`GET /api/instruments/indices`) and, on instrument change, its expiries (`GET /api/instruments/{scrip}/expiries`).
2. **Subscribe** — `useLiveData` opens a WebSocket and sends `{action:"subscribe", underlying_scrip, underlying_seg, expiry, label}`.
3. **Poll** — The backend spins up exactly **one** `OptionChainPoller` task per `(underlying, expiry)` regardless of how many browser tabs subscribe. It calls Dhan every ≥3.5 s.
4. **Process** — Each poll: `chain_builder` converts the raw response → processed chain (OI change, ATM, buildup); `analytics` computes Max Pain / PCR / S-R / IV / Greeks / sentiment.
5. **Persist** — `cache` writes an intraday OI snapshot + appends to PCR history, and stores the full payload as "last known good".
6. **Broadcast** — The processed `FullChainResponse` is pushed to every subscribed WS client.
7. **Render** — `Dashboard` fans the payload out to the table, charts, gauges, and panels.

---

## 4. Backend

### Key modules

- **`services/dhan_client.py`** — async wrapper for the three Dhan endpoints this app uses. Carries a built-in min-interval throttle for the option-chain endpoint (Dhan's documented limit: **1 request / 3 s per unique `(underlying, expiry)`**). Retries transient network/5xx errors with exponential backoff; deliberately surfaces 429s so the poller can back off instead of hammering.
- **`services/chain_builder.py`** — maps Dhan's exact wire format (`data.oc["25650.000000"].ce/pe`) into our `OptionChainView`, computing OI change %, ATM strike, and the standard **OI-buildup quadrant** (Long/Short Buildup, Long Unwinding, Short Covering).
- **`services/analytics.py`** — the engine. Pure functions, fully unit-tested. Every threshold (PCR bands, wall count, unusual-OI %) is centralised at the top of the file.
- **`services/poller.py`** — the bridge between "throttled REST pull from one upstream" and "WebSocket push to many clients".

### API endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/health` | Liveness check |
| GET | `/api/instruments/indices` | Major indices seed list |
| GET | `/api/instruments/search?q=` | Stock search via Dhan scrip master |
| GET | `/api/instruments/{scrip}/expiries` | Active expiry dates |
| GET | `/api/option-chain` | Full processed chain + analytics (day-over-day OI) |
| GET | `/api/option-chain/intraday-baseline` | Same, but OI diffed vs an earlier snapshot today |
| GET | `/api/analytics/{max-pain,pcr,support-resistance,greeks,sentiment,unusual-oi}` | Per-widget slices |
| GET | `/api/charts/intraday-with-oi` | Candlestick OHLC + total-OI overlay series |
| GET | `/api/snapshots/{scrip}/{expiry}` | List captured intraday snapshots |
| GET | `/api/snapshots/{scrip}/{expiry}/oi-at?timestamp=` | OI map at a given time |
| GET | `/api/snapshots/{scrip}/{expiry}/oi-time-series` | Total CE/PE OI over the day |
| GET | `/api/snapshots/{scrip}/{expiry}/pcr-history` | PCR readings over the day |
| WS  | `/ws/option-chain` | Live chain push (subscribe/unsubscribe) |

Interactive API docs are auto-generated at **`http://localhost:8000/docs`**.

---

## 5. Frontend

- **Dark "amber terminal" theme** — deep navy-charcoal surfaces, a warm amber/gold accent, and a desaturated teal/coral pair for CE/PE (instead of harsh pure red/green) — easier on the eyes across a full session. All tokens live in `tailwind.config.ts`.
- **Virtualized option chain table** (`react-window`) — handles 100+ strikes smoothly; auto-scrolls to ATM; strike-window filter (±10/±20/±40/All); NSE-style CE | Strike | PE layout with mirrored columns and inline OI bars.
- **Charts** — OI bar chart, Max Pain area chart with marker, custom SVG PCR speedometer, PCR trend, IV skew, OI heatmap strip, intraday OI time-series, and a TradingView candlestick chart with a secondary-axis OI overlay.
- **Tooltips** — every metric card has an info dot explaining the metric for beginners.
- **Mobile-responsive** — columns progressively hide at smaller breakpoints; controls reflow; the chain stays usable on a phone.
- **Accessibility** — visible focus rings, `prefers-reduced-motion` handling, `role="switch"` on toggles, tabular numerals so ticking numbers don't jitter.

---

## 6. Real-time pipeline

The app supports two live modes, switchable from the auto-refresh control:

- **Live (WebSocket)** — default. One backend poller per topic; sub-second fan-out to all tabs. The WS client (`api/websocket.ts`) auto-reconnects with exponential backoff and re-subscribes on reconnect.
- **Polling (30 s / 60 s)** — the `useLiveData` hook falls back to plain `GET /api/option-chain` on an interval. Useful behind corporate proxies that block WebSockets.

Switching instrument or expiry simply sends a new `subscribe` message; the server unsubscribes you from the old topic (and stops that poller if you were its last listener) and joins the new one.

**Why one poller per topic?** Dhan rate-limits the option-chain endpoint to 1 req / 3 s per `(underlying, expiry)`. Centralising the poll means 1 or 1,000 connected tabs generate the *same* upstream load, and every analytics endpoint reuses that single throttled fetch.

---

## 7. Historical / intraday snapshot logic

All intraday state is stored in Redis, **scoped per `(scrip, expiry, IST-date)`** so it resets automatically each trading day without a cron:

- **OI snapshots** — on every poll, a compact `{strike: {ce, pe}}` OI map is appended to a Redis sorted set keyed by timestamp (TTL = `SNAPSHOT_RETENTION_HOURS`). The **snapshot selector** in the header lists these (9:30, 11:00, 1:30…). Selecting one calls `/api/option-chain/intraday-baseline`, which re-diffs the *current* chain's OI against that earlier snapshot — so OI-buildup classification switches from "vs yesterday's close" to "vs 9:30 today".
- **PCR history** — each poll appends `{ts, pcr}` to a capped Redis list → feeds the PCR trend chart.
- **ATM IV history** — a rolling window (default 252 points) → feeds IV Rank / IV Percentile. (Seed this from a scheduled job for a meaningful rank; it returns `null` until enough points exist.)
- **Previous session comparison** — Dhan's payload already includes `previous_oi` / `previous_close_price` (prior session), which is what the default day-over-day view and buildup classification use.
- **Last-known-good** — the full processed payload is cached so that if Dhan is down or the market is closed, the API serves the last good response flagged `is_stale=true` with a reason, and the UI shows a non-blocking "showing last known data" banner.

---

## 8. Local setup

### Prerequisites
- Python 3.12+, Node 18+, Redis 6+ (or just Docker)
- A Dhan account with API access (see [§10](#10-dhan-api-configuration-guide))

### Option A — Docker (everything at once)

```bash
cd option-chain-analyser
cp backend/.env.example backend/.env      # then fill in your Dhan creds
docker compose up --build
# Frontend → http://localhost:8080
# Backend  → http://localhost:8000/docs
```

### Option B — Run each piece manually

**1. Redis**
```bash
redis-server            # or: docker run -p 6379:6379 redis:7-alpine
```

**2. Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # fill in DHAN_ACCESS_TOKEN + DHAN_CLIENT_ID
uvicorn app.main:app --reload --port 8000
```

**3. Frontend**
```bash
cd frontend
npm install
cp .env.example .env     # defaults point at localhost:8000
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to `localhost:8000`, so no CORS config is needed in dev.

### Run the tests
```bash
cd backend && pytest                 # 15 analytics tests
cd frontend && npm run build         # full type-check + production build
cd frontend && npx eslint .          # lint
```

---

## 9. Deployment

### Recommended: Vercel (frontend) + Railway/Render (backend + Redis)

**Backend on Railway/Render**
1. Point the service at `backend/` (the `Dockerfile` is ready to use).
2. Add a Redis instance (Railway/Render both offer one-click Redis) and set `REDIS_URL` to its connection string.
3. Set env vars: `DHAN_ACCESS_TOKEN`, `DHAN_CLIENT_ID`, `CORS_ORIGINS` (your Vercel URL), `APP_ENV=production`.
4. Note the public backend URL, e.g. `https://optionscope-api.up.railway.app`.

**Frontend on Vercel**
1. Import the repo, set the root directory to `frontend/`.
2. Build command `npm run build`, output dir `dist`.
3. Set env vars:
   - `VITE_API_BASE_URL=https://optionscope-api.up.railway.app`
   - `VITE_WS_URL=wss://optionscope-api.up.railway.app/ws/option-chain`
4. Deploy.

> WebSockets need `wss://` (not `ws://`) once you're on HTTPS. Railway/Render both support WebSocket upgrades out of the box.

### Alternative: single box / AWS
- Use the provided `docker-compose.yml` on an EC2 instance (or any VM). Put Nginx/ALB in front for TLS termination, and point `VITE_*` build args at your public domain.
- For Redis durability, use a managed instance (ElastiCache) and set `REDIS_URL` accordingly.

---

## 10. Dhan API configuration guide

### Getting credentials
1. Log into [Dhan Web](https://web.dhan.co).
2. Go to **Profile → DhanHQ Trading APIs** (the Data APIs add-on must be enabled on your account).
3. Generate an **access token** (a JWT). Note your **client ID** (Dhan user ID).
4. Put both in `backend/.env`:
   ```
   DHAN_ACCESS_TOKEN=eyJ0eXAiOiJKV1Qi...      # the JWT
   DHAN_CLIENT_ID=1000000001                   # your Dhan client id
   ```

> Tokens expire — Dhan access tokens are time-limited (regenerate as needed). For an always-on production deployment, automate token refresh per Dhan's auth flow.

### How requests are authenticated
Every request sends these headers (handled in `dhan_client._headers()`):
```
Content-Type: application/json
access-token: <JWT>
client-id:    <client id>
```

### Response mapping
Dhan's option-chain response is mapped 1:1 by `models/schemas.py`:

```
Dhan field path                          →  Our model
data.last_price                          →  OptionChainView.spot_price
data.oc["<strike>"].ce.oi                →  StrikeRow.ce.oi
data.oc["<strike>"].ce.implied_volatility→  StrikeRow.ce.iv
data.oc["<strike>"].ce.greeks.delta      →  StrikeRow.ce.delta
data.oc["<strike>"].ce.previous_oi       →  baseline for OI-change %
... (pe mirrors ce)
```

### Instrument IDs (important)
- **NIFTY (`13`)** and **BANKNIFTY (`25`)** on segment **`IDX_I`** are confirmed from Dhan's own sample code.
- Other index IDs in `services/instruments.py` (`FINNIFTY`, `MIDCPNIFTY`, `SENSEX`, `BANKEX`) are **commonly-cited community values, not independently verified in this codebase** — verify them against the scrip master before trusting them in production. Dhan can renumber instruments.
- **Stocks** are resolved generically via Dhan's **scrip master CSV** (`https://images.dhan.co/api-data/api-scrip-master-detailed.csv`), downloaded and cached by `ScripMasterService`. The exact CSV column names have shifted across Dhan revisions, so `search_stocks` matches column headers case-insensitively against several candidates — **double-check the column mapping against a freshly downloaded CSV** if stock search returns nothing.

### Rate limits
- Option Chain: **1 request / 3 s per `(underlying, expiry)`** — enforced by `OPTION_CHAIN_POLL_INTERVAL_SECONDS` (default 3.5 s) and the client's throttle. **Do not lower below 3.0.**
- The intraday chart endpoint has its own separate limit and deliberately bypasses the option-chain throttle.

---

## 11. Constraints & rules (as implemented)

| Requirement | How it's met |
| ----------- | ------------ |
| **No trade advice** | The sentiment engine emits only observational labels (Bullish/Bearish/Neutral/Sideways) + factor explanations. A unit test (`test_sentiment_never_contains_trade_advice_words`) asserts no buy/sell/enter/exit language ever appears. |
| **Disclaimer** | Persistent footer disclaimer (not SEBI-registered advice) + disclaimer baked into every `SentimentSummary` payload. |
| **Performance (100+ strikes)** | `react-window` virtualization in the chain table; strike-window filter; memoized rows. |
| **API rate limits** | Per-topic single poller + client-side throttle + tenacity backoff; 429s surface rather than retry-storm. |
| **Error handling / market closed** | Last-known-good Redis cache → `is_stale` flag → non-blocking UI banner. Malformed-cache and missing-creds paths fail with clean 502s, never 500 stack traces. |

---

## 12. Extending the tool

- **Multi-expiry OI heatmap** — the heatmap currently shows one expiry. To span expiries, poll several expiries (each is its own throttled topic) and stack the rows.
- **IV Rank seeding** — wire a daily scheduled job to call `cache.append_atm_iv` at session close so IV Rank/Percentile become meaningful faster.
- **Alerts** — `detect_unusual_oi` already flags OI spikes; pipe these to a notification channel (email/Telegram/web push) for a full alerting feature.
- **Auth & multi-user** — add per-user Dhan tokens + a session layer if you productionise beyond a single account.
- **Historical replay** — the snapshot selector swaps the *baseline* today; extend it into a full scrubber that replays the whole session by stepping through stored snapshots.

---

*Built as a complete, runnable reference implementation. Backend imports cleanly, all 15 analytics tests pass, the live WebSocket pipeline is verified end-to-end, and the frontend type-checks + builds for production.*
