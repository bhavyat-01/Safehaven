import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_LABS_API_KEY!,
});

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: `You are an AI Emergency Dispatcher.
GOAL: Protect the user and guide them safely.
RULES:
- Give calm instructions
- Short sentences
- Step-by-step movement guidance
- Avoid danger zones
- Never speculate
- Speak like a trained emergency operator
If threats are nearby, tell the safest direction to move.
Return ONLY spoken instructions.`,
});

// NOTE: Move this to a DB or session store for multi-user support
const conversationHistory: { role: "user" | "model"; parts: { text: string }[] }[] = [];

export async function POST(req: NextRequest) {
  try {
    const { message, location, threats } = await req.json();

    const userText = `
USER LOCATION: ${JSON.stringify(location)}
NEARBY THREATS: ${JSON.stringify(threats)}
USER QUESTION: ${message}
    `.trim();

    conversationHistory.push({
      role: "user",
      parts: [{ text: userText }],
    });

    /* ---------------- GEMINI ---------------- */
    const chat = model.startChat({ history: conversationHistory.slice(0, -1) });
    const result = await chat.sendMessage(userText);
    const responseText = result.response.text() || "Move to a safe indoor location.";

    conversationHistory.push({
      role: "model",
      parts: [{ text: responseText }],
    });

    /* ---------------- ELEVENLABS TTS ---------------- */
    const audio = await elevenlabs.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
      text: responseText,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    });

    // Handle both Node Readable and Web ReadableStream
    const audioBuffer = await streamToBuffer(audio);

    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });

  } catch (err) {
    console.error("[Dispatcher Error]", err);
    return NextResponse.json({ error: "Dispatcher failed" }, { status: 500 });
  }
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  // Node.js Readable
  if (typeof stream.pipe === "function") {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  // Web ReadableStream
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}