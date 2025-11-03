'use client';

import { useMemo, useState } from "react";

type Match = {
  id: string;
  name: string | null;
  image_url: string | null;
  description: Record<string, unknown>;
  similarity: number;
  similarity_percent: number;
};

export default function SearchPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<Record<string, unknown> | null>(
    null,
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const reset = () => {
    setDescription(null);
    setMatches([]);
    setStatus(null);
    setError(null);
  };

  async function describe(selectedFile: File) {
    setStatus("Describing query image with Gemini…");
    const form = new FormData();
    form.append("image", selectedFile);

    const res = await fetch("/api/describe", {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        data.detail ?? data.error ?? "Gemini description failed";
      throw new Error(message);
    }

    const { description: payload } = (await res.json()) as {
      description: Record<string, unknown>;
    };

    setDescription(payload);
    return payload;
  }

  async function embed(desc: Record<string, unknown>) {
    setStatus("Embedding query with OpenRouter…");
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        data.detail ?? data.error ?? "Embedding request failed";
      throw new Error(message);
    }

    const { embedding } = (await res.json()) as { embedding: number[] };
    return embedding;
  }

  async function search(embedding: number[]) {
    setStatus("Querying Supabase for nearest neighbors…");
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embedding, limit: 3 }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        data.detail ?? data.error ?? "Search RPC failed";
      throw new Error(message);
    }

    const { matches: payload } = (await res.json()) as { matches: Match[] };
    setMatches(payload ?? []);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();

    if (!file) {
      setError("Upload a query image to run similarity search.");
      return;
    }

    setIsProcessing(true);

    try {
      const desc = await describe(file);
      const embedding = await embed(desc);
      await search(embedding);
      setStatus("Search complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-50">
          Find similar furniture
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-400">
          Upload an image to create a fresh Gemini description, embed it, and
          retrieve the closest matches from Supabase pgvector.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-stone-800 bg-stone-900/60 p-6"
      >
        <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
          <label className="flex flex-col gap-3 text-sm text-stone-400">
            <span className="font-medium text-stone-200">Query image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setFile(selectedFile);
                reset();
              }}
              className="text-xs text-stone-300 file:mr-3 file:rounded-md file:border-0 file:bg-stone-700 file:px-3 file:py-2 file:text-stone-100"
            />
            <span className="text-xs text-stone-500">
              The same catalog prompt is used so results align with the dataset.
            </span>
          </label>
          {previewUrl && (
            <div className="relative h-56 overflow-hidden rounded-xl border border-stone-800 bg-stone-950/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Query preview"
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!file || isProcessing}
            className="rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
          >
            {isProcessing ? "Searching…" : "Search catalog"}
          </button>
          {status && <p className="text-sm text-emerald-400">{status}</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </form>

      {description && (
        <details className="rounded-xl border border-stone-800 bg-stone-900/50 p-4">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-stone-100">
            <span>Query description</span>
            <span className="text-xs lowercase text-stone-500">
              click to expand
            </span>
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto text-xs leading-relaxed text-stone-200">
            {JSON.stringify(description, null, 2)}
          </pre>
        </details>
      )}

      {matches.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-100">
            Top matches ({matches.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {matches.map((match) => (
              <article
                key={match.id}
                className="space-y-3 rounded-xl border border-stone-800 bg-stone-950/40 p-4 text-xs text-stone-300"
              >
                <div className="flex items-center justify-between text-sm font-medium text-stone-100">
                  <span>{match.name ?? "Unnamed item"}</span>
                  <span>{match.similarity_percent}%</span>
                </div>
                {match.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={match.image_url}
                    alt={match.name ?? "Furniture item"}
                    className="h-32 w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-stone-700 text-[10px] text-stone-500">
                    No image uploaded
                  </div>
                )}
                <details className="rounded-lg border border-stone-800 bg-stone-900/40 p-2">
                  <summary className="cursor-pointer text-[11px] text-stone-400">
                    View Gemini JSON
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-relaxed text-stone-400">
                    {JSON.stringify(match.description, null, 2)}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
