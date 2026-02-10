import { getExpenses } from "./sheets.js";
import config from "./config.js";

// ── Currency symbols ────────────────────────────────────────────────
const CURRENCY_SYMBOLS = {
    INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥",
    AUD: "A$", CAD: "C$", SGD: "S$", AED: "د.إ",
};

function fmt(currency, amount) {
    const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    return `${sym}${amount.toLocaleString("en-IN")}`;
}

// ── Date helpers ────────────────────────────────────────────────────
function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatDate(d) {
    return d.toISOString().split("T")[0];
}

// ── Build summary ───────────────────────────────────────────────────
/**
 * @param {"week"|"month"} period
 * @returns {Promise<string>} Markdown-formatted summary
 */
export async function buildSummary(period) {
    const now = new Date();
    const cutoff = period === "week" ? startOfWeek(now) : startOfMonth(now);
    const label = period === "week" ? "This Week" : "This Month";
    const dateRange = `${formatDate(cutoff)} → ${formatDate(now)}`;

    const all = await getExpenses();
    const expenses = all.filter((e) => {
        const d = new Date(e.date);
        return d >= cutoff && d <= now;
    });

    if (expenses.length === 0) {
        return `📊 *${label} Summary*\n📅 ${dateRange}\n\n_No expenses recorded yet._`;
    }

    // ── Total ───────────────────────────────────────────────────────
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const mainCurrency = mostCommonCurrency(expenses);

    // ── By category ─────────────────────────────────────────────────
    const byCategory = {};
    for (const e of expenses) {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    }

    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const categoryLines = sorted.map(
        ([cat, amt]) => `  • ${cat}: ${fmt(mainCurrency, amt)}`
    );

    // ── High-value spends ───────────────────────────────────────────
    const threshold = config.highValueThreshold;
    const highValue = expenses
        .filter((e) => e.amount >= threshold)
        .sort((a, b) => b.amount - a.amount);

    let highValueSection = "";
    if (highValue.length > 0) {
        const hvLines = highValue.map(
            (e) => `  🔸 ${fmt(e.currency, e.amount)} — ${e.description} _(${e.date})_`
        );
        highValueSection =
            `\n\n🚨 *High-Value Spends* (≥ ${fmt(mainCurrency, threshold)})\n` +
            hvLines.join("\n");
    }

    // ── Compose ─────────────────────────────────────────────────────
    return (
        `📊 *${label} Summary*\n` +
        `📅 ${dateRange}\n\n` +
        `💰 *Total:* ${fmt(mainCurrency, total)}  ·  ${expenses.length} transaction${expenses.length > 1 ? "s" : ""}\n\n` +
        `📂 *By Category*\n` +
        categoryLines.join("\n") +
        highValueSection
    );
}

// ── Helpers ─────────────────────────────────────────────────────────
function mostCommonCurrency(expenses) {
    const counts = {};
    for (const e of expenses) {
        counts[e.currency] = (counts[e.currency] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
