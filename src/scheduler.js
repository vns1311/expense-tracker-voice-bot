import cron from "node-cron";
import config from "./config.js";
import { buildSummary } from "./summary.js";
import { getExpenses } from "./sheets.js";

/**
 * Start scheduled summary jobs.
 * - Daily:   Every day at 9:00 PM — today's spending digest
 * - Weekly:  Every Saturday at 8:00 PM
 * - Monthly: Every day at 8:00 PM — but only sends on the last day of the month
 *
 * @param {import("grammy").Bot} bot
 */
export function startScheduler(bot) {
    const chatId = config.telegramChatId;
    const tz = config.timezone;

    if (!chatId) {
        console.log(
            "⏰  Scheduler skipped — set TELEGRAM_CHAT_ID in .env to enable auto-summaries."
        );
        return;
    }

    // ── Daily digest: 9 PM every day ────────────────────────────────
    cron.schedule(
        "0 21 * * *",
        async () => {
            console.log("⏰  Sending daily digest...");
            try {
                const expenses = await getExpenses();
                const today = new Date().toISOString().split("T")[0];
                const todayExpenses = expenses.filter((e) => e.date === today);

                if (todayExpenses.length === 0) {
                    // No expenses today — send gentle reminder
                    await bot.api.sendMessage(
                        chatId,
                        `📅 *Daily Digest*\n\nNo expenses logged today. Either a great day or you forgot to log! 😄`,
                        { parse_mode: "Markdown" }
                    );
                    console.log("✅  Daily digest sent (no expenses).");
                    return;
                }

                const total = todayExpenses.reduce((s, e) => s + e.amount, 0);
                const byCategory = new Map();
                for (const e of todayExpenses) {
                    byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amount);
                }

                let msg = `📅 *Daily Digest — ${today}*\n\n`;
                msg += `💰 *Total:* ₹${total.toLocaleString("en-IN")} across ${todayExpenses.length} transaction${todayExpenses.length > 1 ? "s" : ""}\n\n`;

                const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
                for (const [cat, amt] of sorted) {
                    msg += `• ${cat}: ₹${amt.toLocaleString("en-IN")}\n`;
                }

                // Show top expense
                const biggest = [...todayExpenses].sort((a, b) => b.amount - a.amount)[0];
                msg += `\n🏆 *Biggest:* ₹${biggest.amount.toLocaleString("en-IN")} — ${biggest.description}`;

                await bot.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });
                console.log("✅  Daily digest sent.");
            } catch (err) {
                console.error("❌  Failed to send daily digest:", err.message);
            }
        },
        { timezone: tz }
    );

    // ── Weekly: Saturday at 8 PM ────────────────────────────────────
    // Cron: minute hour * * day-of-week  (6 = Saturday)
    cron.schedule(
        "0 20 * * 6",
        async () => {
            console.log("⏰  Sending weekly summary...");
            try {
                const summary = await buildSummary("week");
                await bot.api.sendMessage(chatId, summary, {
                    parse_mode: "Markdown",
                });
                console.log("✅  Weekly summary sent.");
            } catch (err) {
                console.error("❌  Failed to send weekly summary:", err.message);
            }
        },
        { timezone: tz }
    );

    // ── Monthly: Last day of the month at 8 PM ─────────────────────
    // Runs every day at 8 PM, but checks if tomorrow is the 1st
    cron.schedule(
        "0 20 * * *",
        async () => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Only fire on the last day of the month
            if (tomorrow.getDate() !== 1) return;

            console.log("⏰  Sending monthly summary + insights...");
            try {
                const summary = await buildSummary("month");
                await bot.api.sendMessage(chatId, summary, {
                    parse_mode: "Markdown",
                });

                // Auto-generate AI insights
                const expenses = await getExpenses();
                const thisMonth = now.getMonth();
                const thisYear = now.getFullYear();
                const monthly = expenses.filter((e) => {
                    const d = new Date(e.date);
                    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
                });

                if (monthly.length >= 3) {
                    const byCategory = new Map();
                    let total = 0;
                    for (const e of monthly) {
                        byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amount);
                        total += e.amount;
                    }

                    const spendSummary = [...byCategory.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, amt]) => `${cat}: ₹${amt} (${Math.round((amt / total) * 100)}%)`)
                        .join("\n");

                    const { default: OpenAI } = await import("openai");
                    const openai = new OpenAI({ apiKey: config.openaiApiKey });

                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: `You are a personal finance advisor. Given the user's monthly spending breakdown, provide 3-4 short, actionable insights. Use emoji. Keep it under 200 words. Format in Markdown.`,
                            },
                            {
                                role: "user",
                                content: `Monthly spending (${monthly.length} transactions, total ₹${total}):\n\n${spendSummary}`,
                            },
                        ],
                        temperature: 0.7,
                        max_tokens: 400,
                    });

                    await bot.api.sendMessage(
                        chatId,
                        `🧠 *Monthly AI Insights*\n\n${response.choices[0].message.content}`,
                        { parse_mode: "Markdown" }
                    );
                }

                console.log("✅  Monthly summary + insights sent.");
            } catch (err) {
                console.error("❌  Failed to send monthly summary:", err.message);
            }
        },
        { timezone: tz }
    );

    console.log(`⏰  Scheduler active (timezone: ${tz})`);
    console.log(`    📅 Daily digest   → every day at 9:00 PM`);
    console.log(`    📅 Weekly summary  → every Saturday at 8:00 PM`);
    console.log(`    📅 Monthly summary → last day of the month at 8:00 PM`);
}

