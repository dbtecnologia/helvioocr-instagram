import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createUploadFromBuffer } from "@/lib/store";
import { getPublication } from "@/lib/store";
import { hashBuffer } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 120;

const allowedHosts = ["cdninstagram.com", "instagram.com", "fbcdn.net", "fbsbx.com", "facebook.com"];

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
  const indexes = body.image_indexes?.length ? body.image_indexes : publication.media_urls.map((_, index) => index);
  const urls = indexes.map((index) => publication.media_urls[index]).filter((url): url is string => Boolean(url) && isAllowedMediaUrl(url)).slice(0, 8);
  if (!urls.length) return NextResponse.json({ error: "A publicação não possui imagens públicas disponíveis para extração." }, { status: 400 });

  const uploads: string[] = [];
  for (const [index, imageUrl] of urls.entries()) {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000), cache: "no-store" });
    if (!response.ok) continue;
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!contentType.startsWith("image/")) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 25 * 1024 * 1024) continue;
    const id = randomUUID();
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    await createUploadFromBuffer({ id, original_name: `instagram-${publication.id}-${index}.${extension}`, mime_type: contentType, size: buffer.length, content_hash: hashBuffer(buffer), storage_path: `instagram/${id}.${extension}`, supermarket_id: publication.supermarket_id, publication_id: publication.id, source_url: publication.source_url, buffer });
    uploads.push(id);
  }
  if (!uploads.length) return NextResponse.json({ error: "Não foi possível baixar as imagens desta publicação." }, { status: 502 });
  await Promise.all(uploads.map((uploadId) => fetch(new URL("/api/process", request.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: uploadId }) })));
  return NextResponse.json({ status: "queued", publication_id: publication.id, uploads }, { status: 202 });
}
