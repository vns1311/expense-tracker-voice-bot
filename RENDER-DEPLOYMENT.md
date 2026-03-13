# 🚀 Deploying to Render

Deploy the Voice Expense Manager bot to [Render](https://render.com) as a **free background worker**.

---

## Prerequisites

- A [Render account](https://dashboard.render.com/register) (sign up with GitHub)
- Your repo pushed to **GitHub**
- These values ready to paste:
  - `TELEGRAM_BOT_TOKEN`
  - `OPENAI_API_KEY`
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_KEY` — the **full JSON content** of your service account key file, pasted as a single line
  - `TELEGRAM_CHAT_ID` _(optional, for scheduled summaries)_

---

## Option A: One-Click Deploy (Blueprint)

This repo includes a `render.yaml` blueprint that auto-configures everything.

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Blueprint**
3. Connect your GitHub repo
4. Render detects `render.yaml` automatically and creates a **Background Worker**
5. Set the **secret environment variables** in the Render dashboard:

   | Variable | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `GOOGLE_SHEET_ID` | The spreadsheet ID from your Sheet URL |
   | `GOOGLE_SERVICE_ACCOUNT_KEY` | Paste the entire JSON content of your service account key |
   | `TELEGRAM_CHAT_ID` | Your chat ID _(optional)_ |

6. Click **Apply** → Render builds and deploys 🎉

---

## Option B: Manual Setup

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Background Worker**
3. Connect your GitHub repo
4. Configure:

   | Setting | Value |
   |---|---|
   | **Name** | `voice-expense-manager` |
   | **Runtime** | Docker |
   | **Plan** | Free |
   | **Dockerfile Path** | `./Dockerfile` |

5. Add **Environment Variables** (same table as Option A above)
6. Click **Create Background Worker**

---

## Preparing `GOOGLE_SERVICE_ACCOUNT_KEY`

On your local machine, convert the JSON key file to a single line:

```bash
# macOS / Linux
cat credentials.json | tr -d '\n'
```

Copy the output and paste it as the value of `GOOGLE_SERVICE_ACCOUNT_KEY` in Render.

---

## Verifying the Deployment

1. In the Render dashboard, open your worker's **Logs** tab
2. You should see:
   ```
   🤖  Voice Expense Manager starting...
   ✅  Bot is live! → @your_bot_username
   ⏰  Scheduler active (timezone: Asia/Kolkata)
   ```
3. Send a voice note to your bot on Telegram — it should respond with the expense confirmation

---

## Free Tier Notes

| Aspect | Detail |
|---|---|
| **Cost** | $0/month |
| **RAM** | 512 MB (more than enough) |
| **Spin-down** | Workers do **not** spin down on inactivity (unlike web services) |
| **Build minutes** | 500 free minutes/month |
| **Auto-deploy** | Pushes to `main` auto-deploy by default |

> **Tip:** If you ever need guaranteed uptime + zero cold starts, upgrade to the **Starter plan** ($7/month) from the Render dashboard.

---

## Redeploying

Render auto-deploys on every push to your default branch. To manually redeploy:

1. Go to your worker in the Render dashboard
2. Click **Manual Deploy** → **Deploy latest commit**

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Bot doesn't start | Check **Logs** tab for missing env vars |
| `❌ Missing Google credentials` | Ensure `GOOGLE_SERVICE_ACCOUNT_KEY` is set (not the file path) |
| `❌ Missing required env variable` | All 3 required vars must be set: `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `GOOGLE_SHEET_ID` |
| Build fails | Ensure `Dockerfile` and `package-lock.json` are committed and pushed |
