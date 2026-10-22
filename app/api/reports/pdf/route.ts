import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { listOffers } from "@/lib/store";
import { formatCurrency } from "@/lib/format";

export const runtime = "nodejs";

export async function GET() {
  const offers = (await listOffers()).filter((offer) => offer.review_status === "approved"); const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("PriceScan IA", { x: 42, y: 790, size: 24, font: bold, color: rgb(0.075, 0.15, 0.25) }); page.drawText("Relatório de ofertas aprovadas", { x: 42, y: 765, size: 12, font, color: rgb(0.35, 0.43, 0.52) }); page.drawText(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, { x: 42, y: 744, size: 9, font, color: rgb(0.45, 0.52, 0.58) }); page.drawText(`${offers.length} ofertas aprovadas`, { x: 42, y: 708, size: 13, font: bold, color: rgb(0.09, 0.42, 0.58) });
  let y = 678; for (const offer of offers.slice(0, 32)) { page.drawText((offer.product_name ?? "").slice(0, 44), { x: 42, y, size: 9, font, color: rgb(0.17, 0.27, 0.36) }); page.drawText(offer.supermarket_name ?? "", { x: 300, y, size: 9, font, color: rgb(0.4, 0.48, 0.56) }); page.drawText(formatCurrency(offer.price), { x: 480, y, size: 9, font: bold, color: rgb(0.08, 0.46, 0.35) }); y -= 18; if (y < 50) break; }
  page.drawText("Os dados deste relatório foram extraídos e aprovados no PriceScan IA.", { x: 42, y: 28, size: 8, font, color: rgb(0.5, 0.55, 0.6) }); const bytes = await pdf.save(); return new NextResponse(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="pricescan-relatorio-${new Date().toISOString().slice(0, 10)}.pdf"` } });
}
