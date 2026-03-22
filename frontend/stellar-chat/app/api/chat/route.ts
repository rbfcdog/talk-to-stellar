import { NextResponse } from "next/server";

const PYTHON_API_URL =
  process.env.PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PYTHON_API_URL ||
  "http://localhost:8000/api/actions/query";

export async function POST(req: Request) {
  try {
    const { messages, session_id } = await req.json();
    const userMessage = messages?.[messages.length - 1];

    if (!userMessage?.content) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const dataToSend = {
      query: userMessage.content,
      session_id: session_id || "web-session-default",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const pythonApiResponse = await fetch(PYTHON_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataToSend),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!pythonApiResponse.ok) {
      const errorText = await pythonApiResponse.text();
      throw new Error(`Python API Error: ${errorText}`);
    }

    const pythonApiData = await pythonApiResponse.json();
    const botResponse =
      pythonApiData?.result?.message ||
      pythonApiData?.message ||
      "No valid response received from the agent API.";

    return NextResponse.json({ content: botResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Next.js API proxy error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}