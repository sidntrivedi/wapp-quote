# Health stats → WhatsApp (Apple Shortcuts)

This guide covers the **health webhook** feature: an Apple Shortcut reads your
daily Health data, POSTs it to the bot, and the bot posts a concise English
health report to your WhatsApp group.

For the code-level design, see [ARCHITECTURE.md](./ARCHITECTURE.md#health-webhook).

---

## How it works

```
Apple Shortcut (9 PM automation)
        │  reads Health: steps, sleep, active calories, exercise…
        ▼
POST https://<your-app>/health   (Authorization: Bearer <token>)
        │
        ▼
serve process  →  validate + store (data/health.json)
        │
        ▼
WhatsApp group
```

The webhook runs **inside the same `serve` process** as the daily quote, so it
reuses the single live WhatsApp session. There is no second process and no
second WhatsApp login.

---

## Sample message

```
💪 Health Update

👟 Steps: 9,123 / 8,000 ✅
😴 Sleep: 7.5h / 6h ✅
🔥 Active Cal: 520 kcal
🏃 Exercise: 35 min
⚡ Streak: 3 days
```

- ✅ / ❌ marks whether each goal was met.
- **Streak** only appears when 2 or more consecutive days of meeting the step goal.
- **Active Cal** and **Exercise** only appear when included in the payload.

---

## Server setup

1. Enable the webhook and set a strong secret:

   ```bash
   # .env (local) or `fly secrets set` (production)
   HEALTH_WEBHOOK_ENABLED=true
   HEALTH_WEBHOOK_TOKEN=<long-random-string>     # e.g. openssl rand -hex 32
   HEALTH_GROUP_JID=<group jid>                  # optional; defaults to WHATSAPP_GROUP_JID
   HEALTH_STEP_GOAL=8000                         # daily step goal (default: 8000)
   HEALTH_SLEEP_GOAL_HOURS=6                     # daily sleep goal in hours (default: 6)
   ```

2. On Fly.io, set secrets and deploy:

   ```bash
   fly secrets set HEALTH_WEBHOOK_TOKEN="$(openssl rand -hex 32)"
   fly secrets set HEALTH_GROUP_JID="120363...@g.us"   # if different from the quote group
   fly deploy
   ```

   `fly.toml` already exposes the webhook over HTTPS (`[http_service]`,
   `internal_port = 8080`). Your URL is `https://<app-name>.fly.dev/health`.

3. Verify the server is up:

   ```bash
   curl https://<app-name>.fly.dev/healthz
   # {"status":"ok"}
   ```

---

## Endpoints

| Method | Path        | Auth          | Purpose                                  |
|--------|-------------|---------------|------------------------------------------|
| GET    | `/healthz`  | none          | Liveness probe                           |
| POST   | `/health`   | Bearer token  | Ingest a daily health payload and post   |

Auth accepts **either** header:

- `Authorization: Bearer <HEALTH_WEBHOOK_TOKEN>`
- `x-webhook-token: <HEALTH_WEBHOOK_TOKEN>`

### Request body

All fields are optional. Numbers may be sent as numbers **or** strings with
units (`"8,431 steps"`, `"27000 seconds"`) — the server strips units and separators.

```json
{
  "date": "2026-06-21",
  "steps": 9123,
  "sleepSeconds": 27000,
  "activeEnergyKcal": 520,
  "exerciseMinutes": 35,
  "distanceKm": 6.4,
  "standHours": 10,
  "restingHeartRate": 58,
  "workouts": [{ "type": "Running", "minutes": 30, "energyKcal": 280 }],
  "notes": "Felt great today"
}
```

- `date` defaults to **today in the configured `TZ`** if omitted.
- `workouts` also accepts a single string (`"Running"`) or a single object.
- All fields are persisted to `data/health.json`. Only `steps`, `sleepHours`,
  `activeEnergyKcal`, and `exerciseMinutes` are printed in the WhatsApp message.

### Responses

| Status | Body                                                              | Meaning                              |
|--------|-------------------------------------------------------------------|--------------------------------------|
| 200    | `{"status":"sent","date":"…","posted":true,"messageId":"…"}`      | Stored and posted to WhatsApp        |
| 200    | `{"status":"stored","posted":false,"reason":"already_posted"}`    | Already posted today (idempotent)    |
| 400    | `{"error":"invalid_payload"}` / `{"error":"invalid_json"}`        | Bad body                             |
| 401    | `{"error":"unauthorized"}`                                        | Missing/wrong token                  |

To re-post on the same day (e.g. after correcting data), add `?force=true`.

### Quick test

```bash
curl -X POST "https://<app-name>.fly.dev/health" \
  -H "Authorization: Bearer $HEALTH_WEBHOOK_TOKEN" \
  -H "content-type: application/json" \
  -d '{"steps":9123,"sleepSeconds":27000,"activeEnergyKcal":520,"exerciseMinutes":35}'
```

---

## Building the Apple Shortcut

> Health actions are only available in the **Shortcuts** app on iPhone/iPad, not macOS.

1. **Shortcuts → +** to create a new shortcut. Name it e.g. *Send Health Stats*.

2. Add **Find Health Samples** actions to read each metric for *Today*:
   - Steps → sum → set variable `Steps`
   - Active Energy → sum → `ActiveEnergy`
   - Sleep → duration in seconds → `SleepSeconds`
   - Exercise Minutes → sum → `ExerciseMinutes`

   Tip: use **Calculate Statistics** (Sum) to reduce samples to one number,
   and **Round** if needed.

3. Add a **Text** action containing the JSON, inserting your variables:

   ```json
   {
     "steps": Steps,
     "sleepSeconds": SleepSeconds,
     "activeEnergyKcal": ActiveEnergy,
     "exerciseMinutes": ExerciseMinutes
   }
   ```

   (Tap each variable token to insert it. Strings with units are fine — the
   server cleans them — but raw numbers are cleanest.)

4. Add **Get Contents of URL**:
   - URL: `https://<app-name>.fly.dev/health`
   - Method: `POST`
   - Request Body: `JSON` (or `File`/`Text` with the Text action)
   - Headers:
     - `Authorization` = `Bearer <your token>`
     - `Content-Type` = `application/json`

5. (Optional) Add **Show Result** / **Show Notification** with the response so
   you can confirm `"status":"sent"`.

### Nightly automation

1. **Shortcuts → Automation → + → Time of Day → 9:00 PM → Daily**.
2. Action: **Run Shortcut → Send Health Stats**.
3. Turn **Ask Before Running** off so it runs unattended.

> iOS background limitation: time-based automations that run a shortcut with no
> UI usually fire reliably, but if your shortcut shows anything, iOS may require
> a tap. Keep it headless (no "Show Result") for the automation copy.

---

## Privacy & safety

- The token is the only thing protecting the endpoint — keep it secret and long.
- Health data is stored locally in `data/health.json` (atomic writes, last ~400
  days retained). Back it up alongside `data/state.json`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `401 unauthorized` | Token mismatch. Check the `Authorization` header value. |
| `400 invalid_json` | The body isn't valid JSON. Use the JSON request body type. |
| Nothing posts but `200 stored` | Already posted today. Use `?force=true` to re-post. |
| Connection refused | Webhook disabled or wrong port. Set `HEALTH_WEBHOOK_ENABLED=true`. |
| Posted to the wrong group | Set `HEALTH_GROUP_JID` to the intended group. Run `npm run dev -- list-groups` to find the JID. |
