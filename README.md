# 🎤 Voice Expense Manager

A **zero-UI** AI agent for daily expense tracking. Record a voice note in **any language**, send it to a Telegram bot, and the agent automatically transcribes it, extracts the **amount + category**, and logs the transaction to a **Google Sheet**.

```
Voice Note → Telegram Bot → Whisper (transcribe) → GPT-4o-mini (extract) → Google Sheets (log)
```

## Features

- 🌍 **Any language** — Whisper auto-detects the spoken language
- 🤖 **Smart extraction** — GPT-4o-mini parses amount, currency, and category
- 📊 **Google Sheets** — Expenses logged instantly with date, amount, category, description
- ⚡ **Zero friction** — Just talk → done

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- A Telegram account
- An OpenAI account with billing enabled
- A Google Cloud account

## Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd voice-expense-manager
npm install
```

### 2. Create a Telegram Bot

1. Open Telegram → search **@BotFather**
2. Send `/newbot` → choose a name and username (must end in `bot`)
3. Copy the **bot token**

### 3. Get OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new secret key and copy it

### 4. Set Up Google Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → enable **Google Sheets API**
3. Go to **Credentials** → **Create Service Account** → download the JSON key
4. Create a Google Sheet → **Share** it with the service account email (Editor access)
5. Name the first tab **"Expenses"**
6. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/`**`<SPREADSHEET_ID>`**`/edit`

### 5. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
TELEGRAM_BOT_TOKEN=7123456789:AAH...
OPENAI_API_KEY=sk-...
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials.json
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### 6. Run

```bash
npm start
```

You should see:
```
🤖  Voice Expense Manager starting...
✅  Bot is live! → @your_bot_username
```

## Usage

1. Open your bot on Telegram
2. Send `/start` to see the welcome message
3. **Record a voice note** — e.g., *"Spent 200 rupees on lunch today"*
4. The bot replies with a confirmation:
   ```
   ✅ Expense Logged!
   💰 Amount: ₹200
   📂 Category: Food
   📝 Description: lunch
   🗓 Date: 2025-02-10
   ```
5. Check your Google Sheet — a new row appears!

## Project Structure

```
voice-expense-manager/
├── src/
│   ├── index.js        # Entry point — starts the bot
│   ├── config.js       # Environment variable loader
│   ├── bot.js          # Telegram bot (grammy) — commands & voice handler
│   ├── transcribe.js   # OpenAI Whisper — voice → text
│   ├── extract.js      # GPT-4o-mini — text → structured JSON
│   └── sheets.js       # Google Sheets API — append expense rows
├── .env.example        # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

## Cost

| Service | Cost | Estimate/day |
|---|---|---|
| Whisper | ~$0.006/min | ~$0.003 (30s note) |
| GPT-4o-mini | ~$0.15/1M tokens | ~$0.001 |
| Google Sheets | Free | Free |
| **Total** | | **~$0.01/day** |

## License

MIT
