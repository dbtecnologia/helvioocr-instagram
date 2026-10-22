import { NextResponse } from "next/server";
import { updateOffer } from "@/lib/store";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; return NextResponse.json(await updateOffer(id, await request.json())); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a oferta." }, { status: 500 }); } }
