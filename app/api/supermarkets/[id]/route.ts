import { NextResponse } from "next/server";
import { deleteSupermarket, updateSupermarket } from "@/lib/store";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; const updated = await updateSupermarket(id, await request.json()); return NextResponse.json(updated); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar supermercado." }, { status: 500 }); } }
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; await deleteSupermarket(id); return new NextResponse(null, { status: 204 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir supermercado." }, { status: 500 }); } }
