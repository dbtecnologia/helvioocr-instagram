import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { listOffers, listSupermarkets } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const [allOffers, supermarkets] = await Promise.all([listOffers(), listSupermarkets()]);
  const offers = allOffers.filter((offer) => offer.review_status === "approved");
  const marketsById = new Map(supermarkets.map((market) => [market.id, market]));
  const workbook = new ExcelJS.Workbook(); workbook.creator = "PriceScan IA"; workbook.created = new Date();
  const summary = workbook.addWorksheet("Resumo"); summary.columns = [{ header: "Indicador", key: "label", width: 28 }, { header: "Valor", key: "value", width: 20 }]; summary.addRows([{ label: "Ofertas aprovadas", value: offers.length }, { label: "Supermercados", value: new Set(offers.map((offer) => offer.supermarket_name)).size }, { label: "Gerado em", value: new Date() }]);
  const sheet = workbook.addWorksheet("Dados detalhados"); sheet.columns = [{ header: "Supermercado", key: "market", width: 24 }, { header: "Instagram", key: "instagram", width: 22 }, { header: "Produto", key: "product", width: 30 }, { header: "Marca", key: "brand", width: 20 }, { header: "Quantidade", key: "quantity", width: 14 }, { header: "Unidade", key: "unit", width: 12 }, { header: "Preço", key: "price", width: 14 }, { header: "Preço anterior", key: "previous", width: 16 }, { header: "Validade", key: "valid_until", width: 16 }, { header: "Confiança IA", key: "confidence", width: 15 }, { header: "Data da leitura", key: "read_at", width: 18 }, { header: "Horário da leitura", key: "read_time", width: 18 }, { header: "Data publicação", key: "published_at", width: 18 }, { header: "Fonte", key: "source", width: 40 }];
  sheet.addRows(offers.map((offer) => { const readAt = offer.extracted_at ? new Date(offer.extracted_at) : null; const market = marketsById.get(offer.supermarket_id); return { market: offer.supermarket_name ?? market?.name ?? "", instagram: market?.instagram_handle ?? "Upload manual", product: offer.product_name, brand: offer.brand ?? "", quantity: offer.quantity ?? "", unit: offer.unit ?? "", price: offer.price, previous: offer.previous_price ?? "", valid_until: offer.valid_until ? new Date(offer.valid_until) : "", confidence: offer.confidence_score, read_at: readAt ?? "", read_time: readAt ? readAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "", published_at: offer.published_at ? new Date(offer.published_at) : "", source: offer.source_url ?? "" }; }));
  [summary, sheet].forEach((worksheet) => { worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "176C94" } }; worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + Math.min(worksheet.columnCount, 26))}1` }; worksheet.views = [{ state: "frozen", ySplit: 1 }]; });
  sheet.getColumn("price").numFmt = '"R$" #,##0.00'; sheet.getColumn("previous").numFmt = '"R$" #,##0.00'; sheet.getColumn("confidence").numFmt = "0.00";
  const buffer = await workbook.xlsx.writeBuffer(); return new NextResponse(buffer, { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="pricescan-ofertas-${new Date().toISOString().slice(0, 10)}.xlsx"` } });
}
