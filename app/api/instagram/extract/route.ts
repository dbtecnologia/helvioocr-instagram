import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createUploadFromBuffer } from "@/lib/store";
import { getPublication } from "@/lib/store";
import { hashBuffer } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 120;

const allowedHosts = ["cdninstagram.com", "instagram.com", "fbcdn.net", "fbsbx.com", "facebook.com"];
const maxImagesPerSelection = 3;

function isAllowedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export async function POST(request: Request) {
  const body = await request.json() as { publication_id?: string; image_indexes?: number[] };
  if (!body.publication_id) return NextResponse.json({ error: "publication_id é obrigatório." }, { status: 400 });
  const publication = await getPublication(body.publication_id);
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
  await Promise.all(uploads.map((uploadId) => fetch(new URL("/api/process", request.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: uploadId }) })));
  return NextResponse.json({ status: "queued", publication_id: publication.id, uploads }, { status: 202 });
}

