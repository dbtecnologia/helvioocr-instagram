"use client";

import { FormEvent, useEffect, useState } from "react";
import { Camera, Edit3, ExternalLink, FileSpreadsheet, FileText, Images, LoaderCircle, Plus, RefreshCw, Search, ScanLine, Store, Trash2, X } from "lucide-react";
import type { Publication, Supermarket } from "@/lib/types";

const emptyForm = { name: "", instagram_handle: "", instagram_url: "", city: "", neighborhood: "", address: "", network: "", active: true, monitoring_frequency: "weekly", notes: "" };
const maxOcrImages = 3;

function handleFromInstagramUrl(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.startsWith("@")) return /^@[a-zA-Z0-9._]{1,30}$/.test(clean) ? clean.toLowerCase() : "";
  try {
    const url = new URL(clean);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return "";
    const candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-zA-Z0-9._]{1,30}$/.test(candidate) ? `@${candidate.toLowerCase()}` : "";
  } catch { return ""; }
}

function formatCollectionDate(value?: string | null) {
  if (!value) return "Ainda não coletado";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function SupermarketsPage() {
  const [items, setItems] = useState<Supermarket[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [drawer, setDrawer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [feedMarketId, setFeedMarketId] = useState<string | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [selectedImages, setSelectedImages] = useState<number[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedMessage, setFeedMessage] = useState("");
  const [feedLimit, setFeedLimit] = useState("30");
  const [extracting, setExtracting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingPublication, setDeletingPublication] = useState(false);
  const [reportPublicationId, setReportPublicationId] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/supermarkets", { cache: "no-store" });
    if (response.ok) setItems(await response.json());
  }

  useEffect(() => { void load(); }, []);

  function change(key: keyof typeof emptyForm, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditingId(null); setForm({ ...emptyForm }); setMessage(""); setDrawer(true);
  }

  function openEdit(item: Supermarket) {
    setEditingId(item.id); setForm({ ...emptyForm, ...item, monitoring_frequency: item.monitoring_frequency ?? "weekly" }); setMessage(""); setDrawer(true);
  }

  async function openFeed(item: Supermarket, collect = true) {
    setFeedMarketId(item.id); setSelectedPublication(null); setSelectedImages([]); setReportPublicationId(null); setFeedLoading(true); setFeedRefreshing(true); setFeedMessage("Carregando o feed público do Instagram…");
    try {
      const cachedResponse = await fetch(`/api/instagram/publications?supermarket_id=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      let cachedCount = 0;
      if (cachedResponse.ok) {
        const cached = await cachedResponse.json() as { publications?: Publication[] };
        const cachedPublications = cached.publications ?? [];
        cachedCount = cachedPublications.length;
        setPublications(cachedPublications);
        if (cachedCount > 0) {
          setFeedLoading(false);
          setFeedMessage(collect ? "Feed salvo carregado. Atualizando publicações em segundo plano…" : "Selecione uma publicação para escolher a foto do OCR.");
        }
      }
      if (!collect) { setFeedLoading(false); return; }
      const healthResponse = await fetch("/api/health", { cache: "no-store" });
      const health = healthResponse.ok ? await healthResponse.json() as { apify?: boolean } : {};
      if (health.apify !== true) { setFeedLoading(false); setFeedMessage(cachedCount ? "Feed salvo carregado. Configure APIFY_TOKEN no backend para atualizar as publicações públicas." : "Configure APIFY_TOKEN no backend para carregar as publicações públicas."); return; }
      const response = await fetch("/api/instagram/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: item.instagram_handle, supermarket_id: item.id, limit: Number(feedLimit) }) });
      const result = await response.json();
      if (!response.ok) { setFeedMessage(result.error ?? "Não foi possível atualizar o feed."); return; }
      const refreshedPublications = (result.publications ?? []) as Publication[];
      const currentSelectedPublication = selectedPublication;
      const refreshedSelectedPublication = currentSelectedPublication
        ? refreshedPublications.find((publication) => publication.id === currentSelectedPublication.id
          || publication.external_id === currentSelectedPublication.external_id
          || publication.source_url === currentSelectedPublication.source_url) ?? null
        : null;
      setPublications(refreshedPublications);
      if (currentSelectedPublication) {
        setSelectedPublication(refreshedSelectedPublication);
        setSelectedImages(refreshedSelectedPublication
          ? refreshedSelectedPublication.media_urls.map((_, index) => index).slice(0, maxOcrImages)
          : []);
        if (!refreshedSelectedPublication) setReportPublicationId(null);
      }
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, instagram_handle: `@${result.handle}`, instagram_url: `https://instagram.com/${result.handle}`, last_collection_at: new Date().toISOString() } : currentItem));
      setFeedMessage(result.warning ?? `${result.count} publicação(ões) encontrada(s). Selecione uma foto para o OCR.`);
    } catch { setFeedMessage("Não foi possível carregar o feed. Verifique o servidor e tente novamente."); }
    finally { setFeedLoading(false); setFeedRefreshing(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const derivedHandle = handleFromInstagramUrl(form.instagram_url) || form.instagram_handle;
    if (!form.instagram_url || !derivedHandle) { setMessage("Informe um link válido de um perfil público do Instagram."); return; }
    setSaving(true); setMessage("");
    try {
      const payload = { ...form, instagram_handle: derivedHandle, instagram_url: form.instagram_url.trim() };
      const response = await fetch(editingId ? `/api/supermarkets/${editingId}` : "/api/supermarkets", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error ?? "Não foi possível salvar."); return; }
      const saved = body as Supermarket;
      setItems((current) => editingId ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setForm({ ...emptyForm }); setDrawer(false); setEditingId(null); setMessage("");
      void openFeed(saved, true);
    } catch { setMessage("Não foi possível salvar o supermercado. Tente novamente."); }
    finally { setSaving(false); }
  }

  async function deleteItem(item: Supermarket) {
    if (!window.confirm(`Excluir o supermercado "${item.name}" e o histórico associado?`)) return;
    setDeletingId(item.id);
    try {
      const response = await fetch(`/api/supermarkets/${item.id}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json(); setMessage(body.error ?? "Não foi possível excluir."); return; }
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      if (feedMarketId === item.id) { setFeedMarketId(null); setPublications([]); }
      setMessage("Supermercado excluído.");
    } catch { setMessage("Não foi possível excluir o supermercado."); }
    finally { setDeletingId(null); }
  }

  async function extractSelectedPublication() {
    if (!selectedPublication || !selectedImages.length) return;
    if (selectedImages.length > maxOcrImages) { setFeedMessage(`Selecione no máximo ${maxOcrImages} fotos por análise.`); return; }
    setExtracting(true); setFeedMessage("Baixando a foto selecionada e colocando na fila do OCR…");
    try {
      const response = await fetch("/api/instagram/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publication_id: selectedPublication.id, external_id: selectedPublication.external_id, source_url: selectedPublication.source_url, supermarket_id: selectedPublication.supermarket_id, image_indexes: selectedImages.slice(0, maxOcrImages) }) });
      const result = await response.json();
      if (response.ok) setReportPublicationId(result.publication_id ?? selectedPublication.id);
      setFeedMessage(response.ok ? `Leitura concluída: ${result.results?.reduce((total: number, item: { offers?: number }) => total + (item.offers ?? 0), 0) ?? 0} produto(s) salvo(s) em Relatórios.` : result.error ?? "Não foi possível concluir o OCR.");
    } catch { setFeedMessage("Não foi possível iniciar o OCR. Verifique o servidor e tente novamente."); }
    finally { setExtracting(false); }
  }

  async function deleteSelectedPublication() {
    if (!selectedPublication || !window.confirm("Excluir esta publicação do feed salvo? Os preços já enviados para revisão serão preservados.")) return;
    setDeletingPublication(true);
    try {
      const response = await fetch(`/api/instagram/publications/${encodeURIComponent(selectedPublication.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) { setFeedMessage(result.error ?? "Não foi possível excluir a publicação."); return; }
      setPublications((current) => current.filter((item) => item.id !== selectedPublication.id));
      setSelectedPublication(null); setSelectedImages([]); setReportPublicationId(null); setFeedMessage("Publicação excluída do feed salvo.");
    } catch { setFeedMessage("Não foi possível excluir a publicação. Tente novamente."); }
    finally { setDeletingPublication(false); }
  }

  function choosePublication(publication: Publication) { setSelectedPublication(publication); setSelectedImages(publication.media_urls.map((_, index) => index).slice(0, maxOcrImages)); setFeedMessage(`Publicação selecionada. Escolha até ${maxOcrImages} fotos para o OCR.`); }

  function changePublication() { setSelectedPublication(null); setSelectedImages([]); setReportPublicationId(null); setFeedMessage("Escolha outro encarte no feed acima."); }

  function toggleSelectedImage(index: number) {
    setSelectedImages((current) => {
      if (current.includes(index)) return current.filter((item) => item !== index);
      if (current.length >= maxOcrImages) { setFeedMessage(`O limite é de ${maxOcrImages} fotos por análise.`); return current; }
      return [...current, index];
    });
  }

  const filtered = items.filter((item) => `${item.name} ${item.instagram_handle} ${item.city}`.toLowerCase().includes(query.toLowerCase()));
  const feedMarket = items.find((item) => item.id === feedMarketId);

  return <>
    <div className="page-heading"><div><div className="eyebrow">Operação</div><h1>Supermercados monitorados</h1><p className="subhead">Cadastre apenas o nome e o Instagram. Os demais dados podem ser preenchidos depois.</p></div><button className="button button-primary" onClick={openCreate}><Plus size={15} />Adicionar supermercado</button></div>
    {message && <div className="notice" style={{ marginBottom: 18 }}>{message}</div>}
    <section className="card"><div className="toolbar"><div className="toolbar-left"><div className="search"><Search size={15} /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, @ ou cidade" /></div></div><div className="toolbar-right"><span className="field-note">{filtered.length} de {items.length} cadastrados</span></div></div>{filtered.length === 0 ? <div className="empty-state"><div><div className="empty-icon"><Store size={21} /></div><strong>{items.length === 0 ? "Nenhum supermercado cadastrado" : "Nenhum resultado encontrado"}</strong><p>{items.length === 0 ? "Comece adicionando um concorrente para abrir o feed e acompanhar preços." : "Tente buscar por outro nome, @ do Instagram ou cidade."}</p>{items.length === 0 && <button className="button button-soft" onClick={openCreate}><Plus size={14} />Adicionar primeiro concorrente</button>}</div></div> : <div className="table-wrap"><table><thead><tr><th>Supermercado</th><th>Localização</th><th>Instagram</th><th>Última coleta</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><div className="field-note">{item.network || "Rede não informada"}</div></td><td>{item.city}<div className="field-note">{item.neighborhood}</div></td><td><a href={item.instagram_url || `https://instagram.com/${item.instagram_handle.replace("@", "")}`} target="_blank" rel="noreferrer" className="field-note">{item.instagram_handle} <ExternalLink size={11} style={{ verticalAlign: "-2px" }} /></a></td><td className="field-note">{formatCollectionDate(item.last_collection_at)}</td><td><span className={`status ${item.active ? "status-green" : "status-orange"}`}><span className="status-dot" />{item.active ? "Ativo" : "Inativo"}</span></td><td><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}><button className="button button-soft" style={{ padding: "7px 9px" }} onClick={() => void openFeed(item, true)}><Images size={13} />Feed</button><button className="button button-ghost" style={{ padding: "7px 9px" }} onClick={() => openEdit(item)}><Edit3 size={13} />Editar</button><button className="button button-ghost" style={{ padding: "7px 9px", color: "#bd5260" }} onClick={() => void deleteItem(item)} disabled={deletingId === item.id}><Trash2 size={13} />Excluir</button></div></td></tr>)}</tbody></table></div>}</section>
    {feedMarket && <section className="card" style={{ marginTop: 18 }}><div className="card-header"><div><h2>Feed de {feedMarket.name}</h2><p>{feedMarket.instagram_url} · selecione a publicação e até 3 fotos para ler</p></div><div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}><label className="field-note" htmlFor="feed-limit">Buscar</label><select id="feed-limit" className="select" style={{ width: 130, padding: "7px 9px" }} value={feedLimit} onChange={(event) => setFeedLimit(event.target.value)}><option value="10">10 posts</option><option value="20">20 posts</option><option value="30">30 posts</option></select><button className="button button-ghost" onClick={() => void openFeed(feedMarket, true)} disabled={feedRefreshing} title="Buscar novas publicações no Instagram">{feedRefreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}Atualizar publicações</button><button className="icon-button" onClick={() => setFeedMarketId(null)} aria-label="Fechar feed"><X size={15} /></button></div></div><div className="card-body">{feedMessage && <div className="notice" style={{ marginBottom: 16 }}>{feedMessage}</div>}{feedLoading ? <div className="empty-state"><div><LoaderCircle size={24} className="animate-spin" color="#2b8fba" /><p>Buscando publicações públicas recentes…</p></div></div> : publications.length === 0 ? <div className="empty-state"><div><div className="empty-icon"><Camera size={21} /></div><strong>Nenhuma publicação disponível</strong><p>O perfil pode estar privado, sem publicações recentes ou a Apify ainda não está configurada.</p></div></div> : <><div className="publication-grid">{publications.map((publication) => <button key={publication.id} className={`publication-card ${selectedPublication?.id === publication.id ? "selected" : ""}`} onClick={() => choosePublication(publication)}><img src={publication.media_urls[0]} alt="Prévia da publicação" /><span className="publication-meta">{publication.media_urls.length > 1 ? `${publication.media_urls.length} imagens` : "1 imagem"} · {publication.published_at ? new Date(publication.published_at).toLocaleDateString("pt-BR") : "data indisponível"}</span><strong>{publication.caption?.slice(0, 80) || "Publicação sem legenda"}</strong></button>)}</div>{selectedPublication && <div className="selection-panel"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}><div><strong>Escolha até {maxOcrImages} fotos desta publicação</strong><span className="field-note">{selectedImages.length}/{maxOcrImages} selecionadas. Desmarque imagens que não sejam encartes.</span></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button button-ghost" onClick={changePublication} disabled={deletingPublication || extracting}><Images size={14} />Trocar encarte</button><button className="button button-ghost" style={{ color: "#bd5260" }} onClick={() => void deleteSelectedPublication()} disabled={deletingPublication || extracting}>{deletingPublication ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}Excluir selecionada</button></div></div><div className="image-selector">{selectedPublication.media_urls.map((url, index) => <label key={url} className={selectedImages.includes(index) ? "image-choice active" : "image-choice"}><input type="checkbox" checked={selectedImages.includes(index)} onChange={() => toggleSelectedImage(index)} /><img src={url} alt={`Imagem ${index + 1}`} /></label>)}</div><button className="button button-primary" onClick={() => void extractSelectedPublication()} disabled={extracting || !selectedImages.length || deletingPublication}>{extracting ? <><LoaderCircle size={15} className="animate-spin" />Lendo e salvando preços…</> : <><ScanLine size={15} />Ler {selectedImages.length} foto(s) com OCR</>}</button>{reportPublicationId && <div className="notice" style={{ marginTop: 12 }}><strong>Arquivo pronto:</strong> baixe ou compartilhe os resultados desta leitura. <a className="button button-soft" style={{ marginLeft: 8 }} href={`/api/reports/excel?publication_id=${encodeURIComponent(reportPublicationId)}`}><FileSpreadsheet size={14} />Excel</a><a className="button button-soft" style={{ marginLeft: 8 }} href={`/api/reports/pdf?publication_id=${encodeURIComponent(reportPublicationId)}`} target="_blank" rel="noreferrer"><FileText size={14} />PDF / imprimir</a></div>}</div>}</>}</div></section>}
    {drawer && <div style={{ position: "fixed", inset: 0, background: "rgba(13,27,42,.28)", zIndex: 20, display: "grid", placeItems: "center", padding: 18 }}><div className="card" style={{ width: "min(650px, 100%)", maxHeight: "calc(100vh - 36px)", overflow: "auto" }}><div className="card-header"><div><h2>{editingId ? "Editar supermercado" : "Novo supermercado"}</h2><p>Nome e Instagram são obrigatórios. O restante pode ser preenchido depois.</p></div><button className="icon-button" onClick={() => setDrawer(false)} aria-label="Fechar"><X size={16} /></button></div><form className="card-body form-grid" onSubmit={submit}><div className="field"><label htmlFor="name">Nome do supermercado</label><input id="name" className="input" value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="Ex.: Mercado Central" required /></div><div className="field"><label htmlFor="url">Link do Instagram</label><input id="url" className="input" type="url" value={form.instagram_url} onChange={(event) => { const value = event.target.value; const derived = handleFromInstagramUrl(value); setForm((current) => ({ ...current, instagram_url: value, instagram_handle: derived || current.instagram_handle })); }} placeholder="https://www.instagram.com/mercadocentral/" required /></div><div className="field full"><label htmlFor="handle">Perfil identificado automaticamente</label><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Camera size={16} color="#2b8fba" /><input id="handle" className="input" value={form.instagram_handle} readOnly placeholder="Cole o link acima" /></div></div><div className="field"><label htmlFor="city">Cidade <span className="field-note">(opcional)</span></label><input id="city" className="input" value={form.city} onChange={(event) => change("city", event.target.value)} placeholder="São Paulo" /></div><div className="field"><label htmlFor="neighborhood">Bairro <span className="field-note">(opcional)</span></label><input id="neighborhood" className="input" value={form.neighborhood} onChange={(event) => change("neighborhood", event.target.value)} placeholder="Centro" /></div><div className="field"><label htmlFor="network">Rede ou grupo <span className="field-note">(opcional)</span></label><input id="network" className="input" value={form.network} onChange={(event) => change("network", event.target.value)} placeholder="Opcional" /></div><div className="field"><label htmlFor="frequency">Frequência <span className="field-note">(opcional)</span></label><select id="frequency" className="select" value={form.monitoring_frequency} onChange={(event) => change("monitoring_frequency", event.target.value)}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="manual">Manual</option></select></div><div className="field full"><label htmlFor="address">Endereço <span className="field-note">(opcional)</span></label><input id="address" className="input" value={form.address} onChange={(event) => change("address", event.target.value)} placeholder="Opcional" /></div><div className="field full"><label htmlFor="notes">Observações <span className="field-note">(opcional)</span></label><textarea id="notes" className="textarea" rows={3} value={form.notes} onChange={(event) => change("notes", event.target.value)} placeholder="Notas para a operação" /></div>{message && <div className="notice full">{message}</div>}<div className="full" style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}><button type="button" className="button button-ghost" onClick={() => setDrawer(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar supermercado"}</button></div></form></div></div>}
  </>;
}

