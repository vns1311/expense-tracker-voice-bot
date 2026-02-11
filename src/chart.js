/**
 * Generate spending pie chart using QuickChart.io API.
 * No npm packages needed — renders Chart.js configs as PNG via HTTP.
 */

const QUICKCHART_URL = "https://quickchart.io/chart";

// Curated color palette for pie charts
const COLORS = [
    "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF",
    "#FF9F40", "#E7E9ED", "#76D7C4", "#F7DC6F", "#AF7AC5",
    "#85C1E9", "#F0B27A", "#82E0AA", "#F1948A", "#AED6F1",
    "#D5DBDB", "#EDBB99", "#A3E4D7", "#D2B4DE", "#FAD7A0",
];

/**
 * Generate a pie chart image buffer from category → amount data.
 *
 * @param {Map<string, number>} spendByCategory
 * @param {string} title - Chart title
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generatePieChart(spendByCategory, title) {
    const labels = [];
    const data = [];

    // Sort by amount descending
    const sorted = [...spendByCategory.entries()].sort((a, b) => b[1] - a[1]);

    for (const [cat, amount] of sorted) {
        labels.push(`${cat} (₹${amount.toLocaleString("en-IN")})`);
        data.push(amount);
    }

    const chartConfig = {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: "#1a1a2e",
            }],
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: { size: 18, weight: "bold" },
                    color: "#e0e0e0",
                },
                legend: {
                    position: "bottom",
                    labels: {
                        color: "#e0e0e0",
                        font: { size: 12 },
                        padding: 12,
                    },
                },
                datalabels: {
                    color: "#fff",
                    font: { size: 12, weight: "bold" },
                    formatter: (value, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = Math.round((value / total) * 100);
                        return pct >= 5 ? `${pct}%` : "";
                    },
                },
            },
        },
    };

    const url = `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=500&bkg=%231a1a2e&f=png`;

    // If URL is too long (>8000 chars), use POST instead
    if (url.length > 8000) {
        const res = await fetch(QUICKCHART_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chart: chartConfig,
                width: 600,
                height: 500,
                backgroundColor: "#1a1a2e",
                format: "png",
            }),
        });
        if (!res.ok) throw new Error(`QuickChart API error: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`QuickChart API error: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}
