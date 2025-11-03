import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";
const DATASET_DIR =
  process.argv[2] ??
  path.resolve(process.cwd(), "..", "dataset", "chairs"); // adjust as needed

function detectMime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

async function ingestFile(filePath: string) {
  const fileName = path.basename(filePath);
  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], {
    type: detectMime(fileName),
  });

  const form = new FormData();
  form.append("image", blob, fileName);

  const describeRes = await fetch(`${API_BASE}/api/describe`, {
    method: "POST",
    body: form,
  });

  if (!describeRes.ok) {
    const detail = await describeRes.text();
    throw new Error(
      `Describe failed for ${fileName}: ${describeRes.status} ${detail}`,
    );
  }

  const { description } = (await describeRes.json()) as {
    description: Record<string, unknown>;
  };

  const embedRes = await fetch(`${API_BASE}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });

  if (!embedRes.ok) {
    const detail = await embedRes.text();
    throw new Error(
      `Embed failed for ${fileName}: ${embedRes.status} ${detail}`,
    );
  }

  const { embedding } = (await embedRes.json()) as { embedding: number[] };

  const ingestRes = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: fileName.replace(/\.[^.]+$/, ""),
      imageUrl: null,
      description,
      embedding,
    }),
  });

  if (!ingestRes.ok) {
    const detail = await ingestRes.text();
    throw new Error(
      `Supabase ingest failed for ${fileName}: ${ingestRes.status} ${detail}`,
    );
  }

  console.log(`✅ Ingested ${fileName}`);
}

async function main() {
  const entries = await fs.readdir(DATASET_DIR);
  const imageFiles = entries.filter((entry) =>
    /\.(png|jpe?g|webp|gif)$/i.test(entry),
  );

  if (imageFiles.length === 0) {
    console.warn("No images found in", DATASET_DIR);
    return;
  }

  for (const file of imageFiles) {
    const fullPath = path.join(DATASET_DIR, file);
    try {
      await ingestFile(fullPath);
      await new Promise((resolve) => setTimeout(resolve, 500)); // gentle pacing
    } catch (error) {
      console.error("❌", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
