import { NextResponse } from "next/server";
import { listOffers } from "@/lib/store";

export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json(await listOffers()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar ofertas." }, { status: 500 }); } }
