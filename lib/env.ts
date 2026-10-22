export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "flyer-images",
  openAiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  ocrLanguage: process.env.OCR_LANGUAGE ?? "por",
  ocrTimeoutMs: Number(process.env.OCR_TIMEOUT_MS ?? 120000),
  ocrSpaceKey: process.env.OCR_SPACE_API_KEY ?? "",
  ocrSpaceTimeoutMs: Number(process.env.OCR_SPACE_TIMEOUT_MS ?? 120000),
  ocrLocalFallback: process.env.OCR_LOCAL_FALLBACK !== "false",
  paddleOcrEnabled: process.env.PADDLEOCR_ENABLED === "true",
  paddleOcrPython: process.env.PADDLEOCR_PYTHON ?? "python",
  apifyToken: process.env.APIFY_TOKEN ?? "",
  apifyActor: process.env.APIFY_ACTOR ?? "apify~instagram-scraper",
  apifyTimeoutMs: Number(process.env.APIFY_TIMEOUT_MS ?? 120),
  apifyMaxResults: Number(process.env.APIFY_MAX_RESULTS ?? 30),
  allowLocalFallback: process.env.ALLOW_LOCAL_FALLBACK !== "false",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isServerSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
