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
const CATEGORIES_SHEET_NAME = "Categories"; // tab for custom categories
const BUDGETS_SHEET_NAME = "Budgets"; // tab for monthly budgets

// ── Ensure header row exists ────────────────────────────────────────
let headerChecked = false;

async function ensureHeaders() {
    if (headerChecked) return;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1:H1`,
    });

    if (!res.data.values || res.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A1:H1`,
            valueInputOption: "RAW",
            requestBody: {
                values: [["Date", "Amount (INR)", "Currency", "Category", "Description", "Raw Transcript", "Original Currency", "Original Amount"]],
            },
        });
        console.log("📊  Created header row in Google Sheet");
    }

    headerChecked = true;
}

// ── Append an expense row ───────────────────────────────────────────
/**
 * @param {{ date: string, amount: number, currency: string, category: string, description: string, rawTranscript: string, originalCurrency?: string, originalAmount?: number }} expense
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
        expense.originalCurrency || "",
        expense.originalAmount || "",
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:H`,
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

// ── Custom Categories ───────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
    "Food", "Transport", "Shopping", "Bills", "Entertainment",
    "Health", "Education", "Travel", "Groceries", "Other",
];

async function ensureCategoriesTab() {
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets.properties.title",
    });
    const exists = meta.data.sheets.some(
        (s) => s.properties.title === CATEGORIES_SHEET_NAME
    );
    if (!exists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                requests: [{ addSheet: { properties: { title: CATEGORIES_SHEET_NAME } } }],
            },
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${CATEGORIES_SHEET_NAME}!A1:B1`,
            valueInputOption: "RAW",
            requestBody: { values: [["Category", "Added On"]] },
        });
    }
}

/**
 * Get all categories (defaults + custom).
 * @returns {Promise<{ all: string[], custom: string[], defaults: string[] }>}
 */
export async function getCategories() {
    await ensureCategoriesTab();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${CATEGORIES_SHEET_NAME}!A2:A`,
    });
    const custom = (res.data.values || []).map((r) => r[0]).filter(Boolean);
    return {
        defaults: DEFAULT_CATEGORIES,
        custom,
        all: [...DEFAULT_CATEGORIES, ...custom],
    };
}

/**
 * Add a custom category.
 * @param {string} name
 * @returns {Promise<boolean>} true if added, false if already exists
 */
export async function addCategory(name) {
    const { all } = await getCategories();
    if (all.some((c) => c.toLowerCase() === name.toLowerCase())) return false;

    const today = new Date().toISOString().split("T")[0];
    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${CATEGORIES_SHEET_NAME}!A:B`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [[name, today]] },
    });
    return true;
}

/**
 * Remove a custom category.
 * @param {string} name
 * @returns {Promise<boolean>} true if removed, false if not found or is a default
 */
export async function removeCategory(name) {
    if (DEFAULT_CATEGORIES.some((c) => c.toLowerCase() === name.toLowerCase())) {
        return false; // can't remove defaults
    }

    await ensureCategoriesTab();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${CATEGORIES_SHEET_NAME}!A2:A`,
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex(
        (r) => r[0] && r[0].toLowerCase() === name.toLowerCase()
    );
    if (idx === -1) return false;

    const rowIndex = idx + 2; // +1 header, +1 zero-index

    // Get sheet GID
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets.properties",
    });
    const tab = meta.data.sheets.find(
        (s) => s.properties.title === CATEGORIES_SHEET_NAME
    );

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: tab.properties.sheetId,
                        dimension: "ROWS",
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex,
                    },
                },
            }],
        },
    });
    return true;
}

// ── Monthly Budgets ─────────────────────────────────────────────────
async function ensureBudgetsTab() {
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets.properties.title",
    });
    const exists = meta.data.sheets.some(
        (s) => s.properties.title === BUDGETS_SHEET_NAME
    );
    if (!exists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                requests: [{ addSheet: { properties: { title: BUDGETS_SHEET_NAME } } }],
            },
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${BUDGETS_SHEET_NAME}!A1:B1`,
            valueInputOption: "RAW",
            requestBody: { values: [["Category", "Budget"]] },
        });
    }
}

/**
 * Get all budgets.
 * @returns {Promise<Map<string, number>>} category → budget amount
 */
export async function getBudgets() {
    await ensureBudgetsTab();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${BUDGETS_SHEET_NAME}!A2:B`,
    });
    const map = new Map();
    for (const row of res.data.values || []) {
        if (row[0] && row[1]) map.set(row[0], parseFloat(row[1]));
    }
    return map;
}

/**
 * Set (or update) a budget for a category.
 * @param {string} category
 * @param {number} amount
 */
export async function setBudget(category, amount) {
    await ensureBudgetsTab();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${BUDGETS_SHEET_NAME}!A2:B`,
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex(
        (r) => r[0] && r[0].toLowerCase() === category.toLowerCase()
    );

    if (idx >= 0) {
        // Update existing
        const rowNum = idx + 2;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${BUDGETS_SHEET_NAME}!B${rowNum}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[amount]] },
        });
    } else {
        // Append new
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: `${BUDGETS_SHEET_NAME}!A:B`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [[category, amount]] },
        });
    }
}

/**
 * Remove a budget for a category.
 * @param {string} category
 * @returns {Promise<boolean>}
 */
export async function removeBudget(category) {
    await ensureBudgetsTab();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${BUDGETS_SHEET_NAME}!A2:B`,
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex(
        (r) => r[0] && r[0].toLowerCase() === category.toLowerCase()
    );
    if (idx === -1) return false;

    const rowIndex = idx + 2;
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets.properties",
    });
    const tab = meta.data.sheets.find(
        (s) => s.properties.title === BUDGETS_SHEET_NAME
    );

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: tab.properties.sheetId,
                        dimension: "ROWS",
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex,
                    },
                },
            }],
        },
    });
    return true;
}

/**
 * Get total spend for the current month grouped by category.
 * @returns {Promise<Map<string, number>>}
 */
export async function getMonthlySpendByCategory() {
    const expenses = await getExpenses();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    const map = new Map();
    for (const e of expenses) {
        const d = new Date(e.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
            map.set(e.category, (map.get(e.category) || 0) + e.amount);
        }
    }
    return map;
}

