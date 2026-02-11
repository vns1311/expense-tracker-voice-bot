import { Bot } from "grammy";
import { writeFile, unlink } from "fs/promises";
import config from "./config.js";
import { transcribeVoice } from "./transcribe.js";
import { extractExpense, extractExpenseFromImage } from "./extract.js";
import { appendExpense, deleteLastExpense, getCategories, addCategory, removeCategory } from "./sheets.js";
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
        `Just send me a *voice note*, *text message*, or *receipt photo* and I'll log it to your Google Sheet.\n\n` +
        `💡 *Examples:*\n` +
        `🎤 _"Spent 200 rupees on lunch"_\n` +
        `💬 _"coffee 150"_\n` +
        `📸 _Send a photo of your receipt_\n\n` +
        `I understand *any language* — Hindi, Tamil, English, you name it!\n\n` +
        `Type /help for more info.`,
        { parse_mode: "Markdown" }
    );
});

// ── /help command ───────────────────────────────────────────────────
bot.command("help", async (ctx) => {
    await ctx.reply(
        `🔹 *How to use*\n` +
        `Send a voice note, text message, or receipt photo.\n\n` +
        `🔹 *Supported languages*\n` +
        `Any language — Whisper auto-detects.\n\n` +
        `🔹 *Categories*\n` +
        `Food · Transport · Shopping · Bills · Entertainment · Health · Education · Travel · Groceries · Other + your custom ones\n\n` +
        `🔹 *Commands*\n` +
        `/start — Welcome message\n` +
        `/week — This week's spending summary\n` +
        `/month — This month's spending summary\n` +
        `/undo — Delete the last logged expense\n` +
        `/categories — View, add, or remove categories\n` +
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

// ── /categories command ─────────────────────────────────────────────
bot.command("categories", async (ctx) => {
    const args = ctx.match?.trim() || "";

    try {
        // /categories add <name>
        if (args.toLowerCase().startsWith("add ")) {
            const name = args.slice(4).trim();
            if (!name) {
                await ctx.reply("⚠️ Usage: `/categories add Subscriptions`", { parse_mode: "Markdown" });
                return;
            }
            const added = await addCategory(name);
            if (added) {
                await ctx.reply(`✅ Category *${name}* added!`, { parse_mode: "Markdown" });
            } else {
                await ctx.reply(`⚠️ *${name}* already exists.`, { parse_mode: "Markdown" });
            }
            return;
        }

        // /categories remove <name>
        if (args.toLowerCase().startsWith("remove ")) {
            const name = args.slice(7).trim();
            if (!name) {
                await ctx.reply("⚠️ Usage: `/categories remove Subscriptions`", { parse_mode: "Markdown" });
                return;
            }
            const removed = await removeCategory(name);
            if (removed) {
                await ctx.reply(`🗑 Category *${name}* removed.`, { parse_mode: "Markdown" });
            } else {
                await ctx.reply(`⚠️ *${name}* is either a default category or doesn't exist.`, { parse_mode: "Markdown" });
            }
            return;
        }

        // /categories (list all)
        const { defaults, custom } = await getCategories();
        let msg = `🏷 *Your Categories*\n\n`;
        msg += `🔹 *Defaults:*\n${defaults.map((c) => `• ${c}`).join("\n")}\n\n`;

        if (custom.length > 0) {
            msg += `✨ *Custom:*\n${custom.map((c) => `• ${c}`).join("\n")}\n\n`;
        } else {
            msg += `_No custom categories yet._\n\n`;
        }

        msg += `💡 *Manage:*\n` +
            `\`/categories add Subscriptions\`\n` +
            `\`/categories remove Subscriptions\``;

        await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (err) {
        console.error("Error managing categories:", err);
        await ctx.reply("❌ Failed to manage categories. Please try again.");
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
        const expenseDate = expense.date || new Date().toISOString().split("T")[0];
        await appendExpense({
            date: expenseDate,
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
            `🗓 *Date:* ${expenseDate}\n\n` +
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

// ── Photo message handler (receipt scanning) ────────────────────────
bot.on("message:photo", async (ctx) => {
    const processingMsg = await ctx.reply("📸 Scanning your receipt...");

    try {
        // Telegram sends multiple sizes — grab the largest
        const photos = ctx.message.photo;
        const largest = photos[photos.length - 1];
        const file = await ctx.api.getFile(largest.file_id);
        const imageUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

        // Extract expense from receipt image
        const expense = await extractExpenseFromImage(imageUrl);

        // Log to Google Sheet
        const expenseDate = expense.date || new Date().toISOString().split("T")[0];
        await appendExpense({
            date: expenseDate,
            amount: expense.amount,
            currency: expense.currency,
            category: expense.category,
            description: expense.description,
            rawTranscript: "[receipt photo]",
        });

        // Reply with confirmation
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `✅ *Receipt Logged!*\n\n` +
            `💰 *Amount:* ${currencyDisplay(expense.currency, expense.amount)}\n` +
            `📂 *Category:* ${expense.category}\n` +
            `📝 *Description:* ${expense.description}\n` +
            `🗓 *Date:* ${expenseDate}`,
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        console.error("Error processing receipt photo:", err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `❌ *Couldn't read this receipt.*\n\nMake sure the photo is clear and well-lit. Try again!`,
            { parse_mode: "Markdown" }
        );
    }
});

// ── Handle text messages (extract expense from text) ────────────────
bot.on("message:text", async (ctx) => {
    // Ignore commands (already handled above)
    if (ctx.message.text.startsWith("/")) return;

    const processingMsg = await ctx.reply("💬 Processing your message...");

    try {
        const text = ctx.message.text;

        // Extract expense data from the text
        const expense = await extractExpense(text);

        // Log to Google Sheet
        const expenseDate = expense.date || new Date().toISOString().split("T")[0];
        await appendExpense({
            date: expenseDate,
            amount: expense.amount,
            currency: expense.currency,
            category: expense.category,
            description: expense.description,
            rawTranscript: text,
        });

        // Reply with confirmation
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `✅ *Expense Logged!*\n\n` +
            `💰 *Amount:* ${currencyDisplay(expense.currency, expense.amount)}\n` +
            `📂 *Category:* ${expense.category}\n` +
            `📝 *Description:* ${expense.description}\n` +
            `🗓 *Date:* ${expenseDate}`,
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        console.error("Error processing text message:", err);
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `❌ *Couldn't parse that.*\n\nTry something like: _"coffee 150"_ or _"Uber ride 300 rupees"_`,
            { parse_mode: "Markdown" }
        );
    }
});

export default bot;
