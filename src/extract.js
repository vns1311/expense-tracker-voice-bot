import OpenAI from "openai";
import config from "./config.js";
import { getCategories } from "./sheets.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT_BASE = `You are an expense extraction assistant.

Given a transcript of a voice note or text message about a personal expense, extract the following fields and respond ONLY with a JSON object:

{
  "amount": <number or null>,
  "currency": "<3-letter ISO code, e.g. INR, USD, EUR>",
  "category": "<one of the categories below or null>",
  "description": "<short 2-5 word summary of what was purchased>",
  "date": "<YYYY-MM-DD>"
}

Rules:
- If the currency is not mentioned, default to INR.
- If the amount is NOT mentioned or cannot be reasonably inferred, set amount to null. Do NOT guess a random amount.
- If the category is unclear, use "Other".
- The description should be concise — e.g. "lunch at restaurant", "Uber ride", "electricity bill".
- For the date, resolve relative expressions ("yesterday", "last Friday", "day before yesterday", "last week Monday") to an actual YYYY-MM-DD date using TODAY'S DATE provided below.
- If no date is mentioned, use today's date.
- Always respond with valid JSON. No extra text.`;

/**
 * Build the full system prompt with dynamic category list.
 */
async function buildSystemPrompt() {
    const { all } = await getCategories();
    const today = new Date().toISOString().split("T")[0];
    const categoryList = all.map((c) => `- ${c}`).join("\n");
    return SYSTEM_PROMPT_BASE + `\n\nCategories (pick the best fit):\n${categoryList}\n\nTODAY'S DATE: ${today}`;
}

/**
 * Extract structured expense data from a transcript.
 *
 * @param {string} transcript
 * @returns {Promise<{ amount: number, currency: string, category: string, description: string, date: string }>}
 */
export async function extractExpense(transcript) {
    const systemPrompt = await buildSystemPrompt();
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcript },
        ],
        temperature: 0.1,
        max_tokens: 200,
    });

    const raw = response.choices[0].message.content;
    return JSON.parse(raw);
}

/**
 * Check if the extracted expense needs clarification.
 * @param {object} expense
 * @returns {{ needed: boolean, missingFields: string[] }}
 */
export function needsClarification(expense) {
    const missing = [];
    if (expense.amount == null) missing.push("amount");
    if (!expense.description || expense.description.toLowerCase() === "unknown") missing.push("description");
    return { needed: missing.length > 0, missingFields: missing };
}

/**
 * Complete an ambiguous expense extraction using the original input + the user's follow-up reply.
 *
 * @param {object} partialExpense - The incomplete expense data
 * @param {string} originalInput - The original user message
 * @param {string} followUp - The user's clarification reply
 * @returns {Promise<object>} completed expense
 */
export async function clarifyExpense(partialExpense, originalInput, followUp) {
    const systemPrompt = await buildSystemPrompt();
    const clarifyPrompt = `${systemPrompt}

You previously extracted partial data from a user's expense message but some fields were missing.
Here is what you have so far:
${JSON.stringify(partialExpense, null, 2)}

The user's original message was: "${originalInput}"
The user has now replied with additional information: "${followUp}"

Using the original message AND the follow-up, fill in ALL the fields. Return a complete JSON object with no null values. If the amount is still unclear, make your best guess based on context.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: clarifyPrompt },
            { role: "user", content: followUp },
        ],
        temperature: 0.1,
        max_tokens: 200,
    });

    const raw = response.choices[0].message.content;
    return JSON.parse(raw);
}

const RECEIPT_PROMPT_BASE = `You are an expense extraction assistant.

You will receive a photo of a receipt or bill. Extract the following fields and respond ONLY with a JSON object:

{
  "amount": <total amount as a number>,
  "currency": "<3-letter ISO code, e.g. INR, USD, EUR>",
  "category": "<one of the categories below>",
  "description": "<short 2-5 word summary of the purchase>",
  "date": "<YYYY-MM-DD>"
}

Rules:
- Extract the TOTAL / GRAND TOTAL amount from the receipt.
- If multiple items, summarize them (e.g. "restaurant dinner", "grocery shopping").
- If the currency is not clear, default to INR.
- If the category is unclear, use "Other".
- For the date: ALWAYS extract the date printed on the receipt (look for date, invoice date, bill date, transaction date, etc.). Convert it to YYYY-MM-DD format. Only default to today's date if absolutely no date is visible anywhere on the receipt.
- Always respond with valid JSON. No extra text.`;

/**
 * Build the receipt system prompt with dynamic category list.
 */
async function buildReceiptPrompt() {
    const { all } = await getCategories();
    const today = new Date().toISOString().split("T")[0];
    const categoryList = all.map((c) => `- ${c}`).join("\n");
    return RECEIPT_PROMPT_BASE + `\n\nCategories (pick the best fit):\n${categoryList}\n\nTODAY'S DATE: ${today}`;
}

/**
 * Extract structured expense data from a receipt image.
 *
 * @param {string} imageUrl  – public URL to the receipt image
 * @returns {Promise<{ amount: number, currency: string, category: string, description: string, date: string }>}
 */
export async function extractExpenseFromImage(imageUrl) {
    const receiptPrompt = await buildReceiptPrompt();
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: receiptPrompt },
            {
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: imageUrl } },
                ],
            },
        ],
        temperature: 0.1,
        max_tokens: 300,
    });

    const raw = response.choices[0].message.content;
    return JSON.parse(raw);
}
