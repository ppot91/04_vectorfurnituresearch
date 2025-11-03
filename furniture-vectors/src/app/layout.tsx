import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Furniture Vector Lab",
  description:
    "Local playground for testing Gemini furniture descriptions and Supabase vector search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-stone-950 text-stone-100 antialiased`}
      >
        <div className="min-h-screen">
          <header className="border-b border-stone-800 bg-stone-950/80 backdrop-blur">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link
                href="/"
                className="text-lg font-semibold tracking-tight text-stone-50"
              >
                Furniture Vector Lab
              </Link>
              <div className="flex items-center gap-4 text-sm font-medium">
                <Link
                  href="/ingest"
                  className="rounded-full border border-stone-700 px-4 py-2 transition hover:border-stone-500 hover:text-white"
                >
                  Ingest Dataset
                </Link>
                <Link
                  href="/search"
                  className="rounded-full border border-stone-700 px-4 py-2 transition hover:border-stone-500 hover:text-white"
                >
                  Search Similar
                </Link>
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-12">{children}</main>
        </div>
      </body>
    </html>
  );
}
