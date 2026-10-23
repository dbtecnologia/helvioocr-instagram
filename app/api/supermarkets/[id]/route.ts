import { NextResponse } from "next/server";
import { deleteSupermarket, listSupermarkets, updateSupermarket } from "@/lib/store";
import { supermarketUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; const parsed = supermarketUpdateSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 }); if (parsed.data.market_type === "own" && (await listSupermarkets()).some((item) => item.market_type === "own" && item.id !== id)) return NextResponse.json({ error: "Já existe um supermercado marcado como Meu supermercado." }, { status: 409 }); const updated = await updateSupermarket(id, parsed.data); return NextResponse.json(updated); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar supermercado." }, { status: 500 }); } }
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; await deleteSupermarket(id); return new NextResponse(null, { status: 204 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir supermercado." }, { status: 500 }); } }
