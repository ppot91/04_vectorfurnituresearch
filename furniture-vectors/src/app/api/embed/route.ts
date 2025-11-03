import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENROUTER_API_KEY in environment" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const { description } = body as { description?: unknown };

  if (!description) {
    return NextResponse.json(
      { error: "description payload required" },
      { status: 400 },
    );
  }

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:3000",
      "X-Title": "Furniture Vector Lab",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.OPENROUTER_EMBED_MODEL ?? "openai/text-embedding-3-small",
      input: JSON.stringify(description),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: "OpenRouter request failed", detail: errorText },
      { status: 502 },
    );
  }

  const json = (await response.json()) as EmbeddingResponse;
  const embedding = json.data?.[0]?.embedding;

  if (!embedding) {
    return NextResponse.json(
      { error: "Embedding missing in OpenRouter response" },
      { status: 502 },
    );
  }

  return NextResponse.json({ embedding });
}
