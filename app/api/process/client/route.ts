import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { extractOcrCandidates, extractOcrCandidatesFromLayout } from "@/lib/extraction";
import { getUpload, replaceOffersForUpload, updateUpload } from "@/lib/store";
import type { Offer } from "@/lib/types";

export const runtime = "nodejs";

type ClientOcrItem = { text?: unknown; box?: unknown; confidence?: unknown };

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1000).flatMap((item: ClientOcrItem) => {
    if (typeof item.text !== "string" || !Array.isArray(item.box) || item.box.length !== 4) return [];
    const box = item.box.map((point) => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null);
    if (box.some((point) => !point || !point.every(Number.isFinite))) return [];
    return [{ text: item.text.slice(0, 500), box: box as number[][], confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : undefined }];
  });
}

export async function POST(request: Request) {
  const body = await request.json() as { upload_id?: unknown; text?: unknown; items?: unknown };
  const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
  const text = typeof body.text === "string" ? body.text.slice(0, 200_000).trim() : "";
  if (!uploadId || !text) return NextResponse.json({ error: "O resultado do OCR está vazio." }, { status: 422 });
  const upload = await getUpload(uploadId);
  if (!upload) return NextResponse.json({ error: "Upload não encontrado." }, { status: 404 });

  await updateUpload(uploadId, { status: "processing", progress: 82, progress_message: "Associando cada preço ao produto…", error: null });
  try {
    const items = normalizeItems(body.items);
    const products = items.length ? extractOcrCandidatesFromLayout(items) : [];
    const fallback = products.length ? products : extractOcrCandidates(text);
    const readAt = new Date().toISOString();
    const offers: Offer[] = fallback.map((product, index) => ({
      id: randomUUID(),
      upload_id: uploadId,
      publication_id: upload.publication_id ?? null,
      supermarket_id: String(upload.supermarket_id ?? ""),
      product_name: product.nome,
      brand: product.marca ?? null,
      quantity: product.quantidade ?? null,
      unit: product.unidade ?? null,
      price: product.preco,
      previous_price: product.preco_anterior ?? null,
      currency: "BRL",
      confidence_score: Math.max(0, Math.min(1, product.confianca)),
      review_status: "needs_review",
      source_url: upload.source_url ?? null,
      published_at: null,
      category: null,
      promotion_conditions: product.condicoes ?? ([product.marca, product.quantidade && product.unidade ? `${product.quantidade} ${product.unidade}` : null].filter(Boolean).join(" · ") || null),
      raw_ocr_text: text,
      extracted_at: readAt,
    }));
    await replaceOffersForUpload(uploadId, offers);
    await updateUpload(uploadId, {
      status: "needs_review",
      progress: 100,
      progress_message: offers.length ? `Leitura concluída. ${offers.length} produto(s) enviado(s) para Relatórios.` : "Leitura concluída, mas nenhum preço foi reconhecido. Revise a imagem.",
      completed_at: readAt,
      offers: offers.length,
      raw_ocr_text: text,
      error: null,
    });
    return NextResponse.json({ status: "needs_review", upload_id: uploadId, offers: offers.length, detected_prices: offers.map((offer) => offer.price) });
  } catch (error) {
    await updateUpload(uploadId, { status: "failed", progress_message: "A leitura não pôde ser salva.", error: error instanceof Error ? error.message : "Falha ao salvar o resultado do OCR." });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar o resultado do OCR." }, { status: 500 });
  }
}
