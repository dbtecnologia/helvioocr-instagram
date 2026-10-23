import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { deleteUpload, getUpload } from "@/lib/store";
import { env } from "@/lib/env";
import { getDataSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const upload = await getUpload(id);
  if (!upload) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  try {
    const supabase = await getDataSupabase();
    if (supabase) {
      const downloaded = await supabase.storage.from(env.storageBucket).download(upload.storage_path);
      if (downloaded.error || !downloaded.data) return NextResponse.json({ error: "A imagem não está disponível no Storage." }, { status: 404 });
      return new NextResponse(await downloaded.data.arrayBuffer(), { headers: { "Content-Type": String(upload.mime_type), "Cache-Control": "private, max-age=3600" } });
    }
    const filename = `${id}-${String(upload.original_name).replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const buffer = await readFile(path.join(process.cwd(), "data", "uploads", filename));
    return new NextResponse(buffer, { headers: { "Content-Type": String(upload.mime_type), "Cache-Control": "private, max-age=3600" } });
  } catch { return NextResponse.json({ error: "A prévia não está disponível." }, { status: 404 }); }
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
