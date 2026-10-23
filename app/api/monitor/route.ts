import { NextResponse } from "next/server";
import { ApifyError, collectInstagramPublications } from "@/lib/apify";
import { env } from "@/lib/env";
import { listSupermarkets, updateSupermarket, upsertPublications } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return Boolean(env.cronSecret) && authorization === `Bearer ${env.cronSecret}`;
}

/**
 * Collects newly available posts for markets explicitly marked for monitoring.
 * The route intentionally does not send messages: an outbound channel and
 * recipient must be configured before any external notification is allowed.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const startedAt = Date.now();
  try {
    const markets = (await listSupermarkets()).filter((market) => market.active && market.market_type === "competitor" && market.monitoring_enabled);
    const results: Array<Record<string, unknown>> = [];
    for (const market of markets) {
      try {
        const result = await collectInstagramPublications(market.instagram_handle, market.id, 30);
        const publications = await upsertPublications(result.publications);
        await updateSupermarket(market.id, { instagram_handle: `@${result.handle}`, instagram_url: `https://instagram.com/${result.handle}`, last_collection_at: new Date().toISOString() });
        results.push({ supermarket_id: market.id, name: market.name, publications: publications.length, status: "completed" });
      } catch (error) {
        console.error("[monitor] market failed", { supermarketId: market.id, error: error instanceof Error ? error.message : String(error) });
        results.push({ supermarket_id: market.id, name: market.name, status: "failed", error: error instanceof ApifyError ? error.message : "Falha ao coletar este mercado." });
      }
    }
    return NextResponse.json({ ok: true, monitored: markets.length, results, elapsed_ms: Date.now() - startedAt, notifications: "not_configured" });
  } catch (error) {
    console.error("[monitor] failed", error);
    return NextResponse.json({ error: "Falha inesperada no monitoramento." }, { status: 500 });
  }
}
