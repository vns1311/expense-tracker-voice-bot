# 🚀 Deploying to Fly.io

Deploy the Voice Expense Manager bot to [Fly.io](https://fly.io) as a **free background worker**.

---

## Prerequisites

- A [Fly.io account](https://fly.io/app/sign-up) (sign up with GitHub)
- [flyctl CLI](https://fly.io/docs/flyctl/install/) installed:
  ```bash
  # macOS
  brew install flyctl
  ```
- A credit card on file (required by Fly, but free-tier usage is never charged)
- These values ready to paste:
  - `TELEGRAM_BOT_TOKEN`
  - `OPENAI_API_KEY`
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_KEY` — the full JSON content of your service account key
  - `TELEGRAM_CHAT_ID` _(optional, for scheduled summaries)_

---

## Step 1: Authenticate

```bash
fly auth login
```

This opens a browser to sign in. Once authenticated, you're ready to deploy.

---

## Step 2: Launch the App

From the project root:

```bash
fly launch --no-deploy
```

When prompted:
- **App name**: `voice-expense-manager` (or let Fly auto-generate one)
- **Region**: Pick `maa` (Chennai) for lowest latency from India
- **Would you like to set up a Postgresql database?** → **No**
- **Would you like to set up an Upstash Redis database?** → **No**

This creates the app on Fly without deploying yet.

---

## Step 3: Set Secrets (Environment Variables)

```bash
# Required
fly secrets set TELEGRAM_BOT_TOKEN="your_token_here"
fly secrets set OPENAI_API_KEY="sk-..."
fly secrets set GOOGLE_SHEET_ID="your_sheet_id"

# Google credentials — paste the ENTIRE JSON as a single line
fly secrets set GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...",...}'

# Optional
fly secrets set TELEGRAM_CHAT_ID="your_chat_id"
fly secrets set HIGH_VALUE_THRESHOLD="500"
fly secrets set TIMEZONE="Asia/Kolkata"
```

> **Tip:** To convert your JSON key file to a single line:
> ```bash
> fly secrets set GOOGLE_SERVICE_ACCOUNT_KEY="$(cat credentials.json)"
> ```

---

## Step 4: Deploy

```bash
fly deploy
```

Fly builds the Docker image, pushes it, and starts your worker. First deploy takes ~2 minutes.

---

## Step 5: Verify

```bash
fly logs
```

You should see:
```
🤖  Voice Expense Manager starting...
✅  Bot is live! → @your_bot_username
⏰  Scheduler active (timezone: Asia/Kolkata)
```

Send a voice note to your bot on Telegram — it should respond! 🎉

---

## Free Tier Limits

| Resource | Free Allowance |
|---|---|
| **VMs** | Up to 3 shared-cpu-1x, 256 MB RAM |
| **Bandwidth** | 100 GB outbound/month |
| **Regions** | Deploy to any region |
| **Always-on** | ✅ No spin-down for workers |

---

## Useful Commands

```bash
fly status                 # Check app status
fly logs                   # Stream live logs
fly ssh console            # SSH into the running container
fly secrets list           # List set secrets
fly deploy                 # Redeploy after code changes
fly scale show             # View current VM specs
fly apps destroy <name>    # Delete the app
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Bot doesn't start | Run `fly logs` — check for missing env vars |
| `❌ Missing Google credentials` | Ensure `GOOGLE_SERVICE_ACCOUNT_KEY` is set via `fly secrets` |
| Build fails | Ensure `Dockerfile` and `package-lock.json` are committed |
| App crashes on start | Run `fly ssh console` to debug, or check `fly logs` |
| Region too slow | Change with `fly regions set sin` (Singapore) |
