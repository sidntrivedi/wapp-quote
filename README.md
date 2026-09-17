# wapp-quote

A daily WhatsApp bot that sends the next Bhagavad Gita shlokas with Hindi भावार्थ to a group.

Built with [Baileys](https://github.com/WhiskeySockets/Baileys). Intended for small, consenting groups — one message per day, no bulk messaging.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Health webhook setup](docs/HEALTH-SHORTCUT.md) — optional Apple Shortcuts → daily health report on WhatsApp

## Features

- **Bhagavad Gita sequence** — Chapter 1.1 → 18.78, then wraps to 1.1
- **Two shlokas per day** — default `GITA_VERSES_PER_DAY=2`, finishing the Gita in about 350 days
- **API-only content** — fetches `/slok/{chapter}/{verse}/` at send time
- **Clean Hindi message** — Sanskrit shlokas together, then Hindi meaning below
- **Idempotent daily sends** — `data/state.json` prevents duplicates and stores the Gita cursor
- **Retries and catch-up** — retries transient failures, then skips after the catch-up window
- **Optional health webhook** — stores Apple Health payloads and posts a Hindi daily report

## Message format

```text
🌅 सुप्रभात

🕉️ श्रीमद्भगवद्गीता 1.1–1.2
धृतराष्ट्र उवाच ...

सञ्जय उवाच ...

📖 भावार्थ:
1.1 — धृतराष्ट्र ने पूछा ...

1.2 — संजय ने कहा ...
```

## How it works

1. Links to WhatsApp as a paired device and stays connected.
2. At `GITA_TIME`, reads `gitaCursor` from `data/state.json`.
3. Fetches `GITA_VERSES_PER_DAY` consecutive verses from the configured API.
4. Validates each requested chapter/verse, Sanskrit text, and Hindi Devanagari meaning.
5. Sends the message and saves the advanced cursor only after WhatsApp accepts it.

If the API response is invalid or unavailable, the attempt fails/skips. The bot does not send fallback content.

## Requirements

- Node.js 20+
- A WhatsApp account that can link a new device
- Docker Compose (VPS) or [Fly.io](https://fly.io) (recommended)

## Quick start

```bash
git clone git@github.com:sidntrivedi/wapp-quote.git
cd wapp-quote
npm install
cp .env.example .env
```

Edit `.env`:

```bash
AUTH_METHOD=pairing
PAIRING_PHONE_NUMBER=91XXXXXXXXXX
GITA_TIME=06:00
TZ=Asia/Kolkata
```

Pair, find your group, and configure the target:

```bash
npm run dev -- pair
npm run dev -- list-groups       # copy the JID ending in @g.us
# set WHATSAPP_GROUP_JID in .env
npm run dev -- preview           # dry run
npm run dev -- send-now          # send immediately
npm run dev -- serve             # start daily scheduler
```

## Commands

| Command | Description |
|---------|-------------|
| `serve` | Run the daily scheduler |
| `send-now` | Send the next Gita shlokas immediately |
| `preview` | Print the next Gita shlokas without sending |
| `list-groups` | List group names and JIDs |
| `pair` | Link WhatsApp via pairing code |
| `pair-qr` | Link WhatsApp via QR code |
| `reset-auth` | Delete saved WhatsApp session |
| `help` | Show command help |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_GROUP_JID` | — | Target group, ending with `@g.us` |
| `GITA_API_BASE_URL` | `https://vedicscriptures.github.io` | VedicScriptures-compatible base URL |
| `GITA_API_TIMEOUT_MS` | `10000` | API timeout in milliseconds |
| `GITA_HINDI_FIELD` | `tej.ht` | Preferred Hindi meaning field; falls back to first valid Hindi field |
| `GITA_VERSES_PER_DAY` | `2` | Number of consecutive shlokas sent per day |
| `GITA_TIME` | `06:00` | Daily send time, 24-hour local format |
| `GITA_CATCH_UP` | `true` | Poll for missed sends within the catch-up window |
| `TZ` | `Asia/Kolkata` | Timezone for schedule and date tracking |
| `AUTH_METHOD` | `pairing` | `pairing` or `qr` |
| `PAIRING_PHONE_NUMBER` | — | Required for pairing auth; digits only with country code |
| `DATA_DIR` | `./data` | Runtime data directory |
| `LOG_LEVEL` | `info` | Pino log level |
| `HEALTH_WEBHOOK_ENABLED` | `false` | Enable the optional health webhook |
| `HEALTH_WEBHOOK_TOKEN` | — | Required when health webhook is enabled |
| `HEALTH_GROUP_JID` | — | Health report group(s), comma-separated; defaults to `WHATSAPP_GROUP_JID` |

## Health webhook (optional)

When `HEALTH_WEBHOOK_ENABLED=true`, the `serve` process also runs an HTTP server that accepts a daily health payload from an Apple Shortcut and posts a Hindi health report. See [docs/HEALTH-SHORTCUT.md](docs/HEALTH-SHORTCUT.md).

## Deployment

### Fly.io

One always-on machine with a persistent volume at `/app/data` for WhatsApp auth and state.

```bash
brew install flyctl && fly auth login
fly apps create <your-app-name>
fly volumes create wapp_quote_data --size 1 --region sin --app <your-app-name>
fly secrets set \
  PAIRING_PHONE_NUMBER=91XXXXXXXXXX \
  WHATSAPP_GROUP_JID=120363xxxxxxxxxxxxxx@g.us \
  --app <your-app-name>
fly deploy --app <your-app-name>
```

Watch `fly logs` for the pairing code on first deploy. Auth is stored on the volume at `/app/data/auth`.

### Docker Compose

```bash
docker compose up -d --build
docker compose logs -f
```

### Without Docker

```bash
npm run build
npm start
```

## Data and safety

| Path | Purpose |
|------|---------|
| `data/auth/` | WhatsApp session credentials |
| `data/state.json` | Gita cursor and sent dates |
| `data/health.json` | Daily health entries and posted markers, when webhook enabled |

- Restarts do not resend today's Gita message.
- Cursor advances only after WhatsApp accepts the message and state is saved.
- Failed sends retry up to 3 times.
- Never commit `.env` or `data/`.

## Development

```bash
npm test
npm run typecheck
npm run build
```
