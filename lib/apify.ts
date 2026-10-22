import { createHash, randomUUID } from "node:crypto";
import { env } from "./env";
import type { Publication } from "./types";

const recentRuns = new Map<string, number>();

export class ApifyError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

export function normalizeInstagramHandle(value: string) {
  const handle = value.trim().replace(/^@/, "").replace(/\/$/, "");
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle) || handle.startsWith(".") || handle.endsWith(".")) {
    throw new ApifyError("Informe um @ válido do Instagram, sem espaços ou senha.", 400);
  }
  return handle.toLowerCase();
}

function isHttpUrl(value: unknown): value is string {
  try { const url = new URL(String(value)); return url.protocol === "https:"; } catch { return false; }
}

function mediaUrls(item: Record<string, unknown>) {
  const urls: string[] = [];
  const add = (value: unknown) => { if (isHttpUrl(value)) urls.push(value); };
  const addMedia = (value: unknown) => {
    if (typeof value === "string") add(value);
    else if (value && typeof value === "object") {
      const media = value as Record<string, unknown>;
      add(media.url); add(media.src); add(media.displayUrl); add(media.imageUrl); add(media.thumbnailUrl);
    }
  };
  add(item.displayUrl); add(item.imageUrl); add(item.thumbnailUrl);
  for (const image of Array.isArray(item.images) ? item.images : []) {
    addMedia(image);
  }
  for (const child of Array.isArray(item.childPosts) ? item.childPosts : []) {
    if (child && typeof child === "object") {
      const childRecord = child as Record<string, unknown>;
      add(childRecord.displayUrl); add(childRecord.imageUrl); add(childRecord.thumbnailUrl);
      for (const image of Array.isArray(childRecord.images) ? childRecord.images : []) addMedia(image);
    }
  }
  return [...new Set(urls)];
}

function hashPublication(externalId: string, sourceUrl: string) {
  return createHash("sha256").update(`${externalId}|${sourceUrl}`).digest("hex");
}

export function mapApifyItems(items: unknown[], supermarketId: string): Publication[] {
  const mapped: Publication[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const sourceUrl = typeof item.url === "string" ? item.url : typeof item.inputUrl === "string" ? item.inputUrl : null;
    const externalId = String(item.id ?? item.shortCode ?? sourceUrl ?? "");
    const images = mediaUrls(item);
    if (!sourceUrl || !externalId || !images.length) continue;
    mapped.push({
      id: randomUUID(),
      supermarket_id: supermarketId,
      external_id: externalId,
      source_url: sourceUrl,
      published_at: typeof item.timestamp === "string" ? item.timestamp : null,
      collected_at: new Date().toISOString(),
      caption: typeof item.caption === "string" ? item.caption : null,
      content_hash: hashPublication(externalId, sourceUrl),
      media_urls: images,
      media_type: typeof item.type === "string" ? item.type : null,
    });
  }
  const unique = new Map<string, Publication>();
  for (const item of mapped) {
    const existing = unique.get(item.content_hash);
    if (!existing || item.media_urls.length > existing.media_urls.length) unique.set(item.content_hash, item);
  }
  return [...unique.values()];
}

export async function collectInstagramPublications(handleInput: string, supermarketId: string, limitInput: number) {
  if (!env.apifyToken) throw new ApifyError("APIFY_TOKEN não configurado no servidor.", 503);
  const handle = normalizeInstagramHandle(handleInput);
  const requested = Number.isFinite(limitInput) ? limitInput : 10;
  const limit = Math.min(Math.max(Math.floor(requested || 10), 1), env.apifyMaxResults);
  const lastRun = recentRuns.get(handle) ?? 0;
  if (Date.now() - lastRun < 15000) throw new ApifyError("Aguarde alguns segundos antes de repetir esta coleta.", 429);
  recentRuns.set(handle, Date.now());

  const input = { directUrls: [`https://www.instagram.com/${handle}/`], resultsType: "posts", resultsLimit: limit, skipPinnedPosts: true };
  const url = new URL(`https://api.apify.com/v2/acts/${env.apifyActor}/run-sync-get-dataset-items`);
  url.searchParams.set("format", "json"); url.searchParams.set("clean", "true"); url.searchParams.set("limit", String(limit)); url.searchParams.set("timeout", String(env.apifyTimeoutMs));
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${env.apifyToken}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout((env.apifyTimeoutMs + 10) * 1000), cache: "no-store" });
  } catch (error) {
    console.error("[apify] request failed", { handle, error: error instanceof Error ? error.message : String(error) });
    throw new ApifyError("A coleta demorou além do limite. Tente novamente com menos publicações.", 504);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[apify] actor failed", { handle, status: response.status, detail: detail.slice(0, 500) });
    if (response.status === 401 || response.status === 403) throw new ApifyError("Token da Apify inválido ou sem permissão para executar o Actor.", 502);
    if (response.status === 408) throw new ApifyError("A Apify atingiu o limite de tempo da coleta.", 504);
    throw new ApifyError("A Apify não conseguiu coletar esse perfil. Ele pode não existir, estar privado ou temporariamente bloqueado.", 502);
  }
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new ApifyError("Resposta inesperada da Apify.", 502);
  return { handle, publications: mapApifyItems(payload, supermarketId), requested: limit };
}
