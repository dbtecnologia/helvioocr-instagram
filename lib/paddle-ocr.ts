import { spawn } from "node:child_process";
import { env } from "./env";

export type PaddleOcrItem = { text: string; box?: number[][]; confidence?: number };
export type PaddleOcrProduct = {
  nome: string;
  marca?: string | null;
  quantidade?: number | null;
  unidade?: string | null;
  preco: number;
  preco_anterior?: number | null;
  condicoes?: string | null;
  confianca: number;
  needs_review?: boolean;
};
export type PaddleOcrResult = { text: string; items: PaddleOcrItem[]; products?: PaddleOcrProduct[] };

function contentTypeFor(filename: string, mimeType?: string) {
  if (mimeType?.startsWith("image/")) return mimeType;
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.webp$/i.test(filename)) return "image/webp";
  return "image/jpeg";
}

function normalizeResult(value: unknown): PaddleOcrResult | null {
  if (!value || typeof value !== "object") return null;
  const body = value as { text?: unknown; items?: unknown; products?: unknown };
  const items = Array.isArray(body.items) ? body.items.filter((item): item is PaddleOcrItem => Boolean(item && typeof item === "object" && typeof (item as PaddleOcrItem).text === "string")) : [];
  const products = Array.isArray(body.products) ? body.products.filter((item): item is PaddleOcrProduct => Boolean(item && typeof item === "object" && typeof (item as PaddleOcrProduct).nome === "string" && typeof (item as PaddleOcrProduct).preco === "number")) : [];
  const text = typeof body.text === "string" ? body.text : items.map((item) => item.text).join("\n");
  return text.trim() ? { text, items, products } : null;
}

async function runPaddleHttp(input: Buffer, filename: string, mimeType?: string) {
  if (!env.paddleOcrUrl) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input)], { type: contentTypeFor(filename, mimeType) }), filename);
  const response = await fetch(`${env.paddleOcrUrl.replace(/\/$/, "")}/ocr`, {
    method: "POST",
    body: form,
    headers: env.paddleOcrToken ? { "x-paddleocr-token": env.paddleOcrToken } : undefined,
    signal: AbortSignal.timeout(env.paddleOcrTimeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`PaddleOCR respondeu ${response.status}.`);
  return normalizeResult(payload);
}

/** PaddleOCR adapter: HTTP FastAPI is preferred; local Python is available for development. */
export async function runPaddleOcr(input: Buffer, filename: string, mimeType?: string): Promise<PaddleOcrResult | null> {
  if (env.paddleOcrUrl) return runPaddleHttp(input, filename, mimeType);
  if (!env.paddleOcrEnabled) return null;

  const script = String.raw`
import json, os, sys, tempfile
os.environ['PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT'] = 'false'
try:
    from paddleocr import PaddleOCR
except Exception as error:
    print(f'PaddleOCR import failed: {error}', file=sys.stderr)
    sys.exit(3)

data = sys.stdin.buffer.read()
with tempfile.NamedTemporaryFile(suffix=os.path.splitext(sys.argv[1])[1] or '.png', delete=False) as handle:
    handle.write(data)
    path = handle.name
try:
    ocr = PaddleOCR(lang='pt', use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, enable_mkldnn=False)
    pages = list(ocr.predict(path))
    lines = []
    items = []
    for page in pages or []:
        try:
            texts = page['rec_texts']
            polys = page.get('rec_polys') or page.get('dt_polys')
            scores = page.get('rec_scores') or []
        except Exception:
            texts = getattr(page, 'rec_texts', [])
            polys = getattr(page, 'rec_polys', None) or getattr(page, 'dt_polys', None)
            scores = getattr(page, 'rec_scores', [])
        for index, value in enumerate(texts or []):
            text = str(value).replace('�', '').strip()
            if not text:
                continue
            item = {'text': text}
            if polys is not None and index < len(polys):
                try: item['box'] = polys[index].tolist()
                except Exception: pass
            if scores is not None and index < len(scores):
                try: item['confidence'] = float(scores[index])
                except Exception: pass
            items.append(item)
            lines.append(text)
    print(json.dumps({'text': '\n'.join(lines), 'items': items}, ensure_ascii=False))
finally:
    try: os.unlink(path)
    except OSError: pass
`;
  return new Promise((resolve) => {
    const child = spawn(env.paddleOcrPython, ["-c", script, filename], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), env.paddleOcrTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); console.warn("[paddleocr] indisponível", error.message); resolve(null); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { if (stderr.length) console.warn("[paddleocr] falha", Buffer.concat(stderr).toString().slice(0, 500)); resolve(null); return; }
      try { resolve(normalizeResult(JSON.parse(Buffer.concat(stdout).toString("utf8")))); } catch { resolve(null); }
    });
    child.stdin.end(input);
  });
}
