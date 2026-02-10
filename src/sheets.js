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

// ── Delete the last expense row ─────────────────────────────────────
/**
 * Deletes the last data row from the sheet.
 * @returns {Promise<{ date: string, amount: number, currency: string, category: string, description: string } | null>}
 */
export async function deleteLastExpense() {
    // 1. Get all rows to find the last one
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A2:F`,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return null;

    const lastRow = rows[rows.length - 1];
    const lastRowIndex = rows.length + 1; // +1 for header row (1-indexed)

    // 2. Get the numeric sheet (tab) ID
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets.properties",
    });
    const sheetTab = meta.data.sheets.find(
        (s) => s.properties.title === SHEET_NAME
    );
    const sheetGid = sheetTab.properties.sheetId;

    // 3. Delete the row
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: sheetGid,
                            dimension: "ROWS",
                            startIndex: lastRowIndex - 1, // 0-indexed
                            endIndex: lastRowIndex,
                        },
                    },
                },
            ],
        },
    });

    return {
        date: lastRow[0] || "",
        amount: parseFloat(lastRow[1]) || 0,
        currency: lastRow[2] || "INR",
        category: lastRow[3] || "Other",
        description: lastRow[4] || "",
    };
}
