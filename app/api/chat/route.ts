import { GoogleGenAI } from "@google/genai";
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { contents, model } = await req.json();
    const targetModel = model || "gemma-4-26b-a4b-it";

    // SELECT THE KEY BASED ON THE MODEL
    // We use different keys for different models to bypass project-level locks
    const apiKey = targetModel === "gemma-4-31b-it" 
      ? process.env.GEMINI_API_KEY_SECONDARY 
      : process.env.GEMINI_API_KEY_PRIMARY;

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured in Vercel' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: contents,
    });

    return NextResponse.json({ success: true, text: response.text });

  } catch (error: any) {
    console.error("Dual-Key Chat Error:", error);
    
    // Check if it's the specific Google 500 error
    if (error.message?.includes("500") || error.status === 500) {
       return NextResponse.json({ 
         success: false, 
         error: "Google's 31B server is currently overloaded. Please switch to 26B." 
       }, { status: 500 });
    }

    return NextResponse.json({ success: false, error: "Connection failed." }, { status: 500 });
  }
}
