import { createHash } from "node:crypto";
import sharp from "sharp";
import OpenAI from "openai";
import { env } from "./env";
import { extractionOfferSchema, extractionSchema } from "./validation";
import type Tesseract from "tesseract.js";

export type ExtractedProduct = import("zod").infer<typeof extractionOfferSchema>;

export function hashBuffer(buffer: Buffer) { return createHash("sha256").update(buffer).digest("hex"); }

type OcrPrice = { raw: string; value: number; index: number };

function findOcrPrices(text: string): OcrPrice[] {
  const prices: OcrPrice[] = [];
  const seen = new Set<string>();
  const add = (raw: string, index: number, integer: string, cents: string) => {
    const value = Number(`${integer.replace(/\./g, "")}.${cents}`);
    if (!Number.isFinite(value)) return;
    const key = `${index}:${value.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    prices.push({ raw, value, index });
  };

  // Normal OCR output: R$ 39,99 or 39,99.
  for (const match of text.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*),(\d{2})/g)) {
    add(match[0], match.index ?? 0, match[1], match[2]);
  }
  // Tesseract sometimes separates the cents with a space: R$ 39 99.
  for (const match of text.matchAll(/R\$\s*(\d{1,3})\s+(\d{2})(?!\d)/gi)) {
    add(match[0], match.index ?? 0, match[1], match[2]);
  }
  return prices.sort((a, b) => a.index - b.index);
}

export function findPricesInText(text: string) {
  return findOcrPrices(text).map(({ raw, value }) => ({ raw, value }));
}

function cleanOcrName(value: string) {
  value = value
    .replace(/\uFFFD/g, " ")
    .replace(/\bCOX\s*O\b/gi, "COXÃO")
    .replace(/\bPERNIL\s+SU\s*NO\b/gi, "PERNIL SUÍNO");
  return value
    .replace(/^[^A-Za-zÀ-ÿ]+/g, "")
    .replace(/[|¦]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[•:–—-]+$/g, "")
    .trim();
}

function isUsefulProductName(value: string) {
  const letters = (value.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const words = value.split(/\s+/).filter((word) => /[A-Za-zÀ-ÿ]{2,}/.test(word));
  const noisy = /^(r\$|kg|g|ml|l|un|ofertas?|válidas?|superpoupe|cortes? especiais?)$/i;
  return letters >= 4 && words.length >= 2 && !words.every((word) => noisy.test(word));
}

function dedupeProducts(products: ExtractedProduct[]) {
  const result: ExtractedProduct[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const name = cleanOcrName(product.nome);
    if (!isUsefulProductName(name)) continue;
    const key = `${name.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")}|${product.preco.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...product, nome: name });
  }
  return result;
}

export function extractOcrCandidates(text: string): ExtractedProduct[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const candidates: ExtractedProduct[] = [];
  for (const match of findOcrPrices(text)) {
    const before = text.slice(0, match.index);
    const beforeLines = before.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const sameLine = cleanOcrName(beforeLines.at(-1) ?? "");
    let name = isUsefulProductName(sameLine) ? sameLine : "";
    if (!name) {
      const nearby = beforeLines.slice(-12).reverse().map(cleanOcrName).filter(isUsefulProductName);
      name = nearby[0] ?? "";
      // Qualifiers such as “SEM OSSO” belong to the previous product label.
      if (name.split(/\s+/).length <= 3 && nearby[1] && /\b(sem|com|extra|fatia|pedaço|kg|unidade)\b/i.test(name)) {
        name = `${nearby[1]} ${name}`;
      }
    }
    if (!isUsefulProductName(name)) continue;
    const presentation = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un|und|cx|pct|pacote|fardo)\b/i);
    candidates.push({ nome: name, marca: null, quantidade: presentation ? Number(presentation[1].replace(",", ".")) : null, unidade: presentation?.[2]?.toLowerCase() ?? null, preco: match.value, preco_anterior: null, condicoes: null, confianca: match.raw.includes(",") || /\s\d{2}$/.test(match.raw) ? 0.62 : 0.55 });
  }
  return dedupeProducts(candidates);
}

export type OcrLayoutItem = { text: string; box?: number[][] };

function layoutBounds(item: OcrLayoutItem) {
  const points = item.box ?? [];
  if (!points.length) return null;
  const xs = points.map((point) => point[0] ?? 0);
  const ys = points.map((point) => point[1] ?? 0);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), centerX: (Math.min(...xs) + Math.max(...xs)) / 2 };
}

