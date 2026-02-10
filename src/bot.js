import { Bot } from "grammy";
import { writeFile, unlink } from "fs/promises";
import config from "./config.js";
import { transcribeVoice } from "./transcribe.js";
import { extractExpense } from "./extract.js";
import { appendExpense, deleteLastExpense } from "./sheets.js";
import { buildSummary } from "./summary.js";

const bot = new Bot(config.telegramBotToken);

// ── Currency symbols for pretty display ─────────────────────────────
const CURRENCY_SYMBOLS = {
    INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥",
    AUD: "A$", CAD: "C$", SGD: "S$", AED: "د.إ",
};

function currencyDisplay(code, amount) {
    const sym = CURRENCY_SYMBOLS[code] || code + " ";
    return `${sym}${amount}`;
}

// ── /start command ──────────────────────────────────────────────────
bot.command("start", async (ctx) => {
    await ctx.reply(
        `👋 *Welcome to Expense Tracker!*\n\n` +
        `Just send me a *voice note* describing your expense and I'll log it to your Google Sheet.\n\n` +
        `💡 *Examples:*\n` +
        `🎤 _"Spent 200 rupees on lunch"_\n` +
        `🎤 _"Uber ride to office, 150 rupees"_\n` +
        `🎤 _"Bought groceries for 500"_\n\n` +
        `I understand *any language* — Hindi, Tamil, English, you name it!\n\n` +
        `Type /help for more info.`,
        { parse_mode: "Markdown" }
    );
});

// ── /help command ───────────────────────────────────────────────────
bot.command("help", async (ctx) => {
    await ctx.reply(
        `🔹 *How to use*\n` +
        `Record a voice note mentioning the amount and what you spent on.\n\n` +
        `🔹 *Supported languages*\n` +
        `Any language — Whisper auto-detects.\n\n` +
        `🔹 *Categories*\n` +
        `Food · Transport · Shopping · Bills · Entertainment · Health · Education · Travel · Groceries · Other\n\n` +
        `🔹 *Commands*\n` +
        `/start — Welcome message\n` +
        `/week — This week's spending summary\n` +
        `/month — This month's spending summary\n` +
        `/undo — Delete the last logged expense\n` +
        `/help — This message`,
        { parse_mode: "Markdown" }
    );
});

// ── /undo command ───────────────────────────────────────────────────
bot.command("undo", async (ctx) => {
    const msg = await ctx.reply("🗑 Removing last expense...");
    try {
        const deleted = await deleteLastExpense();
        if (!deleted) {
            await ctx.api.editMessageText(
                ctx.chat.id,
                msg.message_id,
                "📭 No expenses to undo — the sheet is empty."
            );
            return;
        }
        await ctx.api.editMessageText(
            ctx.chat.id,
            msg.message_id,
            `🗑 *Expense Deleted!*\n\n` +
            `💰 *Amount:* ${currencyDisplay(deleted.currency, deleted.amount)}\n` +
            `📂 *Category:* ${deleted.category}\n` +
            `📝 *Description:* ${deleted.description}\n` +
            `🗓 *Date:* ${deleted.date}`,
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        console.error("Error undoing expense:", err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            msg.message_id,
            "❌ Failed to undo. Please try again."
        );
    }
});

// ── /week command ───────────────────────────────────────────────────
bot.command("week", async (ctx) => {
    const msg = await ctx.reply("📊 Crunching this week's numbers...");
    try {
        const summary = await buildSummary("week");
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, summary, {
            parse_mode: "Markdown",
        });
    } catch (err) {
        console.error("Error building weekly summary:", err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            msg.message_id,
            "❌ Failed to generate summary. Please try again."
        );
    }
});

// ── /month command ──────────────────────────────────────────────────
bot.command("month", async (ctx) => {
    const msg = await ctx.reply("📊 Crunching this month's numbers...");
    try {
        const summary = await buildSummary("month");
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, summary, {
            parse_mode: "Markdown",
        });
    } catch (err) {
        console.error("Error building monthly summary:", err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            msg.message_id,
            "❌ Failed to generate summary. Please try again."
        );
    }
});

// ── Voice message handler ───────────────────────────────────────────
bot.on("message:voice", async (ctx) => {
    const processingMsg = await ctx.reply("🎧 Processing your voice note...");

    try {
        // 1. Download the voice file
        const file = await ctx.getFile();
        const filePath = `/tmp/voice_${ctx.message.message_id}.ogg`;
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(filePath, buffer);

        // 2. Transcribe
        const transcript = await transcribeVoice(filePath);

        // 3. Extract expense data
        const expense = await extractExpense(transcript);

        // 4. Log to Google Sheet
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        await appendExpense({
            date: today,
            amount: expense.amount,
            currency: expense.currency,
            category: expense.category,
            description: expense.description,
            rawTranscript: transcript,
        });

        // 5. Reply with confirmation
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `✅ *Expense Logged!*\n\n` +
            `💰 *Amount:* ${currencyDisplay(expense.currency, expense.amount)}\n` +
            `📂 *Category:* ${expense.category}\n` +
            `📝 *Description:* ${expense.description}\n` +
            `🗓 *Date:* ${today}\n\n` +
            `🎙 _"${transcript}"_`,
            { parse_mode: "Markdown" }
        );

        // Cleanup temp file
        await unlink(filePath).catch(() => { });
    } catch (err) {
        console.error("Error processing voice note:", err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `❌ *Sorry, something went wrong.*\n\nPlease try again. If the issue persists, check the server logs.`,
            { parse_mode: "Markdown" }
        );
    }
});

// ── Handle text messages (nudge towards voice) ──────────────────────
bot.on("message:text", async (ctx) => {
    // Ignore commands (already handled above)
    if (ctx.message.text.startsWith("/")) return;

    await ctx.reply(
        `🎤 I work best with *voice notes!*\n\n` +
        `Just hold the mic button and describe your expense — I'll handle the rest.`,
        { parse_mode: "Markdown" }
    );
});

export default bot;
