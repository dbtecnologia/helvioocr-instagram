import { NextResponse } from "next/server";
import { createSupermarket, listSupermarkets } from "@/lib/store";
import { supermarketSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() { try { return NextResponse.json(await listSupermarkets()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar supermercados." }, { status: 500 }); } }

export async function POST(request: Request) { try { const parsed = supermarketSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 }); const created = await createSupermarket(parsed.data); return NextResponse.json(created, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar supermercado." }, { status: 500 }); } }
