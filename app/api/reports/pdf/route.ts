import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { listOffers } from "@/lib/store";
import { formatCurrency } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const publicationId = new URL(request.url).searchParams.get("publication_id");
  const offers = (await listOffers()).filter((offer) => offer.review_status !== "rejected" && (!publicationId || offer.publication_id === publicationId)); const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("PriceScan IA", { x: 42, y: 790, size: 24, font: bold, color: rgb(0.075, 0.15, 0.25) }); page.drawText("Relatório de preços extraídos", { x: 42, y: 765, size: 12, font, color: rgb(0.35, 0.43, 0.52) }); page.drawText(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, { x: 42, y: 744, size: 9, font, color: rgb(0.45, 0.52, 0.58) }); page.drawText(`${offers.length} ofertas extraídas`, { x: 42, y: 708, size: 13, font: bold, color: rgb(0.09, 0.42, 0.58) });
  let y = 678; for (const offer of offers.slice(0, 32)) { page.drawText((offer.product_name ?? "").slice(0, 34), { x: 42, y, size: 9, font, color: rgb(0.17, 0.27, 0.36) }); page.drawText([offer.quantity && offer.unit ? `${offer.quantity} ${offer.unit}` : "", offer.promotion_conditions ?? ""].filter(Boolean).join(" · ").slice(0, 24), { x: 255, y, size: 8, font, color: rgb(0.4, 0.48, 0.56) }); page.drawText(formatCurrency(offer.price), { x: 430, y, size: 9, font: bold, color: rgb(0.08, 0.46, 0.35) }); page.drawText(offer.review_status === "approved" ? "Aprovado" : "Revisar", { x: 500, y, size: 7, font, color: rgb(0.45, 0.38, 0.1) }); y -= 18; if (y < 50) break; }
  page.drawText("Preços extraídos automaticamente. Confirme os itens marcados para revisão antes de publicar.", { x: 42, y: 28, size: 8, font, color: rgb(0.5, 0.55, 0.6) }); const bytes = await pdf.save(); return new NextResponse(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="pricescan-relatorio-${new Date().toISOString().slice(0, 10)}.pdf"` } });
}

