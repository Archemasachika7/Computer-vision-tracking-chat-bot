import { NextResponse } from 'next/server';

export const maxDuration = 90;

const MOCK_REPLIES = [
  "I'm your AI assistant. I can help you analyze images, answer questions, and assist during your exam session. Upload an image or type your question!",
  "Great question! In computer science, algorithms are step-by-step procedures for solving problems. The efficiency of an algorithm is measured by its time and space complexity.",
  "Binary search works by repeatedly dividing the search interval in half. It has O(log n) time complexity, making it much faster than linear search for sorted arrays.",
  "Object-oriented programming (OOP) is a paradigm based on the concept of objects, which combine data (attributes) and behavior (methods). Key principles are encapsulation, inheritance, and polymorphism.",
  "Sure! I can see the image you've attached. Please go ahead and ask me anything about it — I'll do my best to help.",
];

let mockIndex = 0;

export async function POST(req: Request) {
  try {
    const { contents, model } = await req.json();
    const targetModel = model || 'gemma-4-26b-a4b-it';

    const apiKey =
      targetModel === 'gemma-4-31b-it'
        ? process.env.GEMINI_API_KEY_SECONDARY
        : process.env.GEMINI_API_KEY_PRIMARY;

    // ── MOCK MODE: no API key configured ──────────────────────────────
    if (!apiKey) {
      await new Promise((r) => setTimeout(r, 800)); // simulate latency
      const reply = MOCK_REPLIES[mockIndex % MOCK_REPLIES.length];
      mockIndex++;
      return NextResponse.json({ success: true, text: reply });
    }

    // ── LIVE MODE ─────────────────────────────────────────────────────
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({ model: targetModel, contents });
    return NextResponse.json({ success: true, text: response.text });

  } catch (error: any) {
    console.error('Chat API error:', error);
    const msg: string = error?.message ?? '';

    if (msg.includes('Stream idle timeout') || msg.includes('partial response') || msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED')) {
      return NextResponse.json({ success: false, error: 'Model timed out. Try a shorter prompt or switch to 26B.' }, { status: 504 });
    }
    if (msg.includes('500') || error?.status === 500) {
      return NextResponse.json({ success: false, error: 'Model server overloaded. Try the 26B model.' }, { status: 500 });
    }
    if (msg.includes('429') || error?.status === 429) {
      return NextResponse.json({ success: false, error: 'Rate limit hit. Please wait and retry.' }, { status: 429 });
    }

    return NextResponse.json({ success: false, error: 'Connection failed.' }, { status: 500 });
  }
}
