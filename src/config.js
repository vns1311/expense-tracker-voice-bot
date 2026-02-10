import "dotenv/config";
import { readFileSync } from "fs";

const required = [
    "TELEGRAM_BOT_TOKEN",
    "OPENAI_API_KEY",
    "GOOGLE_SHEET_ID",
];

for (const key of required) {
    if (!process.env[key]) {
        console.error(`❌  Missing required env variable: ${key}`);
        console.error(`   Copy .env.example → .env and fill in all values.`);
        process.exit(1);
    }
}

// Google credentials: prefer inline JSON env var, fall back to file path
if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    console.error(`❌  Missing Google credentials. Set one of:`);
    console.error(`   GOOGLE_SERVICE_ACCOUNT_KEY  — paste the full JSON content`);
    console.error(`   GOOGLE_SERVICE_ACCOUNT_KEY_PATH — path to the JSON file`);
    process.exit(1);
}

let googleCredentials;
try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        googleCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } else {
        googleCredentials = JSON.parse(
            readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, "utf-8")
        );
    }
} catch (err) {
    console.error(`❌  Failed to parse Google credentials:`, err.message);
    process.exit(1);
}

const config = Object.freeze({
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleCredentials,
    googleSheetId: process.env.GOOGLE_SHEET_ID,
});

export default config;
