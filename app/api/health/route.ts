import { NextResponse } from "next/server";
import { env, isServerSupabaseConfigured, isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() { return NextResponse.json({ ok: true, app: "PriceScan IA", persistence: isServerSupabaseConfigured || isSupabaseConfigured ? "supabase" : env.allowLocalFallback ? "local" : "unconfigured", ocr: Boolean(process.env.OCR_LANGUAGE), ocr_space: Boolean(env.ocrSpaceKey), paddle_ocr: env.paddleOcrEnabled, vision: Boolean(env.openAiKey), apify: Boolean(env.apifyToken), timestamp: new Date().toISOString() }); }
