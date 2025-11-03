import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type Body = {
  name?: string;
  imageUrl?: string | null;
  imageBase64?: string | null;
  imageName?: string | null;
  description: unknown;
  embedding: number[];
};

function sanitizeFilename(candidate: string | null | undefined) {
  if (!candidate) {
    return "preview.jpg";
  }

  const withoutExtension = candidate.replace(/\.[^.]+$/, "");

  const stem = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 120);

  return `${stem || "preview"}.jpg`;
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY in environment" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as Body;

  if (!body?.description || !body?.embedding) {
    return NextResponse.json(
      { error: "description and embedding are required" },
      { status: 400 },
    );
  }

  const bucket = process.env.SUPABASE_IMAGE_BUCKET ?? "furniture-previews";

  let publicUrl: string | null = body.imageUrl ?? null;

  if (body.imageBase64) {
    const base64 = body.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    let buffer: Buffer;

    try {
      buffer = Buffer.from(base64, "base64");
    } catch (error) {
      return NextResponse.json(
        { error: "Image base64 payload invalid", detail: String(error) },
        { status: 400 },
      );
    }

    const objectPath = `${new Date()
      .toISOString()
      .slice(0, 10)}/${randomUUID()}-${sanitizeFilename(body.imageName)}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(objectPath, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Supabase image upload failed", detail: uploadError.message },
        { status: 502 },
      );
    }

    const { data: publicData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(objectPath);
    publicUrl = publicData.publicUrl;
  }

  const { data, error } = await supabaseAdmin
    .from("furniture_items")
    .insert({
      name: body.name ?? null,
      image_url: publicUrl,
      description: body.description,
      embedding: body.embedding,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Supabase insert failed", detail: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ item: data });
}
