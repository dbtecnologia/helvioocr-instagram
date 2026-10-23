import type Tesseract from "tesseract.js";

export type BrowserOcrItem = {
  text: string;
  box: [[number, number], [number, number], [number, number], [number, number]];
  confidence: number;
};

export type BrowserOcrResult = {
  text: string;
  confidence: number;
  items: BrowserOcrItem[];
};

type ProgressCallback = (progress: number, message: string) => void;

let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(onProgress: ProgressCallback) {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("por", undefined, {
      logger: (event) => {
        if (event.status === "recognizing text") onProgress(Math.round(event.progress * 65), "Reconhecendo textos e preços no seu navegador…");
      },
    })).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  const worker = await workerPromise;
  await worker.setParameters({ tessedit_pageseg_mode: "11" as Tesseract.PSM, preserve_interword_spaces: "1" });
  return worker;
}

async function sourceToBlob(source: Blob | string) {
  if (typeof source !== "string") return source;
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar a imagem para o OCR.");
  return response.blob();
}

async function loadBitmap(source: Blob | string) {
  const blob = await sourceToBlob(source);
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(bitmap: ImageBitmap | HTMLImageElement, grayscale: boolean) {
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const scale = Math.min(1.35, Math.max(1, 2200 / Math.max(sourceWidth, sourceHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (grayscale) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const luminance = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
      const contrasted = Math.max(0, Math.min(255, Math.round((luminance - 128) * 1.35 + 128)));
      image.data[index] = contrasted;
      image.data[index + 1] = contrasted;
      image.data[index + 2] = contrasted;
    }
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

function readLayout(data: Tesseract.Page): BrowserOcrItem[] {
  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
  return lines.map((line) => ({
    text: line.text.replace(/\s+/g, " ").trim(),
    box: [[line.bbox.x0, line.bbox.y0], [line.bbox.x1, line.bbox.y0], [line.bbox.x1, line.bbox.y1], [line.bbox.x0, line.bbox.y1]] as [[number, number], [number, number], [number, number], [number, number]],
    confidence: Math.max(0, Math.min(1, (line.confidence ?? data.confidence ?? 0) / 100)),
  })).filter((item) => item.text.length > 0);
}

async function recognizeCanvas(worker: Tesseract.Worker, canvas: HTMLCanvasElement, onProgress: ProgressCallback) {
  const result = await worker.recognize(canvas);
  onProgress(72, "Organizando os produtos e preços encontrados…");
  return {
    text: result.data.text.trim(),
    confidence: Math.max(0, Math.min(1, (result.data.confidence ?? 0) / 100)),
    items: readLayout(result.data),
  } satisfies BrowserOcrResult;
}

/** OCR gratuito no navegador: a imagem e o texto não passam por uma API paga. */
export async function runBrowserOcr(source: Blob | string, onProgress: ProgressCallback = () => undefined): Promise<BrowserOcrResult> {
  onProgress(5, "Carregando a imagem…");
  const bitmap = await loadBitmap(source);
  try {
    const worker = await getWorker(onProgress);
    onProgress(15, "Preparando a imagem para leitura…");
    const first = await recognizeCanvas(worker, makeCanvas(bitmap, false), onProgress);
    const hasPrice = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*[,\s]\d{2}\b/.test(first.text);
    if (first.items.length && hasPrice) return first;
    onProgress(78, "Ajustando contraste para tentar uma leitura melhor…");
    const second = await recognizeCanvas(worker, makeCanvas(bitmap, true), onProgress);
    return second.items.length > first.items.length || second.text.length > first.text.length ? second : first;
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}
