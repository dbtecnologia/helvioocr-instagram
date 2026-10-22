import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json(await getDashboardData()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar dashboard." }, { status: 500 }); } }
