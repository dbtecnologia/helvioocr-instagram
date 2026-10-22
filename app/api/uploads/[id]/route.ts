import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { deleteUpload, getUpload } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const upload = await getUpload(id);
  if (!upload) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  try { const filename = `${id}-${String(upload.original_name).replace(/[^a-zA-Z0-9._-]/g, "-")}`; const buffer = await readFile(path.join(process.cwd(), "data", "uploads", filename)); return new NextResponse(buffer, { headers: { "Content-Type": String(upload.mime_type), "Cache-Control": "private, max-age=3600" } }); } catch { return NextResponse.json({ error: "A prévia local não está disponível." }, { status: 404 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteUpload(id);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o encarte." }, { status: 500 });
  }
}
