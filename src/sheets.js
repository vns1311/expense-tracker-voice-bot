import { google } from "googleapis";
import config from "./config.js";

// ── Auth ────────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({
    credentials: config.googleCredentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = config.googleSheetId;
const SHEET_NAME = "Expenses"; // tab name inside the spreadsheet

// ── Ensure header row exists ────────────────────────────────────────
let headerChecked = false;

async function ensureHeaders() {
    if (headerChecked) return;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1:F1`,
    });

    if (!res.data.values || res.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A1:F1`,
            valueInputOption: "RAW",
            requestBody: {
                values: [["Date", "Amount", "Currency", "Category", "Description", "Raw Transcript"]],
            },
        });
        console.log("📊  Created header row in Google Sheet");
    }

    headerChecked = true;
}

// ── Append an expense row ───────────────────────────────────────────
/**
 * @param {{ date: string, amount: number, currency: string, category: string, description: string, rawTranscript: string }} expense
 */
export async function appendExpense(expense) {
    await ensureHeaders();

    const row = [
        expense.date,
        expense.amount,
        expense.currency,
        expense.category,
        expense.description,
        expense.rawTranscript,
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:F`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
    });
}

// ── Read all expense rows ───────────────────────────────────────────
/**
 * @returns {Promise<Array<{ date: string, amount: number, currency: string, category: string, description: string, rawTranscript: string }>>}
 */
export async function getExpenses() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A2:F`, // skip header row
    });

    const rows = res.data.values || [];
    return rows.map((row) => ({
        date: row[0] || "",
        amount: parseFloat(row[1]) || 0,
        currency: row[2] || "INR",
        category: row[3] || "Other",
        description: row[4] || "",
        rawTranscript: row[5] || "",
    }));
}
