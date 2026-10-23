"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle, RefreshCw, ScanLine } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { Offer, Supermarket } from "@/lib/types";

const statusLabel: Record<string, string> = { pending: "Pendente", needs_review: "Revisão necessária", approved: "Aprovada", rejected: "Rejeitada" };

function readAtParts(value?: string | null) {
  if (!value) return { date: "—", time: "—" };
  const readAt = new Date(value);
  return { date: readAt.toLocaleDateString("pt-BR"), time: readAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
}

export default function ReportsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [markets, setMarkets] = useState<Supermarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [offersResponse, marketsResponse] = await Promise.all([fetch("/api/offers", { cache: "no-store" }), fetch("/api/supermarkets", { cache: "no-store" })]);
      if (!offersResponse.ok) throw new Error("Não foi possível carregar os produtos lidos.");
      setOffers(await offersResponse.json() as Offer[]);
      setMarkets(marketsResponse.ok ? await marketsResponse.json() as Supermarket[] : []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar os relatórios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const marketsById = useMemo(() => new Map(markets.map((market) => [market.id, market])), [markets]);

  return <>
    <div className="page-heading"><div><div className="eyebrow">Gestão</div><h1>Relatórios</h1><p className="subhead">Os produtos entram aqui automaticamente assim que a leitura do encarte termina.</p></div><button className="button button-ghost" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}Atualizar</button></div>
    {message && <div className="notice" style={{ marginBottom: 18 }}>{message}</div>}
    <div className="mini-grid"><section className="card"><div className="card-header"><div><h2>Excel operacional</h2><p>Dados detalhados, Instagram e horário da leitura</p></div><FileSpreadsheet size={19} color="#208a63" /></div><div className="card-body"><div className="notice">Inclui preços extraídos e o status de revisão de cada item.</div><a className="button button-primary" style={{ marginTop: 18 }} href="/api/reports/excel"><Download size={14} />Exportar .xlsx</a></div></section><section className="card"><div className="card-header"><div><h2>Relatório executivo</h2><p>Formato A4 para compartilhar ou imprimir</p></div><FileText size={19} color="#bd5260" /></div><div className="card-body"><div className="notice">Itens marcados para revisão aparecem identificados no PDF.</div><a className="button button-soft" style={{ marginTop: 18 }} href="/api/reports/pdf"><Download size={14} />Gerar PDF</a></div></section></div>
    <section className="card" style={{ marginTop: 18 }}><div className="card-header"><div><h2>Produtos lidos automaticamente</h2><p>{offers.length ? `${offers.length} produto(s) aguardando ou já revisado(s)` : "Nenhuma leitura registrada ainda"}</p></div><ScanLine size={19} color="#2b8fba" /></div>{offers.length === 0 ? <div className="empty-state"><div><div className="empty-icon"><ScanLine size={21} /></div><strong>{loading ? "Carregando leituras…" : "O relatório será preenchido após o OCR"}</strong><p>Envie um encarte em Coleta. Ao terminar, os produtos aparecem aqui com Instagram, data e horário da leitura.</p></div></div> : <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Preço</th><th>Instagram</th><th>Data da leitura</th><th>Horário</th><th>Status</th></tr></thead><tbody>{offers.map((offer) => { const market = marketsById.get(offer.supermarket_id); const readAt = readAtParts(offer.extracted_at); return <tr key={offer.id}><td><strong>{offer.product_name}</strong><div className="field-note">{[offer.brand, offer.quantity && offer.unit ? `${offer.quantity} ${offer.unit}` : null].filter(Boolean).join(" · ") || "Dados extraídos do encarte"}</div></td><td><strong>{formatCurrency(offer.price)}</strong></td><td>{market?.instagram_handle || "Upload manual"}</td><td>{readAt.date}</td><td>{readAt.time}</td><td><span className={`status ${offer.review_status === "approved" ? "status-green" : offer.review_status === "rejected" ? "status-red" : "status-orange"}`}><span className="status-dot" />{statusLabel[offer.review_status] ?? offer.review_status}</span></td></tr>; })}</tbody></table></div>}</section>
  </>;
}

