import { GoogleGenAI } from "@google/genai";
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function POST(req: Request) {
  try {
    // 1. Extract BOTH the chat history and the chosen model from the frontend
    const { contents, model } = await req.json();
    
    if (!contents || !Array.isArray(contents)) {
      return NextResponse.json({ error: 'Invalid conversation history' }, { status: 400 });
    }

    // 2. Set a fallback just in case the frontend doesn't send a model
    const targetModel = model || "gemma-4-26b-a4b-it";

    // 3. Pass the dynamic targetModel to the AI
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: contents,
    });

    return NextResponse.json({ success: true, text: response.text });
  } catch (error) {
    console.error("Chat Error:", error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate response.' }, 
      { status: 500 }
    );
  }
}
