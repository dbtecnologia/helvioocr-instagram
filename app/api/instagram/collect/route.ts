import { NextResponse } from "next/server";
import { collectInstagramPublications, ApifyError } from "@/lib/apify";
import { listSupermarkets, updateSupermarket, upsertPublications } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { handle?: string; supermarket_id?: string; limit?: number };
    if (!body.handle || !body.supermarket_id) return NextResponse.json({ error: "Informe o @ e selecione um supermercado." }, { status: 400 });
    const supermarket = (await listSupermarkets()).find((item) => item.id === body.supermarket_id);
    if (!supermarket) return NextResponse.json({ error: "Supermercado não encontrado." }, { status: 404 });
    const result = await collectInstagramPublications(body.handle, body.supermarket_id, body.limit ?? 10);
    const publications = await upsertPublications(result.publications);
    await updateSupermarket(body.supermarket_id, { instagram_handle: `@${result.handle}`, instagram_url: `https://instagram.com/${result.handle}`, last_collection_at: new Date().toISOString() });
    return NextResponse.json({ handle: result.handle, requested: result.requested, count: publications.length, publications, warning: publications.length ? null : "Nenhuma imagem pública foi encontrada. O perfil pode não existir, estar privado ou não ter publicações recentes com imagem." });
  } catch (error) {
    if (error instanceof ApifyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[instagram] collection failed", error);
    return NextResponse.json({ error: "Falha inesperada na coleta do Instagram." }, { status: 500 });
  }
}
