import { Bot, InputFile } from "grammy";
import { writeFile, unlink } from "fs/promises";
import config from "./config.js";
import { transcribeVoice } from "./transcribe.js";
import { extractExpense, extractExpenseFromImage } from "./extract.js";
import { appendExpense, deleteLastExpense, getCategories, addCategory, removeCategory, getBudgets, setBudget, removeBudget, getMonthlySpendByCategory } from "./sheets.js";
import { buildSummary } from "./summary.js";
import { convertToINR } from "./currency.js";
import { generatePieChart } from "./chart.js";

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

/**
 * Check if an expense pushed a category over/near its budget, and send an alert.
 */
async function checkBudgetAlert(ctx, category, currency) {
    try {
        const budgets = await getBudgets();
        const budget = budgets.get(category);
        if (!budget) return; // no budget set for this category

        const spend = await getMonthlySpendByCategory();
        const spent = spend.get(category) || 0;
        const pct = Math.round((spent / budget) * 100);

        if (spent >= budget) {
            await ctx.reply(
                `🚨 *Budget Exceeded!*\n\n` +
                `You've spent ${currencyDisplay(currency, spent)} on *${category}* this month.\n` +
                `Budget: ${currencyDisplay(currency, budget)} (• ${pct}% used)`,
                { parse_mode: "Markdown" }
            );
        } else if (pct >= 80) {
            await ctx.reply(
                `⚠️ *Budget Warning*\n\n` +
                `You've spent ${currencyDisplay(currency, spent)} on *${category}* this month.\n` +
                `Budget: ${currencyDisplay(currency, budget)} (• ${pct}% used)`,
                { parse_mode: "Markdown" }
            );
        }
    } catch (err) {
        console.error("Budget alert check failed:", err);
    }
}

/**
 * Convert expense to INR if needed, and build the payload for appendExpense + display.
 */
