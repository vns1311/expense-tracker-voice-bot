/**
 * Currency conversion using Frankfurter API (free, no API key needed).
 * Converts foreign currencies to INR using the rate on the given date.
 */

const BASE_URL = "https://api.frankfurter.app";

/**
 * Convert an amount from one currency to INR.
 * Uses the historical rate for the given date.
 *
 * @param {number} amount
 * @param {string} fromCurrency - 3-letter ISO code (e.g. USD, EUR)
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<{ inrAmount: number, rate: number }>}
 */
export async function convertToINR(amount, fromCurrency, date) {
    if (fromCurrency === "INR") {
        return { inrAmount: amount, rate: 1 };
    }

    const url = `${BASE_URL}/${date}?from=${fromCurrency}&to=INR&amount=${amount}`;
    const res = await fetch(url);

    if (!res.ok) {
        // Fallback to latest rate if historical unavailable
        const fallback = await fetch(
            `${BASE_URL}/latest?from=${fromCurrency}&to=INR&amount=${amount}`
        );
        if (!fallback.ok) {
            throw new Error(`Currency conversion failed: ${fromCurrency} → INR`);
        }
        const data = await fallback.json();
        return {
            inrAmount: Math.round(data.rates.INR * 100) / 100,
            rate: Math.round((data.rates.INR / amount) * 10000) / 10000,
        };
    }

    const data = await res.json();
    return {
        inrAmount: Math.round(data.rates.INR * 100) / 100,
        rate: Math.round((data.rates.INR / amount) * 10000) / 10000,
    };
}
