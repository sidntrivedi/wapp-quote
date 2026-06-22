# wapp-quote

A daily Hindi quote bot for WhatsApp groups. Posts one uplifting message per day at a scheduled time, sourced from Hindi Wikiquote with a local fallback.

Built with [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web protocol). Intended for small, consenting groups — one message per day, no bulk messaging.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system design, module map, runtime flows, and agent onboarding

## Features

- **Daily scheduling** — in-process cron (`node-cron`), default 06:00 IST
- **Wikiquote sourcing** — approved author list, deduplication, round-robin rotation
- **Local fallback** — curated `quotes.json` when Wikiquote is unavailable
- **AI reflections** — optional Ollama Cloud for the daily reflection line (quote text unchanged)
- **Idempotent sends** — tracks sent dates in `data/state.json`; restarts never duplicate
- **Fly.io ready** — always-on machine with persistent volume for auth and state

## How it works

1. Links to WhatsApp as a paired device and stays connected.
2. At the configured time, fetches a quote (Wikiquote → local fallback).
3. Optionally enriches the reflection via Ollama Cloud.
4. Sends to the target group JID and records the send in state.

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

Edit `.env` with your phone number and schedule:

```bash
AUTH_METHOD=pairing
PAIRING_PHONE_NUMBER=91XXXXXXXXXX
QUOTE_TIME=06:00
TZ=Asia/Kolkata
```

Pair, find your group, and configure the target:

```bash
npm run dev -- pair              # link WhatsApp (clears stale session first)
npm run dev -- list-groups       # copy the JID ending in @g.us
# set WHATSAPP_GROUP_JID in .env
npm run dev -- preview           # dry run
npm run dev -- send-now          # send immediately
npm run dev -- serve             # start daily scheduler
```

**Pairing alternatives**

| Command | Use when |
|---------|----------|
| `pair-qr` | Phone-number pairing is rejected |
| `reset-auth` | You need a clean session before re-pairing |

## Commands

| Command | Description |
|---------|-------------|
| `serve` | Run the daily scheduler (production mode) |
| `send-now` | Send a quote immediately (forces send, even if already sent today) |
| `preview` | Print the next quote without sending |
| `list-groups` | List group names and JIDs |
| `pair` | Link WhatsApp via pairing code |
| `pair-qr` | Link WhatsApp via QR code |
| `reset-auth` | Delete saved WhatsApp session |
| `help` | Show command help |

## Configuration

See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_GROUP_JID` | — | Target group (ends with `@g.us`) |
| `QUOTE_TIME` | `06:00` | Send time, 24-hour local format |
| `TZ` | `Asia/Kolkata` | Timezone for schedule and date tracking |
| `QUOTE_SOURCE` | `wikiquote` | `wikiquote` or `local` |
| `WIKIQUOTE_LANGUAGE` | `hi` | Hindi Wikiquote (`hi.wikiquote.org`) |
| `WIKIQUOTE_MODE` | `pages` | `pages`, `authors`, or `any` |
| `AI_PROVIDER` | `none` | `none`, `openai`, or `ollama-cloud` |
| `OPENAI_API_KEY` | — | Required when `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI chat model |
| `OLLAMA_API_KEY` | — | Required when `AI_PROVIDER=ollama-cloud` |

**Wikiquote modes**

- `pages` — built-in approved author list (recommended)
- `authors` — random author from Wikiquote categories
- `any` — random page (less reliable attribution)

Override the author list with `WIKIQUOTE_PAGES=page\|author,page\|author`.

**AI reflection**

When `AI_PROVIDER=openai` or `AI_PROVIDER=ollama-cloud`, the bot calls the configured provider to generate the reflection line (`आज की दिशा`). The quote and author are never modified. On failure or validation error, the built-in fallback is used.

Recommended for OpenAI: `AI_PROVIDER=openai` with `OPENAI_MODEL=gpt-4o-mini` (~1 call/day, very low cost).

## Deployment

### Fly.io (recommended)

One always-on machine with a persistent volume at `/app/data` for WhatsApp auth and send state.

```bash
brew install flyctl && fly auth login
```

Edit `app` in `fly.toml`, then:

```bash
fly apps create <your-app-name>
fly volumes create wapp_quote_data --size 1 --region sin --app <your-app-name>
fly secrets set \
  PAIRING_PHONE_NUMBER=91XXXXXXXXXX \
  WHATSAPP_GROUP_JID=120363xxxxxxxxxxxxxx@g.us \
  OPENAI_API_KEY=your_key \
  --app <your-app-name>
fly deploy --app <your-app-name>
```

On first deploy, watch `fly logs` for the pairing code. Auth is stored on the volume at `/app/data/auth`.

**Operations**

```bash
fly status --app <your-app-name>
fly logs --app <your-app-name>
fly ssh console -C "node dist/src/cli.js send-now" --app <your-app-name>
fly secrets set WHATSAPP_GROUP_JID=<new-jid> --app <your-app-name>   # change target group
```

There is no Fly Cron job — scheduling runs in-process via `node-cron` inside the `serve` process.

### Docker Compose (VPS)

```bash
docker compose up -d --build
docker compose logs -f
```

The `./data` directory holds WhatsApp auth and send state. Back it up before migrating servers.

### Without Docker

```bash
npm run build
npm start
```

## Data and safety

| Path | Purpose |
|------|---------|
| `data/auth/` | WhatsApp session credentials |
| `data/state.json` | Sent dates and used quote IDs |

- Restarts do not resend today's quote.
- Failed sends retry up to 3 times; state is updated only after WhatsApp accepts the message.
- Never commit `.env` or `data/` — both are in `.gitignore`.

## Resilience

- **Scheduled send retries** — at 6:00 AM, retries up to 3 times (5 minutes apart) before giving up.
- **Missed-cron catch-up** — if `node-cron` misses the 06:00 slot (timer drift / CPU scheduling), the bot retries on `execution:missed` and polls every 15 minutes until today's quote is sent, but only within 4 hours of `QUOTE_TIME` (until 10:00 IST by default). After that it logs once and skips today.
- **Session conflict recovery** — reconnects automatically after temporary WhatsApp session conflicts.
- **Serve lock** — `send-now` and `list-groups` refuse to run while `serve` is active, so SSH tests do not steal the live session.
- **After re-pairing** — run `fly machine restart` so `serve` loads the new auth session.

## Development

```bash
npm test
npm run typecheck
npm run validate:quotes
npm run build
```
