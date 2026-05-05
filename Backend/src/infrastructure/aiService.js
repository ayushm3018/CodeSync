import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODEL, GEMINI_API_KEY, SYSTEM_PROMPT } from '../config.js';

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
if (!genAI) {
    console.warn('[ai] GEMINI_API_KEY not set — chat will not work');
}

export function isAvailable() {
    return genAI !== null;
}

export async function* streamResponse(prompt) {
    const model = genAI.getGenerativeModel({
        model: AI_MODEL,
        systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
    }
}
