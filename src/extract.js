import OpenAI from "openai";
import config from "./config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You are an expense extraction assistant.

Given a transcript of a voice note about a personal expense, extract the following fields and respond ONLY with a JSON object:

{
  "amount": <number>,
  "currency": "<3-letter ISO code, e.g. INR, USD, EUR>",
  "category": "<one of the categories below>",
  "description": "<short 2-5 word summary of what was purchased>"
}

Categories (pick the best fit):
- Food
- Transport
- Shopping
- Bills
- Entertainment
- Health
- Education
- Travel
- Groceries
- Other

Rules:
- If the currency is not mentioned, default to INR.
- If the amount is ambiguous, make your best guess.
- If the category is unclear, use "Other".
- The description should be concise — e.g. "lunch at restaurant", "Uber ride", "electricity bill".
- Always respond with valid JSON. No extra text.`;

/**
 * Extract structured expense data from a transcript.
 *
 * @param {string} transcript
 * @returns {Promise<{ amount: number, currency: string, category: string, description: string }>}
 */
export async function extractExpense(transcript) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: transcript },
        ],
        temperature: 0.1,
        max_tokens: 200,
    });

    const raw = response.choices[0].message.content;
    return JSON.parse(raw);
}
