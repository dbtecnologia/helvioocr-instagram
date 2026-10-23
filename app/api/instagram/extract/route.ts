import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createUploadFromBuffer, getUploadIdByHash, listPublications, getPublication } from "@/lib/store";
import { hashBuffer } from "@/lib/extraction";
import { processUpload } from "@/app/api/process/route";

export const runtime = "nodejs";
export const maxDuration = 300;

const allowedHosts = ["cdninstagram.com", "instagram.com", "fbcdn.net", "fbsbx.com", "facebook.com"];
const maxImagesPerSelection = 3;

function isAllowedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export async function POST(request: Request) {
  const body = await request.json() as { publication_id?: string; image_indexes?: number[]; source_url?: string | null; external_id?: string | null; supermarket_id?: string | null };
  if (!body.publication_id) return NextResponse.json({ error: "publication_id é obrigatório." }, { status: 400 });
  let publication = await getPublication(body.publication_id);
  if (!publication && (body.source_url || body.external_id)) {
    const candidates = await listPublications(body.supermarket_id ?? undefined);
    publication = candidates.find((candidate) => (body.source_url && candidate.source_url === body.source_url) || (body.external_id && candidate.external_id === body.external_id)) ?? null;
  }
  if (!publication) return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
  const requestedIndexes = body.image_indexes?.length ? body.image_indexes : publication.media_urls.map((_, index) => index);
  if (requestedIndexes.length > maxImagesPerSelection) return NextResponse.json({ error: `Selecione no máximo ${maxImagesPerSelection} fotos por análise.` }, { status: 400 });
  const indexes = requestedIndexes.slice(0, maxImagesPerSelection);
  const urls = indexes.map((index) => publication.media_urls[index]).filter((url): url is string => Boolean(url) && isAllowedMediaUrl(url)).slice(0, 8);
  if (!urls.length) return NextResponse.json({ error: "A publicação não possui imagens públicas disponíveis para extração." }, { status: 400 });

  const downloadedImages = (await Promise.all(urls.map(async (imageUrl, index) => {
    try {
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      if (!contentType.startsWith("image/")) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 25 * 1024 * 1024) return null;
      return { index, contentType, buffer };
    } catch (error) {
      console.warn("[instagram] image download failed", { publicationId: publication.id, index, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }))).filter((item) => item !== null);

  const seenHashes = new Set<string>();
  const uploads = (await Promise.all(downloadedImages.map(async ({ index, contentType, buffer }) => {
    const contentHash = hashBuffer(buffer);
    if (seenHashes.has(contentHash)) return null;
    seenHashes.add(contentHash);
    try {
      const existingId = await getUploadIdByHash(contentHash);
      if (existingId) return existingId;
      const id = randomUUID();
      const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      await createUploadFromBuffer({ id, original_name: `instagram-${publication.id}-${index}.${extension}`, mime_type: contentType, size: buffer.length, content_hash: contentHash, storage_path: `instagram/${id}.${extension}`, supermarket_id: publication.supermarket_id, publication_id: publication.id, source_url: publication.source_url, buffer });
      return id;
    } catch (error) {
      console.warn("[instagram] image upload failed", { publicationId: publication.id, index, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }))).filter((id) => id !== null);
  if (!uploads.length) return NextResponse.json({ error: "Não foi possível baixar as imagens desta publicação." }, { status: 502 });
  try {
    const results = await Promise.all(uploads.map((uploadId) => processUpload(uploadId)));
    return NextResponse.json({ status: "completed", publication_id: publication.id, uploads, results: results.map((result) => ({ status: result.status, offers: result.offers.length, detected_prices: result.detected_prices.length })) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "A leitura do encarte falhou.", publication_id: publication.id, uploads }, { status: 502 });
  }
}

