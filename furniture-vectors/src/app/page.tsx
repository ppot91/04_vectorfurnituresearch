export default function Home() {
  return (
    <section className="grid gap-10 text-stone-200 lg:grid-cols-2">
      <div className="space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight">
          Build a local furniture vector sandbox.
        </h1>
        <p className="text-lg text-stone-400">
          Use Gemini 2.0 Flash to catalog each chair image, convert the JSON
          descriptions into embeddings with OpenRouter, and store everything in
          Supabase&apos;s pgvector. Then compare new query images to find the
          closest matches.
        </p>
        <ul className="space-y-3 text-sm text-stone-400">
          <li className="rounded-lg border border-stone-800 bg-stone-900/70 p-4">
            <span className="font-medium text-stone-100">1 · Ingest:</span>{" "}
            Upload dataset images, get Gemini JSON, embed via OpenRouter, and
            push into Supabase.
          </li>
          <li className="rounded-lg border border-stone-800 bg-stone-900/70 p-4">
            <span className="font-medium text-stone-100">2 · Search:</span>{" "}
            Gemini describes a query image, we embed it, and pgvector returns the
            three closest furniture matches.
          </li>
        </ul>
        <p className="text-sm text-stone-500">
          Configure API keys in <code>.env.local</code>, then run{" "}
          <code>npm run dev</code> and start exploring.
        </p>
      </div>
      <div className="space-y-4 rounded-xl border border-stone-800 bg-stone-900/60 p-6 text-sm text-stone-300">
        <h2 className="text-base font-semibold text-stone-100">
          Environment keys
        </h2>
        <ul className="space-y-2">
          <li>
            <code>OPENROUTER_API_KEY</code> ·{" "}
            <span className="text-stone-500">OpenRouter embedding endpoint</span>
          </li>
          <li>
            <code>GEMINI_API_KEY</code> ·{" "}
            <span className="text-stone-500">
              Gemini 2.0 Flash for JSON furniture descriptions
            </span>
          </li>
          <li>
            <code>SUPABASE_SERVICE_ROLE_KEY</code> ·{" "}
            <span className="text-stone-500">
              Server-side insert and RPC access
            </span>
          </li>
          <li>
            <code>NEXT_PUBLIC_SUPABASE_URL</code> &amp;{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          </li>
        </ul>
        <p className="text-xs text-stone-500">
          Keep service-role usage to server components and API routes only.
        </p>
      </div>
    </section>
  );
}
