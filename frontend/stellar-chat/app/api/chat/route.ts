// src/app/api/chat/route.ts

import { NextResponse } from "next/server";

// Pega a URL da sua API Python a partir de uma variável de ambiente
const PYTHON_API_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://localhost:8000/api/actions/query";

export async function POST(req: Request) {
  try {
    // 1. Pega a mensagem que o frontend enviou
    const { messages } = await req.json();
    const userMessage = messages[messages.length - 1]; // Pega a última mensagem (a do usuário)

    // 2. Prepara os dados para enviar para a API Python (no formato que ela espera)
    const dataToSend = {
      query: userMessage.content, // Corrigido de 'message_text' para 'query'
      session_id: "web-session-illustrative" // Corrigido e usando um ID fixo ilustrativo
    };

    // 3. Repassa a requisição para a sua API Python usando fetch
    const pythonApiResponse = await fetch(PYTHON_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToSend),
    });

    if (!pythonApiResponse.ok) {
      // Se a API Python der erro, repassa o erro para o frontend
      const errorText = await pythonApiResponse.text();
      throw new Error(`Python API Error: ${errorText}`);
    }

    // 4. Pega a resposta da API Python
    const pythonApiData = await pythonApiResponse.json();

    // 5. Envia a resposta de volta para o frontend
    // O ideal é que sua API Python retorne um JSON com uma chave "message"
    // Ex: {"result": {"message": "Olá! Processado."}}
    // Vamos adaptar para ler a resposta corretamente.
    const botResponse = pythonApiData.result?.message || "Não recebi uma resposta válida da API.";
    
    return NextResponse.json({ content: botResponse });

  } catch (error) {
    console.error("Next.js API proxy error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}