import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getUpload, updateUpload, replaceOffersForUpload } from "@/lib/store";
import { extractOcrCandidates, extractOcrCandidatesFromLayout, findPricesInText, preprocessImage, runOcrVariants } from "@/lib/extraction";
import { runPaddleOcr } from "@/lib/paddle-ocr";
import { env } from "@/lib/env";
import { getDataSupabase } from "@/lib/supabase-server";
import { enqueueOcr } from "@/lib/ocr-queue";
import type { Offer } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function processUpload(uploadId: string) {
  const upload = await getUpload(uploadId);
  if (!upload) throw new Error("Upload não encontrado.");

  const updateProgress = (progress: number, progressMessage: string) => updateUpload(uploadId, { status: "processing", progress, progress_message: progressMessage });
  await updateUpload(uploadId, { status: "processing", progress: 5, progress_message: "Preparando o encarte…", started_at: new Date().toISOString(), error: null });
  try {
    const supabase = await getDataSupabase();
    let original: Buffer;
    await updateProgress(10, "Lendo o arquivo original…");
    if (supabase) {
      const downloaded = await supabase.storage.from(env.storageBucket).download(upload.storage_path);
      if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message ?? "Não foi possível baixar a imagem do Storage.");
      original = Buffer.from(await downloaded.data.arrayBuffer());
    } else {
      const filePath = path.join(process.cwd(), "data", "uploads", `${uploadId}-${String(upload.original_name).replace(/[^a-zA-Z0-9._-]/g, "-")}`);
      original = await readFile(filePath);
    }

    await updateProgress(20, "Preparando a imagem para leitura…");
    const prepared = await preprocessImage(original);
    await updateProgress(30, "Imagem preparada. Iniciando OCR…");
    let ocrText = "";
    let fallbackProducts: ReturnType<typeof extractOcrCandidates> = [];
    if (!ocrText && (env.paddleOcrEnabled || env.paddleOcrUrl)) {
      await updateProgress(55, "Lendo textos e preços com PaddleOCR gratuito…");
      const paddle = await runPaddleOcr(original, String(upload.original_name), upload.mime_type);
      if (paddle?.text) {
        ocrText = paddle.text;
        fallbackProducts = paddle.products?.length ? paddle.products.map((product) => ({ nome: product.nome, marca: product.marca ?? null, quantidade: product.quantidade ?? null, unidade: product.unidade ?? null, preco: product.preco, preco_anterior: product.preco_anterior ?? null, condicoes: product.condicoes ?? null, confianca: product.confianca })) : paddle.items?.length ? extractOcrCandidatesFromLayout(paddle.items) : extractOcrCandidates(paddle.text);
      }
    }
    if (!ocrText && env.ocrLocalFallback) {
      await updateProgress(68, "Refinando a leitura da imagem…");
      const ocrPasses = await runOcrVariants(original);
      ocrText = ocrPasses.join("\n\n--- PASSAGEM OCR ---\n\n");
      fallbackProducts = ocrPasses.flatMap((pass) => extractOcrCandidates(pass)).filter((product, index, products) => products.findIndex((candidate) => candidate.nome.toLocaleLowerCase("pt-BR") === product.nome.toLocaleLowerCase("pt-BR") && candidate.preco === product.preco) === index);
    }
    if (!ocrText) throw new Error("Nenhum provedor de OCR está configurado ou disponível.");
    await updateProgress(78, "Relacionando produtos e preços…");
    const detectedPrices = findPricesInText(ocrText);
    const extraction: { status: "completed" | "needs_review"; products: typeof fallbackProducts; date?: string | null } = { status: "needs_review", products: fallbackProducts, date: null };

    await updateProgress(90, "Organizando os produtos encontrados…");
    const readAt = new Date().toISOString();
    const offers: Offer[] = extraction.products.map((product, index) => ({
      id: `${uploadId}-${index}`,
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
      confidence_score: product.confianca,
      review_status: "needs_review",
      source_url: upload.source_url ?? null,
      published_at: extraction.date,
      category: null,
      promotion_conditions: product.condicoes ?? null,
      raw_ocr_text: ocrText,
      extracted_at: readAt,
    }));

    await updateProgress(96, "Salvando produtos no relatório…");
    await replaceOffersForUpload(uploadId, offers);
    await updateUpload(uploadId, {
      status: extraction.status,
      progress: 100,
      progress_message: `Leitura concluída. ${offers.length} produto(s) enviado(s) para Relatórios.`,
      completed_at: new Date().toISOString(),
      offers: offers.length,
      raw_ocr_text: ocrText,
      error: null,
    });
    return { status: extraction.status, offers, detected_prices: detectedPrices };
  } catch (error) {
    await updateUpload(uploadId, { status: "failed", progress_message: "A leitura não pôde ser concluída.", error: error instanceof Error ? error.message : "Falha desconhecida" });
    throw error;
  }
}

export async function POST(request: Request) {
  const body = await request.json() as { upload_id?: string };
  if (!body.upload_id) return NextResponse.json({ error: "upload_id é obrigatório." }, { status: 400 });
  const upload = await getUpload(body.upload_id);
  if (!upload) return NextResponse.json({ error: "Upload não encontrado." }, { status: 404 });
  if (upload.status === "queued") return NextResponse.json({ status: upload.status, upload_id: body.upload_id }, { status: 202 });
  if (upload.status === "processing") {
    const startedAt = upload.started_at ? Date.parse(upload.started_at) : 0;
    const stale = !startedAt || Date.now() - startedAt > 5 * 60 * 1000;
    if (!stale) return NextResponse.json({ status: upload.status, upload_id: body.upload_id }, { status: 202 });
    await updateUpload(body.upload_id, { status: "uploaded", started_at: null, completed_at: null, error: "Processamento anterior expirou; reprocessando." });
  }

  await updateUpload(body.upload_id, { status: "queued", error: null });
  try {
    const result = await enqueueOcr(() => processUpload(body.upload_id!));
    return NextResponse.json({ status: result.status, upload_id: body.upload_id, offers: result.offers.length, detected_prices: result.detected_prices.length }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ status: "failed", upload_id: body.upload_id, error: error instanceof Error ? error.message : "Falha ao processar o encarte." }, { status: 500 });
  }
}

