'use client';

import { useState } from "react";

type GeminiDescription = Record<string, unknown>;

type BatchStatus = "pending" | "processing" | "success" | "error";

type BatchItem = {
  id: string;
  file: File;
  relativePath: string;
  status: BatchStatus;
  message?: string;
};

type NormalizedImage = {
  file: File;
  base64: string;
  previewUrl: string;
  width: number;
  height: number;
};

function fileStem(file: File) {
  return file.name.replace(/\.[^.]+$/, "") || "image";
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = (event) => {
      URL.revokeObjectURL(objectUrl);
      reject(event);
    };
    image.src = objectUrl;
  });
}

async function normalizeImageToJpeg(file: File): Promise<NormalizedImage> {
  const targetSize = 200;
  const image = await loadImageElement(file);

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to obtain 2D canvas context.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetSize, targetSize);

  const ratio = Math.min(
    targetSize / image.naturalWidth,
    targetSize / image.naturalHeight,
  );

  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  const offsetX = (targetSize - drawWidth) / 2;
  const offsetY = (targetSize - drawHeight) / 2;

  context.drawImage(
    image,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("Failed to create JPEG blob."));
        }
      },
      "image/jpeg",
      0.82,
    );
  });

  const arrayBuffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  const normalizedFile = new File([blob], `${fileStem(file)}.jpg`, {
    type: "image/jpeg",
  });
  const previewUrl = URL.createObjectURL(blob);

  return {
    file: normalizedFile,
    base64,
    previewUrl,
    width: targetSize,
    height: targetSize,
  };
}

async function describeViaApi(image: File) {
  const form = new FormData();
  form.append("image", image);

  const res = await fetch("/api/describe", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      detail.detail ?? detail.error ?? `Gemini description failed (${res.status})`;
    throw new Error(message);
  }

  const { description } = (await res.json()) as {
    description: GeminiDescription;
  };

  return description;
}

async function embedViaApi(description: GeminiDescription) {
  const res = await fetch("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      detail.detail ?? detail.error ?? `Embedding request failed (${res.status})`;
    throw new Error(message);
  }

  const { embedding } = (await res.json()) as { embedding: number[] };
  return embedding;
}

async function ingestViaApi(input: {
  name: string | null;
  imageBase64?: string | null;
  imageName?: string | null;
  description: GeminiDescription;
  embedding: number[];
}) {
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      imageBase64: input.imageBase64 ?? null,
      imageName: input.imageName ?? null,
      description: input.description,
      embedding: input.embedding,
    }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      detail.detail ?? detail.error ?? `Supabase insert failed (${res.status})`;
    throw new Error(message);
  }
}

