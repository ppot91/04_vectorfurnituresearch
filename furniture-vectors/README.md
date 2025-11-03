## Furniture Vector Lab

Local sandbox that runs the full loop for cataloguing furniture images:

1. Upload a chair image and send it to Gemini 2.0 Flash with a detailed JSON prompt.
2. Turn the JSON response into a 1,536-dimensional vector with OpenRouter's `openai/text-embedding-3-small` endpoint.
3. Store the metadata, a 200×200 JPEG preview, and the vector in Supabase (pgvector + Storage).
4. Upload a new image to search — Gemini describes it, we embed it, and Supabase returns the closest matches.

## Prerequisites

- Node 18 or 20
- Supabase project with pgvector enabled
- API keys for OpenRouter (Gemini + embeddings)

## Configure environment

Copy the example file and fill in your secrets:

```bash
cp .env.example .env.local
```

`SUPABASE_SERVICE_ROLE_KEY` must stay on the server — never expose it to the browser.

Create a **public** Supabase Storage bucket (default name: `furniture-previews`) to store the generated previews, and add its name to `.env.local` via `SUPABASE_IMAGE_BUCKET`.

Run the SQL in `supabase/schema.sql` inside the Supabase SQL editor to provision the table and RPC function. Supabase limits vector indexes to 2,000 dimensions, so the project uses OpenRouter's `openai/text-embedding-3-small` (1,536 dims) with an HNSW index.

## Develop locally

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) for the UI:

- **Ingest Dataset** page normalizes each image to a 200×200 white-backed JPEG, runs describe → embed → insert, and uploads the preview to Supabase Storage.
- **Search Similar** page runs describe → embed → pgvector search for query images.

## Batch ingest script

Use `scripts/ingest.ts` to load a directory of images once the dev server is running:

```bash
npx ts-node scripts/ingest.ts path/to/your/chair-images
```

The script throttles calls slightly to keep Gemini/OpenRouter happy. Adjust the dataset path or extend it to upload previews if you need parity with the UI pipeline.
