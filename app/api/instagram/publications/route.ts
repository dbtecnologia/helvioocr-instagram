import { NextResponse } from "next/server";
import { listPublications } from "@/lib/store";

export async function GET(request: Request) {
  const supermarketId = new URL(request.url).searchParams.get("supermarket_id") ?? undefined;
  try { return NextResponse.json({ publications: await listPublications(supermarketId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar publicações." }, { status: 500 }); }
}