export default function IngestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [normalizedPreviewUrl, setNormalizedPreviewUrl] = useState<string | null>(
    null,
  );
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<GeminiDescription | null>(null);
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const previewUrl = normalizedPreviewUrl ?? rawPreviewUrl;

  const clearRawPreview = () => {
    setRawPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  };

  const updateRawPreview = (nextFile: File | null) => {
    setRawPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return nextFile ? URL.createObjectURL(nextFile) : null;
    });
  };

  const clearNormalizedPreview = () => {
    setNormalizedPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  };

  const resetSingleOutputs = () => {
    setStatus(null);
    setError(null);
    setDescription(null);
    setEmbedding(null);
    clearNormalizedPreview();
  };

  async function handleSingleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetSingleOutputs();

    if (!file) {
      setError("Choose an image before ingesting.");
      return;
    }

    setIsProcessing(true);

    try {
      setStatus("Describing image with Gemini...");
      const desc = await describeViaApi(file);
      setDescription(desc);

      setStatus("Embedding description via OpenRouter...");
      const vector = await embedViaApi(desc);
      setEmbedding(vector);

      setStatus("Preparing 200x200 JPEG preview...");
      const normalized = await normalizeImageToJpeg(file);
      clearNormalizedPreview();
      setNormalizedPreviewUrl(normalized.previewUrl);
      clearRawPreview();

      setStatus("Saving into Supabase...");
      await ingestViaApi({
        name: name || fileStem(file),
        imageBase64: normalized.base64,
        imageName: normalized.file.name,
        description: desc,
        embedding: vector,
      });

      setStatus("Ingested successfully - ready for the next image.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleBatchSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((candidate) =>
      candidate.type.startsWith("image/"),
    );

    if (files.length === 0) {
      setBatchItems([]);
      setBatchStatus(null);
      setBatchError("No image files detected in that folder.");
      return;
    }

    const items = files
      .sort((a, b) => {
        const pathA = (a as File & { webkitRelativePath?: string })
          .webkitRelativePath;
        const pathB = (b as File & { webkitRelativePath?: string })
          .webkitRelativePath;
        return (pathA || a.name).localeCompare(pathB || b.name);
      })
      .map((image, index) => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        file: image,
        relativePath:
          (image as File & { webkitRelativePath?: string }).webkitRelativePath ??
          image.name,
        status: "pending" as BatchStatus,
      }));

    setBatchItems(items);
    setBatchStatus(`${items.length} image(s) queued for ingestion.`);
    setBatchError(null);
  }

  async function handleBatchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBatchError(null);

    if (batchItems.length === 0) {
      setBatchError("Select a folder with images before running the batch.");
      return;
    }

    setIsBatchProcessing(true);
    setBatchStatus(`Starting batch for ${batchItems.length} image(s)...`);

    let successCount = 0;

    for (let index = 0; index < batchItems.length; index += 1) {
      const item = batchItems[index];
      let normalized: NormalizedImage | null = null;

      setBatchItems((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "processing", message: "Describing with Gemini..." }
            : entry,
        ),
      );
      setBatchStatus(
        `Processing ${index + 1} of ${batchItems.length}: ${item.relativePath}`,
      );

      try {
        const desc = await describeViaApi(item.file);

        setBatchItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? { ...entry, message: "Embedding via OpenRouter..." }
              : entry,
          ),
        );

        const vector = await embedViaApi(desc);

        setBatchItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? { ...entry, message: "Preparing 200x200 JPEG preview..." }
              : entry,
          ),
        );

        normalized = await normalizeImageToJpeg(item.file);

        setBatchItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? { ...entry, message: "Saving to Supabase..." }
              : entry,
          ),
        );

        await ingestViaApi({
          name: fileStem(item.file),
          imageBase64: normalized.base64,
          imageName: normalized.file.name,
          description: desc,
          embedding: vector,
        });

        successCount += 1;
        setBatchItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "success", message: undefined }
              : entry,
          ),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unexpected error during batch.";
        setBatchItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "error", message }
              : entry,
          ),
        );
      } finally {
        if (normalized) {
          URL.revokeObjectURL(normalized.previewUrl);
        }
      }
    }

    const failureCount = batchItems.length - successCount;
    if (failureCount > 0) {
      setBatchError(
        "Batch completed with some errors. Check the list below for details.",
      );
    }

    setBatchStatus(
      `Batch complete: ${successCount} succeeded, ${failureCount} failed.`,
    );
    setIsBatchProcessing(false);
  }

  return (
    <section className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-50">
          Ingest furniture images
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-400">
          Upload a chair image to generate the structured Gemini JSON, embed it
          with OpenRouter, and store the vector row in Supabase. Gemini sees your
          original upload; the app also creates a 200x200 white-backed JPEG
          preview for Supabase Storage.
        </p>
      </div>

      <form
        onSubmit={handleSingleSubmit}
        className="space-y-6 rounded-2xl border border-stone-800 bg-stone-900/60 p-6"
      >
        <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
          <label className="flex flex-col gap-3 text-sm text-stone-400">
            <span className="font-medium text-stone-200">Furniture image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setFile(selectedFile);
                resetSingleOutputs();
                updateRawPreview(selectedFile);
              }}
              className="text-xs text-stone-300 file:mr-3 file:rounded-md file:border-0 file:bg-stone-700 file:px-3 file:py-2 file:text-stone-100"
            />
            <span className="text-xs text-stone-500">
              High-resolution JPEG or PNG works best.
            </span>
          </label>

          {previewUrl && (
            <div className="flex h-56 items-center justify-center rounded-xl border border-stone-800 bg-stone-950/50">
              <div className="flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-lg border border-stone-800 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-stone-400">
            <span className="font-medium text-stone-200">Catalog name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="E.g. walnut-lounge-chair"
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none transition focus:border-stone-400"
            />
          </label>
          <p className="self-end text-xs text-stone-500">
            Optional. Defaults to the file name when empty.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!file || isProcessing}
            className="rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
          >
            {isProcessing ? "Processing..." : "Ingest image"}
          </button>
          {status && <p className="text-sm text-emerald-400">{status}</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </form>

      {description && (
        <div className="grid gap-4 lg:grid-cols-2">
          <pre className="max-h-[420px] overflow-auto rounded-xl border border-stone-800 bg-stone-950/60 p-4 text-xs leading-relaxed text-stone-200">
            {JSON.stringify(description, null, 2)}
          </pre>
          <div className="space-y-4 rounded-xl border border-stone-800 bg-stone-900/50 p-4">
            <h2 className="text-sm font-semibold text-stone-100">
              Embedding preview
            </h2>
            <p className="text-xs text-stone-500">
              Vector length: {embedding?.length ?? 0} dimensions
            </p>
            <div className="text-xs text-stone-400">
              {embedding?.slice(0, 12).map((value, index) => (
                <span key={index} className="mr-2 inline-block">
                  {value.toFixed(3)}
                </span>
              )) ?? null}
              {embedding && embedding.length > 12 && (
                <span className="text-stone-600">...</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 rounded-2xl border border-stone-800 bg-stone-900/60 p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-stone-50">
            Batch ingest from a folder
          </h2>
          <p className="text-sm text-stone-400">
            Pick a local folder to process every image with the same describe →
            embed → insert pipeline. The browser sends files one by one; progress
            updates appear below.
          </p>
        </div>

        <form onSubmit={handleBatchSubmit} className="space-y-4">
          <label className="flex flex-col gap-3 text-sm text-stone-400">
            <span className="font-medium text-stone-200">
              Folder with chair images
            </span>
            <input
              type="file"
              multiple
              accept="image/*"
              // @ts-expect-error webkitdirectory is not in the type definitions
              webkitdirectory=""
              // @ts-expect-error directory is not in the type definitions
              directory=""
              onChange={handleBatchSelection}
              disabled={isBatchProcessing}
              className="text-xs text-stone-300 file:mr-3 file:rounded-md file:border-0 file:bg-stone-700 file:px-3 file:py-2 file:text-stone-100"
            />
            <span className="text-xs text-stone-500">
              Use a Chromium-based browser for best support. Only image files are
              queued.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isBatchProcessing || batchItems.length === 0}
              className="rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
            >
              {isBatchProcessing ? "Processing batch..." : "Run batch ingest"}
            </button>
            <button
              type="button"
              onClick={() => {
                setBatchItems([]);
                setBatchStatus(null);
                setBatchError(null);
              }}
              disabled={isBatchProcessing || batchItems.length === 0}
              className="rounded-full border border-stone-700 px-4 py-2 text-sm text-stone-300 transition hover:border-stone-500 hover:text-white disabled:cursor-not-allowed disabled:border-stone-900 disabled:text-stone-600"
            >
              Clear selection
            </button>
            {batchStatus && (
              <p className="text-sm text-emerald-400">{batchStatus}</p>
            )}
            {batchError && <p className="text-sm text-rose-400">{batchError}</p>}
          </div>
        </form>

        {batchItems.length > 0 && (
          <div className="space-y-3 rounded-xl border border-stone-800 bg-stone-950/50 p-4">
            <h3 className="text-sm font-semibold text-stone-200">
              Batch progress
            </h3>
            <ul className="space-y-2 text-xs text-stone-400">
              {batchItems.map((item) => {
                const color =
                  item.status === "success"
                    ? "text-emerald-400"
                    : item.status === "error"
                      ? "text-rose-400"
                      : item.status === "processing"
                        ? "text-amber-300"
                        : "text-stone-500";

                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 rounded-lg border border-stone-800 bg-stone-900/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-stone-200">
                        {item.relativePath}
                      </span>
                      <span className={`text-[11px] uppercase ${color}`}>
                        {item.status}
                      </span>
                    </div>
                    {item.message && (
                      <p className="text-[11px] text-stone-400">{item.message}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
