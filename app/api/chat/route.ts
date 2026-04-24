import { GoogleGenAI } from "@google/genai";
import { NextResponse } from 'next/server';

// The SDK automatically looks for process.env.GEMINI_API_KEY in the Vercel environment
const ai = new GoogleGenAI();

export async function POST(req: Request) {
  try {
    const { contents } = await req.json();
    
    if (!contents || !Array.isArray(contents)) {
      return NextResponse.json({ error: 'Invalid conversation history' }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: "gemma-4-26b-a4b-it",
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
