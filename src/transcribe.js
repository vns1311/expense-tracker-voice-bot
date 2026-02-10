import OpenAI from "openai";
import { createReadStream } from "fs";
import config from "./config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Transcribe a voice audio file using OpenAI Whisper.
 * Supports .ogg, .mp3, .wav, .m4a, etc.
 * Works with any spoken language — Whisper auto-detects.
 *
 * @param {string} filePath  – path to the audio file
 * @returns {Promise<string>} – transcribed text
 */
export async function transcribeVoice(filePath) {
    const response = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: createReadStream(filePath),
    });

    return response.text;
}
