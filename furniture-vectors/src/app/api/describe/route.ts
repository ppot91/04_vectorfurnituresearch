import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PROMPT = `You are an expert furniture cataloger and design specialist with a keen eye for detail. Your task is to analyze an image of a piece of furniture and generate a detailed, structured description in JSON format. This description will be used to create embeddings for a vector database to enable precise similarity searches. The description must be comprehensive, capturing everything from the high-level style to the most minute details.

JSON Output Schema:

{
  "object_type": "The specific type of furniture (e.g., 'Armchair', 'Side Table', 'Dining Chair').",
  "style": "The primary design style (e.g., 'Mid-Century Modern', 'Scandinavian', 'Industrial', 'Bohemian', 'Minimalist').",
  "materials": {
    "frame": "Material of the main structure (e.g., 'Solid Oak', 'Bent Plywood', 'Powder-coated Steel').",
    "upholstery": "Type and texture of the fabric or leather (e.g., 'Beige Linen', 'Black Top-grain Leather', 'Velvet'). Specify if not applicable.",
    "legs": "Material of the legs (e.g., 'Walnut', 'Brushed Brass', 'Chrome').",
    "other": "Any other notable materials (e.g., 'Cane webbing', 'Rattan accents')."
  },
  "colors": {
    "primary": "The dominant color of the piece.",
    "secondary": "Any significant secondary or accent colors.",
    "finish": "The finish of the materials (e.g., 'Matte Black', 'Natural Oil Finish', 'High-Gloss Lacquer')."
  },
  "shape_and_form": {
    "silhouette": "A description of the overall shape (e.g., 'Low-profile and rectangular', 'Organic and curved', 'Geometric and angular').",
    "backrest": "Description of the back (e.g., 'High-back with wings', 'Spindle back', 'Curved, open-frame').",
    "legs": "Description of the legs (e.g., 'Tapered and splayed', 'Straight block legs', 'Cantilever base').",
    "arms": "Description of the arms, if any (e.g., 'Track arms', 'Sloped arms', 'Armless')."
  },
  "key_features_and_details": [
    "A list of specific, notable details. Be very precise. Examples: 'Button-tufted backrest', 'Piped edge seams', 'Exposed finger joint construction', 'Woven cane panel on the back', 'Visible wood grain', 'Distressed finish on leather'."
  ],
  "overall_aesthetic": "A brief summary of the vibe or feeling the piece evokes (e.g., 'Elegant and formal', 'Cozy and casual', 'Sleek and professional', 'Airy and light')."
}

Instructions:
1. Strictly adhere to the provided JSON schema.
2. Be as descriptive and accurate as possible based on the visual information in the image.
3. Fill every field. If a feature is not present (e.g., upholstery on a wooden chair), use 'N/A' or a similar indicator.

Now, analyze the provided furniture image and generate the JSON description.`;

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENROUTER_API_KEY in environment" },
      { status: 500 },
    );
  }

  const formData = await req.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "image file required" }, { status: 400 });
  }

  const bytes = await image.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mime = image.type || "image/jpeg";
  const referer =
    process.env.OPENROUTER_REFERER ?? "http://localhost:3000/furniture-vectors";
  const model =
    process.env.OPENROUTER_GEMINI_MODEL ?? "google/gemini-2.0-flash-001";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "Furniture Vector Lab",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: PROMPT }],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze the attached furniture image and respond with JSON.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: "OpenRouter Gemini request failed", detail },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?:
          | string
          | Array<{
              type: string;
              text?: string;
            }>;
      };
    }>;
  };

  const choice = payload.choices?.[0]?.message;
  let raw = "";

  if (typeof choice?.content === "string") {
    raw = choice.content;
  } else if (Array.isArray(choice?.content)) {
    raw =
      choice?.content.find(
        (part) => part.type === "output_text" || part.type === "text",
      )?.text ?? "";
  }

  if (!raw) {
    return NextResponse.json(
      { error: "Gemini response was empty", payload },
      { status: 502 },
    );
  }

  let description: unknown;

  try {
    description = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Gemini response was not valid JSON", raw },
      { status: 502 },
    );
  }

  return NextResponse.json({ description });
}
