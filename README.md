# Wapp Quote

Daily uplifting Hindi/Urdu quote bot for an existing WhatsApp family group.

This uses WhatsApp Web via Baileys because posting into an existing personal WhatsApp group is not the same as Meta's official API-managed Groups API. Keep the bot gentle: one message per day, no bulk messaging, and only in a group where everyone expects it.

The default quote source is public Wikiquote through the MediaWiki API. It uses a built-in approved author list, then extracts safe quote candidates, avoids repeats using `data/state.json`, round-robins by author, and falls back to the curated local quote bank if Wikiquote is unavailable or returns no safe unused quote.

For cloud deployment, the bot can call Ollama Cloud to make the short reflection line dynamic. The AI never rewrites the quote or author; it only replaces the `आज की दिशा` line after validation. If the AI call fails, the bot sends the normal fallback reflection.

## Requirements

- Node.js 20 or newer
- Docker Compose for VPS deployment
- A WhatsApp account that can link a new device

## Local Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
AUTH_METHOD=pairing
PAIRING_PHONE_NUMBER=91XXXXXXXXXX
QUOTE_SOURCE=wikiquote
WIKIQUOTE_LANGUAGE=hi
WIKIQUOTE_MODE=pages
TZ=Asia/Kolkata
QUOTE_TIME=06:00
```

Pair WhatsApp:

```bash
npm run dev -- pair
```

The `pair` command clears any stale saved WhatsApp session before requesting a fresh pairing code.

If you want to manually clear the saved linked-device session:

```bash
npm run dev -- reset-auth
```

If the phone-number pairing code is rejected by WhatsApp, use QR linking:

```bash
npm run dev -- pair-qr
```

Then on your phone: WhatsApp -> Linked devices -> Link a device -> scan the terminal QR code.

Find the target group:

```bash
npm run dev -- list-groups
```

Copy the group JID ending in `@g.us` into `.env`:

```bash
WHATSAPP_GROUP_JID=1234567890-123456789@g.us
```

Preview the next message:

```bash
npm run dev -- preview
```

Send once immediately:

```bash
npm run dev -- send-now
```

Run the daily scheduler:

```bash
npm run dev -- serve
```

## Cloud Server Deployment

This is the recommended production shape. Pair WhatsApp once on the server, keep `./data` persisted, and run the daemon through Docker Compose.

On the VPS or cloud VM:

```bash
git clone <repo-url> wapp-quote
cd wapp-quote
cp .env.example .env
```

Fill in `.env`:

```bash
WHATSAPP_GROUP_JID=
PAIRING_PHONE_NUMBER=91XXXXXXXXXX
QUOTE_SOURCE=wikiquote
TZ=Asia/Kolkata
QUOTE_TIME=06:00

# Optional but recommended for dynamic cloud-generated reflection text.
AI_PROVIDER=ollama-cloud
OLLAMA_API_KEY=your_ollama_api_key
OLLAMA_MODEL=gpt-oss:120b
```

Keep `OLLAMA_API_KEY` as a server environment variable or in the ignored `.env` file. Do not commit real secrets.

Install dependencies and pair once:

```bash
npm install
npm run dev -- pair
npm run dev -- list-groups
```

Set `WHATSAPP_GROUP_JID`, test with:

```bash
npm run dev -- preview
npm run dev -- send-now
```

Start the service:

```bash
docker compose up -d --build
docker compose logs -f
```

The `./data` directory is mounted into the container and stores WhatsApp auth plus send state. Back it up before moving servers. Do not delete it unless you want to pair again.

To upgrade after pulling new code:

```bash
docker compose up -d --build
docker compose logs -f --tail=100
```

To run without Docker, use:

```bash
npm run build
npm start
```

## Fly.io Deployment

Fly is a good fit for this bot because it can run one small always-on Machine with a persistent volume mounted at `/app/data`.

Install and sign in:

```bash
brew install flyctl
fly auth login
```

Choose a globally unique app name, then edit `app = "wapp-quote"` in `fly.toml` to that name. Singapore is configured as the default region because it is close to India:

```toml
app = "your-unique-wapp-quote-name"
primary_region = "sin"
```

Create the Fly app and persistent volume:

```bash
fly apps create your-unique-wapp-quote-name
fly volumes create wapp_quote_data --size 1 --region sin --app your-unique-wapp-quote-name
```

Set secrets. Do not put these in `fly.toml`:

```bash
fly secrets set \
  PAIRING_PHONE_NUMBER=91XXXXXXXXXX \
  WHATSAPP_GROUP_JID=120363xxxxxxxxxxxxxx@g.us \
  OLLAMA_API_KEY=your_ollama_api_key \
  --app your-unique-wapp-quote-name
