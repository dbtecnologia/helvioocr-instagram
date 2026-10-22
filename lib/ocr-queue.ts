type OcrJob<T> = () => Promise<T>;

let queueTail = Promise.resolve();

/** Serializes local OCR jobs so Tesseract is initialized once and CPU is not saturated. */
export function enqueueOcr<T>(job: OcrJob<T>) {
  const result = queueTail.then(job, job);
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}
