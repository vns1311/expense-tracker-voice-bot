import bot from "./bot.js";
import { startScheduler } from "./scheduler.js";

// ── Start the bot ───────────────────────────────────────────────────
console.log("🤖  Voice Expense Manager starting...");

bot.start({
    onStart: (botInfo) => {
        console.log(`✅  Bot is live! → @${botInfo.username}`);
        console.log(`    Send it a voice note on Telegram to log an expense.`);
        startScheduler(bot);
    },
});

// ── Graceful shutdown ───────────────────────────────────────────────
const shutdown = () => {
    console.log("\n👋  Shutting down...");
    bot.stop();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
