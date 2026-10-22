import { spawn } from "node:child_process";
import { env } from "./env";

export type PaddleOcrItem = { text: string; box?: number[][] };
export type PaddleOcrResult = { text: string; items: PaddleOcrItem[] };

/** Optional adapter. It is inert unless PADDLEOCR_ENABLED=true and PaddleOCR is installed locally. */
export async function runPaddleOcr(input: Buffer, filename: string): Promise<PaddleOcrResult | null> {
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
    # PaddleOCR 3.x uses the current PaddlePaddle runtime and returns detected
    # text plus polygons. Disable optional orientation/unwarping models so the
    # first local run stays small and does not block on extra downloads.
    ocr = PaddleOCR(
        lang='pt',
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
    )
    pages = list(ocr.predict(path))
    lines = []
    items = []
    for page in pages or []:
        try:
            texts = page['rec_texts']
            polys = page.get('rec_polys') or page.get('dt_polys')
        except Exception:
            texts = getattr(page, 'rec_texts', [])
            polys = getattr(page, 'rec_polys', None) or getattr(page, 'dt_polys', None)
        for index, value in enumerate(texts or []):
            text = str(value).replace('�', '')
            if not text.strip():
                continue
            item = {'text': text}
            if polys is not None and index < len(polys):
                try:
                    item['box'] = polys[index].tolist()
                except Exception:
                    pass
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
    const timer = setTimeout(() => child.kill(), env.ocrSpaceTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); console.warn("[paddleocr] indisponível", error.message); resolve(null); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { if (stderr.length) console.warn("[paddleocr] falha", Buffer.concat(stderr).toString().slice(0, 300)); resolve(null); return; }
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString("utf8")) as PaddleOcrResult;
        resolve(parsed.text ? parsed : null);
      } catch { resolve(null); }
    });
    child.stdin.end(input);
  });
}
