import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type Match = {
  id: string;
  name: string | null;
  image_url: string | null;
  description: Record<string, unknown>;
  similarity: number;
};

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY in environment" },
      { status: 500 },
    );
  }

  const { embedding, limit = 3, threshold = 0 } = (await req.json()) as {
    embedding?: number[];
    limit?: number;
    threshold?: number;
  };

  if (!embedding) {
    return NextResponse.json(
      { error: "embedding vector required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("match_furniture", {
    query_embedding: embedding,
    match_limit: limit,
    match_threshold: threshold,
  });

  if (error) {
    return NextResponse.json(
      { error: "Supabase RPC failed", detail: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    matches: (data as Match[]).map((match) => ({
      ...match,
      similarity_percent: Math.round(match.similarity * 10000) / 100,
    })),
  });
}
