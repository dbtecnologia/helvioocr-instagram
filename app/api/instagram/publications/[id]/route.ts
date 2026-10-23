import { NextResponse } from "next/server";
import { deletePublication } from "@/lib/store";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deletePublication(id);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a publicação." }, { status: 500 });
  }
}

