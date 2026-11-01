import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuditLens",
  description: "Slither finds. Gemma 4 explains. Code verifies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions add attributes to <body>; don't flag that as a hydration error. */}
      <body className="min-h-screen font-sans" suppressHydrationWarning>
        <header className="sticky top-0 z-40 border-b border-mocha-800/60 bg-mocha-950/55 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-mocha-100">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-lavender-200 via-lavender-400 to-mocha-300 font-mono text-sm font-bold text-mocha-950 shadow-[0_0_18px_-4px_rgba(196,181,236,0.8)]">AL</span>
              AuditLens
            </Link>
            <nav className="flex items-center gap-5 text-sm text-mocha-400">
              <span className="hidden text-xs text-mocha-500 md:block">Slither finds · Gemma 4 explains · code verifies</span>
              <Link href="/history" className="transition hover:text-lavender-200">
                History
              </Link>
              <Link href="/benchmark" className="transition hover:text-lavender-200">
                Benchmark
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-mocha-600">
          Automated first-pass review. Not a substitute for a professional audit.
        </footer>
      </body>
    </html>
  );
}
