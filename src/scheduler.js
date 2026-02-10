import cron from "node-cron";
import config from "./config.js";
import { buildSummary } from "./summary.js";

/**
 * Start scheduled summary jobs.
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

            console.log("⏰  Sending monthly summary...");
            try {
                const summary = await buildSummary("month");
                await bot.api.sendMessage(chatId, summary, {
                    parse_mode: "Markdown",
                });
                console.log("✅  Monthly summary sent.");
            } catch (err) {
                console.error("❌  Failed to send monthly summary:", err.message);
            }
        },
        { timezone: tz }
    );

    console.log(`⏰  Scheduler active (timezone: ${tz})`);
    console.log(`    📅 Weekly summary  → every Saturday at 8:00 PM`);
    console.log(`    📅 Monthly summary → last day of the month at 8:00 PM`);
}
