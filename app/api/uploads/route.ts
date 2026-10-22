import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addUpload, listUploads } from "@/lib/store";
import { env } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase-server";
import { hashBuffer, preprocessImage } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "application/pdf", "application/zip"]);

export async function POST(request: Request) {
  const form = await request.formData(); const supermarketId = String(form.get("supermarket_id") ?? "") || null; const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (!files.length) return NextResponse.json({ error: "Selecione pelo menos um arquivo." }, { status: 400 });
  if (files.some((file) => !allowed.has(file.type))) return NextResponse.json({ error: "Formato não permitido. Use JPG, PNG, WebP, SVG, PDF ou ZIP." }, { status: 415 });
  if (files.some((file) => file.size > 25 * 1024 * 1024)) return NextResponse.json({ error: "Cada arquivo precisa ter no máximo 25 MB." }, { status: 413 });
  const supabase = getAdminSupabase(); const saved = [];
  for (const file of files) {
    const id = randomUUID(); const buffer = Buffer.from(await file.arrayBuffer()); const hash = hashBuffer(buffer); const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-"); const storagePath = `${new Date().toISOString().slice(0, 10)}/${id}-${safeName}`;
    const existing = (await listUploads()).find((upload) => upload.content_hash === hash);
    if (existing) { saved.push(existing); continue; }
    if (supabase) { const { error } = await supabase.storage.from(env.storageBucket).upload(storagePath, buffer, { contentType: file.type, upsert: false }); if (error) return NextResponse.json({ error: `Falha no Storage: ${error.message}` }, { status: 502 }); }
    else { const uploadDir = path.join(process.cwd(), "data", "uploads"); await mkdir(uploadDir, { recursive: true }); await writeFile(path.join(uploadDir, `${id}-${safeName}`), buffer); }
    let processedPath = null;
    if (file.type.startsWith("image/")) { try { const processed = await preprocessImage(buffer); processedPath = `${storagePath}.png`; if (supabase) await supabase.storage.from(env.storageBucket).upload(processedPath, processed, { contentType: "image/png", upsert: false }); else await writeFile(path.join(process.cwd(), "data", "uploads", `${id}-${safeName}.png`), processed); } catch { processedPath = null; } }
    const record = { id, original_name: file.name, mime_type: file.type, size: file.size, content_hash: hash, storage_path: storagePath, processed_path: processedPath, supermarket_id: supermarketId, status: "uploaded", progress: 0, progress_message: "Aguardando processamento", created_at: new Date().toISOString() };
    if (supabase) { const { error } = await supabase.from("flyer_images").insert({ id, storage_path: storagePath, image_hash: hash, processing_status: "uploaded", metadata: { original_name: file.name, mime_type: file.type, size: file.size, processed_path: processedPath, supermarket_id: supermarketId, progress: 0, progress_message: "Aguardando processamento" } }); if (error) return NextResponse.json({ error: `Falha ao registrar imagem: ${error.message}` }, { status: 502 }); } else await addUpload(record);
    saved.push(record);
  }
  return NextResponse.json({ count: saved.length, files: saved }, { status: 201 });
}

export async function GET() { try { return NextResponse.json(await listUploads()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os uploads." }, { status: 500 }); } }
