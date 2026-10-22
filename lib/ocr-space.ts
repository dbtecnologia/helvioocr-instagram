import { env } from "./env";
import { extractOcrCandidates, findPricesInText, type ExtractedProduct } from "./extraction";

type OcrSpaceWord = { WordText?: string; Left?: number; Top?: number; Width?: number; Height?: number };
type OcrSpaceLine = { LineText?: string; Words?: OcrSpaceWord[]; MaxHeight?: number; MinTop?: number };
export type OcrSpaceParsedResult = { ParsedText?: string; TextOverlay?: { HasOverlay?: boolean; Lines?: OcrSpaceLine[] }; FileParseExitCode?: number; ErrorMessage?: string; ErrorDetails?: string };
type OcrSpaceResponse = { ParsedResults?: OcrSpaceParsedResult[]; OCRExitCode?: number; IsErroredOnProcessing?: boolean; ErrorMessage?: string; ErrorDetails?: string; ProcessingTimeInMilliseconds?: string };

export class OcrSpaceError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

export type OcrSpaceDocument = { text: string; parsedResults: OcrSpaceParsedResult[]; products: ExtractedProduct[]; prices: Array<{ raw: string; value: number }> };

function fileType(mimeType: string, filename: string) {
  if (mimeType === "image/jpeg" || /\.jpe?g$/i.test(filename)) return "JPG";
  if (mimeType === "image/png" || /\.png$/i.test(filename)) return "PNG";
  return undefined;
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[^A-Za-zÀ-ÿ]+/, "").trim();
}

function isLabel(value: string) {
  const words = value.split(/\s+/).filter((word) => /[A-Za-zÀ-ÿ]{2,}/.test(word));
  return words.length >= 2 && !/^(ofertas?|válidas?|superpoupe|cortes? especiais?|imagens ilustrativas?)$/i.test(value);
}

function parsePrice(value: string) {
  const match = value.replace(/\s+/g, " ").match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*),(\d{2})/i);
  if (!match) return null;
  const price = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
  return Number.isFinite(price) ? { raw: match[0], value: price } : null;
}

export function extractProductsFromOcrSpace(parsedResults: OcrSpaceParsedResult[]) {
  const lines = parsedResults.flatMap((result) => result.TextOverlay?.Lines ?? []);
  const labels = lines.map((line) => {
    const words = line.Words ?? [];
    const text = cleanLabel(line.LineText ?? words.map((word) => word.WordText ?? "").join(" "));
    const left = Math.min(...words.map((word) => Number(word.Left ?? 0)), 0);
    const top = Math.min(...words.map((word) => Number(word.Top ?? 0)), 0);
    const right = Math.max(...words.map((word) => Number(word.Left ?? 0) + Number(word.Width ?? 0)), 0);
    const bottom = Math.max(...words.map((word) => Number(word.Top ?? 0) + Number(word.Height ?? 0)), 0);
    return { text, left, top, right, bottom };
  }).filter((line) => isLabel(line.text));

  const prices: Array<{ value: number; raw: string; left: number; top: number; right: number; bottom: number }> = [];
  for (const line of lines) {
    const words = line.Words ?? [];
    const lineText = words.map((word) => word.WordText ?? "").join(" ");
    const direct = parsePrice(line.LineText ?? lineText);
    if (direct) {
      const left = Math.min(...words.map((word) => Number(word.Left ?? 0)), 0);
      const top = Math.min(...words.map((word) => Number(word.Top ?? 0)), 0);
      const right = Math.max(...words.map((word) => Number(word.Left ?? 0) + Number(word.Width ?? 0)), 0);
      const bottom = Math.max(...words.map((word) => Number(word.Top ?? 0) + Number(word.Height ?? 0)), 0);
      prices.push({ ...direct, left, top, right, bottom });
      continue;
    }
    for (let index = 0; index < words.length - 2; index += 1) {
      const chunk = words.slice(index, index + 3).map((word) => word.WordText ?? "").join(" ");
      const parsed = parsePrice(chunk);
      if (!parsed) continue;
      const selected = words.slice(index, index + 3);
      prices.push({ ...parsed, left: Math.min(...selected.map((word) => Number(word.Left ?? 0))), top: Math.min(...selected.map((word) => Number(word.Top ?? 0))), right: Math.max(...selected.map((word) => Number(word.Left ?? 0) + Number(word.Width ?? 0))), bottom: Math.max(...selected.map((word) => Number(word.Top ?? 0) + Number(word.Height ?? 0))) });
      break;
    }
  }

  const candidates: ExtractedProduct[] = [];
  for (const price of prices) {
    const center = (price.left + price.right) / 2;
    const label = labels.filter((item) => item.bottom <= price.top + 40).sort((a, b) => {
      const aDistance = Math.abs(center - (a.left + a.right) / 2) + Math.max(0, price.top - a.bottom) * 0.03;
      const bDistance = Math.abs(center - (b.left + b.right) / 2) + Math.max(0, price.top - b.bottom) * 0.03;
      return aDistance - bDistance;
    })[0];
    if (!label) continue;
    const name = cleanLabel(label.text);
    candidates.push({ nome: name, marca: null, quantidade: null, unidade: null, preco: price.value, preco_anterior: null, condicoes: null, confianca: 0.78 });
  }
  const unique = new Map<string, ExtractedProduct>();
  for (const product of candidates) unique.set(`${product.nome.toLowerCase()}|${product.preco.toFixed(2)}`, product);
  return [...unique.values()];
}

export async function parseImageWithOcrSpace(input: Buffer, filename: string, mimeType: string): Promise<OcrSpaceDocument> {
  if (!env.ocrSpaceKey) throw new OcrSpaceError("OCR_SPACE_API_KEY não configurada no servidor.", 503);
  const form = new FormData();
  form.append("language", "auto");
  form.append("OCREngine", "2");
  form.append("isOverlayRequired", "true");
  form.append("scale", "true");
  const type = fileType(mimeType, filename);
  if (type) form.append("filetype", type);
  form.append("file", new Blob([new Uint8Array(input)], { type: mimeType || "image/png" }), filename);
  let response: Response;
  try {
    response = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: env.ocrSpaceKey }, body: form, signal: AbortSignal.timeout(env.ocrSpaceTimeoutMs), cache: "no-store" });
  } catch (error) {
    console.error("[ocr-space] request failed", error);
    throw new OcrSpaceError("O OCR.space demorou além do limite. Tente novamente com uma imagem menor.", 504);
  }
  const payload = await response.json().catch(() => null) as OcrSpaceResponse | null;
  if (!response.ok || !payload) throw new OcrSpaceError(`OCR.space retornou HTTP ${response.status}.`, response.status === 429 ? 429 : 502);
  if (payload.IsErroredOnProcessing || Number(payload.OCRExitCode) !== 1) throw new OcrSpaceError(payload.ErrorMessage || payload.ErrorDetails || "A imagem não pôde ser lida pelo OCR.space.", 422);
  const parsedResults = payload.ParsedResults ?? [];
  const text = parsedResults.map((result) => result.ParsedText ?? "").filter(Boolean).join("\n");
  const products = extractProductsFromOcrSpace(parsedResults);
  return { text, parsedResults, products: products.length ? products : extractOcrCandidates(text), prices: findPricesInText(text) };
}