/** Associates detected prices to the nearest product column in a flyer. */
export function extractOcrCandidatesFromLayout(items: OcrLayoutItem[]): ExtractedProduct[] {
  const withBounds = items.map((item) => ({ ...item, bounds: layoutBounds(item) })).filter((item): item is OcrLayoutItem & { bounds: NonNullable<ReturnType<typeof layoutBounds>> } => Boolean(item.bounds));
  const priceItems = withBounds.map((item) => {
    const match = item.text.match(/(\d{1,3}(?:[.]\d{3})?)[,.](\d{2})/);
    if (!match) return null;
    const value = Number(`${match[1].replace(".", "")}.${match[2]}`);
    return Number.isFinite(value) ? { item, value } : null;
  }).filter((item): item is { item: typeof withBounds[number]; value: number } => Boolean(item));
  const ignored = /^(r?\$|kg|g|ml|l|un|und|ofertas?|válidas?|imagens?|supermercado|carne|superpoupe|cortes?\s*especiais?)$/i;
  const rawProducts = withBounds.filter((item) => {
    const normalized = item.text.replace(/\uFFFD/g, " ").replace(/\s+/g, " ").trim();
    const words = normalized.split(/\s+/).filter((word) => /[A-Za-zÀ-ÿ]{2,}/.test(word));
    return !normalized.match(/\d{1,3}[,.]\d{2}/) && words.length >= 2 && !ignored.test(normalized);
  });
  const qualifier = rawProducts.find((item) => /sem\s+osso/i.test(item.text));
  const products = rawProducts.filter((item) => !/sem\s+osso/i.test(item.text)).map((item) => {
    if (qualifier && Math.abs(item.bounds.centerX - qualifier.bounds.centerX) < 90 && item.bounds.bottom <= qualifier.bounds.top + 20) {
      return { ...item, text: `${item.text} SEM OSSO`, bounds: { ...item.bounds, bottom: qualifier.bounds.bottom } };
    }
    return item;
  });
  const result = [...priceItems].sort((a, b) => a.item.bounds.top - b.item.bounds.top || a.item.bounds.centerX - b.item.bounds.centerX).map(({ item, value }) => {
    const product = products.filter((candidate) => candidate.bounds.bottom <= item.bounds.top + 10).sort((a, b) => {
      const score = (candidate: typeof a) => Math.abs(candidate.bounds.centerX - item.bounds.centerX) + Math.max(0, item.bounds.top - candidate.bounds.bottom) * 0.08;
      return score(a) - score(b);
    })[0];
    if (!product) return null;
    const unit = withBounds.find((candidate) => /^(kg|g|ml|l|un|und)$/i.test(candidate.text.trim()) && Math.abs(candidate.bounds.centerX - item.bounds.centerX) < 100 && candidate.bounds.top >= item.bounds.top)?.text.toLowerCase() ?? null;
    return { nome: cleanOcrName(product.text), marca: null, quantidade: null, unidade: unit, preco: value, preco_anterior: null, condicoes: null, confianca: 0.9 };
  }).filter(Boolean) as ExtractedProduct[];
  return dedupeProducts(result);
}

export async function preprocessImage(input: Buffer) {
  return sharp(input).rotate().resize({ width: 1800, withoutEnlargement: false, fit: "inside" }).grayscale().normalize().sharpen().png({ compressionLevel: 6 }).toBuffer();
}

let ocrWorkerPromise: Promise<Tesseract.Worker> | null = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import("tesseract.js").then(async ({ createWorker }) => {
      const worker = await createWorker(env.ocrLanguage, undefined, {
      });
      await worker.setParameters({ tessedit_pageseg_mode: "6" as Tesseract.PSM, preserve_interword_spaces: "1" });
      return worker;
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

export async function runOcr(input: Buffer) {
  const worker = await getOcrWorker();
  await worker.setParameters({ tessedit_pageseg_mode: "6" as Tesseract.PSM, preserve_interword_spaces: "1" });
  const result = await worker.recognize(input);
  return result.data.text;
}

export async function runOcrVariants(input: Buffer) {
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 1800;
  const height = metadata.height ?? 1800;
  const targetWidth = Math.min(Math.max(1400, width), 2200);
  const base = sharp(input).rotate().resize({ width: targetWidth, withoutEnlargement: false, fit: "inside" });
  const variants = [
    { image: await base.clone().sharpen().png().toBuffer(), psm: "11" as Tesseract.PSM },
    { image: await base.clone().grayscale().normalize().sharpen().png().toBuffer(), psm: "11" as Tesseract.PSM },
    { image: await sharp(input).rotate().extract({ left: 0, top: Math.floor(height * 0.25), width, height: Math.max(1, Math.floor(height * 0.7)) }).resize({ width: targetWidth, withoutEnlargement: false, fit: "inside" }).png().toBuffer(), psm: "6" as Tesseract.PSM },
  ];
  const worker = await getOcrWorker();
  const texts: string[] = [];
  for (const variant of variants) {
    await worker.setParameters({ tessedit_pageseg_mode: variant.psm, preserve_interword_spaces: "1" });
    const result = await worker.recognize(variant.image);
    texts.push(result.data.text);
  }
  return texts;
}

export async function extractWithVision(image: Buffer, ocrText: string) {
  if (!env.openAiKey) return { status: "needs_review" as const, reason: "OPENAI_API_KEY não configurada.", products: [] };
  const client = new OpenAI({ apiKey: env.openAiKey });
  const response = await client.responses.create({
    model: env.openAiModel,
    input: [{ role: "user", content: [
      { type: "input_text", text: `Você é um extrator de ofertas de encartes. Nunca invente dados. Use null quando estiver ausente. Retorne somente JSON com data_publicacao e produtos. Cada produto precisa de nome, marca, quantidade, unidade, preco, preco_anterior, condicoes e confianca (0 a 1). Texto OCR disponível:\n${ocrText}` },
      { type: "input_image", image_url: `data:image/png;base64,${image.toString("base64")}`, detail: "high" },
    ] }],
    text: { format: { type: "json_object" } },
  });
  const parsed = extractionSchema.safeParse(JSON.parse(response.output_text));
  if (!parsed.success) return { status: "needs_review" as const, reason: "Resposta da IA fora do schema.", products: [] };
  return { status: "completed" as const, products: parsed.data.produtos, date: parsed.data.data_publicacao ?? null };
}

