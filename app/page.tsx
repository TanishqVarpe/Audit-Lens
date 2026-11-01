import fs from "node:fs/promises";
import path from "node:path";
import { HomeClient, type BenchTotals } from "@/components/HomeClient";

export const dynamic = "force-dynamic";

/** Real benchmark numbers for the hero, only if `npm run benchmark` has produced them. */
async function benchTotals(): Promise<BenchTotals | null> {
  try {
    const r = JSON.parse(await fs.readFile(path.join(process.cwd(), "benchmark", "results.json"), "utf8"));
    return r.totals ?? null;
  } catch {
    return null;
  }
}

export default async function Home() {
  return <HomeClient bench={await benchTotals()} />;
}