```

Deploy:

```bash
fly deploy --app your-unique-wapp-quote-name
fly logs --app your-unique-wapp-quote-name
```

On first deploy, watch `fly logs` for the WhatsApp pairing code. Open WhatsApp -> Linked devices -> Link with phone number, then enter the code. The auth session is stored in the Fly volume at `/app/data/auth`.

Useful commands:

```bash
fly status --app your-unique-wapp-quote-name
fly logs --app your-unique-wapp-quote-name
fly ssh console --app your-unique-wapp-quote-name
fly deploy --app your-unique-wapp-quote-name
```

If you need more memory, change `memory = "256mb"` to `memory = "512mb"` in `fly.toml` and redeploy.

## Commands

```text
pair          Link WhatsApp as a device and persist auth in data/auth
pair-qr       Link WhatsApp by scanning a terminal QR code
reset-auth    Remove saved WhatsApp auth so pairing starts fresh
list-groups   Print group names and JIDs
preview       Print the next quote without sending
send-now      Send the next quote immediately
serve         Run the daily scheduler
help          Show command help
```

## Safety And Idempotency

- The scheduler uses `TZ=Asia/Kolkata` and `QUOTE_TIME=06:00`.
- `data/state.json` records local dates already sent, so restarts do not duplicate the daily quote.
- `data/state.json` also tracks used quote IDs, so Wikiquote quotes rotate without repeating until the safe candidate pool is exhausted.
- `send-now` intentionally forces a send for testing.
- Failed sends retry up to three times and are only recorded after WhatsApp accepts the message.

## Quote Source

```bash
QUOTE_SOURCE=wikiquote
```

Uses the public MediaWiki API at `https://hi.wikiquote.org/w/api.php` or `https://ur.wikiquote.org/w/api.php`, depending on `WIKIQUOTE_LANGUAGE`.

```bash
WIKIQUOTE_MODE=authors
```

Samples public Wikiquote author/person categories and uses the source page title as the attribution line under the quote. This is broader, but less reliable for attribution.

```bash
WIKIQUOTE_MODE=any
```

Samples any random public Wikiquote page. This allows topic pages too, so the attribution line may be a topic title.

```bash
WIKIQUOTE_MODE=pages
# WIKIQUOTE_PAGES=कबीर|कबीर,रहीम|रहीम
```

Uses the built-in approved author list by default. Set `WIKIQUOTE_PAGES` only if you want to override it with a comma-separated list of `page|author` pairs.

```bash
QUOTE_SOURCE=local
```

Uses only `src/data/quotes.json`.

The bot skips missing or unusable Wikiquote pages automatically.

## AI Reflection

```bash
AI_PROVIDER=none
```

Uses the quote's built-in fallback reflection.

```bash
AI_PROVIDER=ollama-cloud
OLLAMA_API_KEY=your_ollama_api_key
OLLAMA_BASE_URL=https://ollama.com/api
OLLAMA_MODEL=gpt-oss:120b
AI_TIMEOUT_MS=10000
AI_TEMPERATURE=0.7
```

Calls Ollama Cloud directly from the server. The response must be JSON with a single `reflection` string. The bot validates length, Hindi text, and safety terms before using it. If validation fails, the original reflection is used.

## Verification

```bash
npm run validate:quotes
npm test
npm run typecheck
npm run build
```