async function buildExpensePayload(expense, rawTranscript) {
    const expenseDate = expense.date || new Date().toISOString().split("T")[0];
    let inrAmount = expense.amount;
    let originalCurrency = "";
    let originalAmount = null;
    let conversionNote = "";

    if (expense.currency && expense.currency !== "INR") {
        const { inrAmount: converted, rate } = await convertToINR(
            expense.amount, expense.currency, expenseDate
        );
        originalCurrency = expense.currency;
        originalAmount = expense.amount;
        inrAmount = converted;
        conversionNote = `\n💱 _Converted: ${currencyDisplay(expense.currency, expense.amount)} → ₹${inrAmount} @ ${rate}_`;
    }

    const sheetData = {
        date: expenseDate,
        amount: inrAmount,
        currency: "INR",
        category: expense.category,
        description: expense.description,
        rawTranscript,
        originalCurrency,
        originalAmount,
    };

    return { sheetData, inrAmount, expenseDate, conversionNote };
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
        `/chart — Pie chart of your spending\n` +
        `/undo — Delete the last logged expense\n` +
        `/budget — Set monthly budgets per category\n` +
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

// ── /budget command ─────────────────────────────────────────────────
bot.command("budget", async (ctx) => {
    const args = ctx.match?.trim() || "";

    try {
        // /budget set Food 5000
        if (args.toLowerCase().startsWith("set ")) {
            const parts = args.slice(4).trim().split(/\s+/);
            const amount = parseFloat(parts.pop());
            const category = parts.join(" ");
            if (!category || isNaN(amount) || amount <= 0) {
                await ctx.reply("⚠️ Usage: `/budget set Food 5000`", { parse_mode: "Markdown" });
                return;
            }
            await setBudget(category, amount);
            await ctx.reply(`✅ Budget for *${category}* set to *${amount}*/month`, { parse_mode: "Markdown" });
            return;
        }

        // /budget remove Food
        if (args.toLowerCase().startsWith("remove ")) {
            const category = args.slice(7).trim();
            if (!category) {
                await ctx.reply("⚠️ Usage: `/budget remove Food`", { parse_mode: "Markdown" });
                return;
            }
            const removed = await removeBudget(category);
            if (removed) {
                await ctx.reply(`🗑 Budget for *${category}* removed.`, { parse_mode: "Markdown" });
            } else {
                await ctx.reply(`⚠️ No budget found for *${category}*.`, { parse_mode: "Markdown" });
            }
            return;
        }

        // /budget (list all)
        const budgets = await getBudgets();
        if (budgets.size === 0) {
            await ctx.reply(
                `💰 *No budgets set yet.*\n\n` +
                `Set one with:\n\`/budget set Food 5000\``,
                { parse_mode: "Markdown" }
            );
            return;
        }

        const spend = await getMonthlySpendByCategory();
        let msg = `💰 *Monthly Budgets*\n\n`;

        for (const [cat, budget] of budgets) {
            const spent = spend.get(cat) || 0;
            const pct = Math.round((spent / budget) * 100);
            const bar = pct >= 100 ? "🟥" : pct >= 80 ? "🟨" : "🟩";
            msg += `${bar} *${cat}:* ${spent} / ${budget} (${pct}%)\n`;
        }

        msg += `\n💡 *Manage:*\n` +
            `\`/budget set Food 5000\`\n` +
            `\`/budget remove Food\``;

        await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (err) {
        console.error("Error managing budgets:", err);
        await ctx.reply("❌ Failed to manage budgets. Please try again.");
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

// ── /chart command ──────────────────────────────────────────────────
bot.command("chart", async (ctx) => {
    const period = (ctx.match?.trim() || "month").toLowerCase();
    if (!["week", "month"].includes(period)) {
        await ctx.reply("⚠️ Usage: `/chart` or `/chart week`", { parse_mode: "Markdown" });
        return;
    }

    const msg = await ctx.reply(`📊 Generating ${period}ly chart...`);

    try {
        const { getExpenses } = await import("./sheets.js");
        const expenses = await getExpenses();
        const now = new Date();

        // Filter expenses for the period
        const filtered = expenses.filter((e) => {
            const d = new Date(e.date);
            if (period === "week") {
                const dayOfWeek = now.getDay();
                const monday = new Date(now);
                monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                monday.setHours(0, 0, 0, 0);
                return d >= monday;
            } else {
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            }
        });

        if (filtered.length === 0) {
            await ctx.api.editMessageText(
                ctx.chat.id, msg.message_id,
                `📭 No expenses this ${period} to chart.`
            );
            return;
        }

        // Aggregate by category
        const spend = new Map();
        let total = 0;
        for (const e of filtered) {
            spend.set(e.category, (spend.get(e.category) || 0) + e.amount);
            total += e.amount;
        }

        const title = period === "week"
            ? `This Week's Spending — ₹${total.toLocaleString("en-IN")}`
            : `This Month's Spending — ₹${total.toLocaleString("en-IN")}`;

        const chartBuffer = await generatePieChart(spend, title);

        // Delete the "Generating..." message
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { });

        // Send chart as photo
        await ctx.replyWithPhoto(new InputFile(chartBuffer, "chart.png"), {
            caption: `📊 *${period === "week" ? "Weekly" : "Monthly"} Spending Chart*\n\nTotal: ₹${total.toLocaleString("en-IN")} across ${spend.size} categories`,
            parse_mode: "Markdown",
        });
    } catch (err) {
        console.error("Error generating chart:", err);
        await ctx.api.editMessageText(
            ctx.chat.id, msg.message_id,
            "❌ Failed to generate chart. Please try again."
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

        // 4. Convert to INR if needed & log to Google Sheet
        const { sheetData, inrAmount, expenseDate, conversionNote } = await buildExpensePayload(expense, transcript);
        await appendExpense(sheetData);

        // 5. Reply with confirmation
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `✅ *Expense Logged!*\n\n` +
            `💰 *Amount:* ₹${inrAmount}\n` +
            `📂 *Category:* ${expense.category}\n` +
            `📝 *Description:* ${expense.description}\n` +
            `🗓 *Date:* ${expenseDate}${conversionNote}\n\n` +
            `🎙 _"${transcript}"_`,
            { parse_mode: "Markdown" }
        );

        // Cleanup temp file
        await unlink(filePath).catch(() => { });

        // 6. Budget alert check
        await checkBudgetAlert(ctx, expense.category, "INR");
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

        // Convert to INR if needed & log to Google Sheet
        const { sheetData, inrAmount, expenseDate, conversionNote } = await buildExpensePayload(expense, "[receipt photo]");
        await appendExpense(sheetData);

        // Reply with confirmation
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `✅ *Receipt Logged!*\n\n` +
            `💰 *Amount:* ₹${inrAmount}\n` +
            `📂 *Category:* ${expense.category}\n` +
            `📝 *Description:* ${expense.description}\n` +
            `🗓 *Date:* ${expenseDate}${conversionNote}`,
            { parse_mode: "Markdown" }
        );

        // Budget alert check
        await checkBudgetAlert(ctx, expense.category, "INR");
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

        // Convert to INR if needed & log to Google Sheet
        const { sheetData, inrAmount, expenseDate, conversionNote } = await buildExpensePayload(expense, text);
        await appendExpense(sheetData);

        // Reply with confirmation
        await ctx.api.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            `✅ *Expense Logged!*\n\n` +
            `💰 *Amount:* ₹${inrAmount}\n` +
            `📂 *Category:* ${expense.category}\n` +
            `📝 *Description:* ${expense.description}\n` +
            `🗓 *Date:* ${expenseDate}${conversionNote}`,
            { parse_mode: "Markdown" }
        );

        // Budget alert check
        await checkBudgetAlert(ctx, expense.category, "INR");
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
