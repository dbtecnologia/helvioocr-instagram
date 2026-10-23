"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { CheckCircle2, FileArchive, FileImage, Link2, LoaderCircle, ScanLine, Search, Trash2, UploadCloud } from "lucide-react";
import type { Publication, Supermarket } from "@/lib/types";
import { runBrowserOcr } from "@/lib/browser-ocr";

type UploadJob = { id: string; name: string; status: string; progress?: number; progress_message?: string | null; offers?: number; error?: string | null };

const uploadStatusLabel: Record<string, string> = {
  uploaded: "recebido",
  queued: "na fila",
  processing: "lendo encarte",
  needs_review: "pronto para revisão",
  completed: "concluído",
  failed: "erro",
};

export default function CollectionPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [markets, setMarkets] = useState<Supermarket[]>([]);
  const [marketId, setMarketId] = useState("");
  const [handle, setHandle] = useState("");
  const [limit, setLimit] = useState("10");
  const [publications, setPublications] = useState<Publication[]>([]);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [selectedImages, setSelectedImages] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [apifyConfigured, setApifyConfigured] = useState<boolean | null>(null);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetch("/api/supermarkets"), fetch("/api/health")]).then(async ([marketsResponse, healthResponse]) => {
      const items = marketsResponse.ok ? await marketsResponse.json() as Supermarket[] : [];
      const health = healthResponse.ok ? await healthResponse.json() as { apify?: boolean } : {};
      setMarkets(items); setApifyConfigured(health.apify === true);
      if (items[0]) { setMarketId(items[0].id); setHandle(items[0].instagram_handle.replace(/^@/, "")); }
    });
  }, []);

  useEffect(() => {
    if (!marketId) return;
    void fetch(`/api/instagram/publications?supermarket_id=${encodeURIComponent(marketId)}`).then((response) => response.ok ? response.json() : { publications: [] }).then((result) => setPublications(result.publications ?? []));
  }, [marketId]);

  useEffect(() => {
    void fetch("/api/uploads", { cache: "no-store" }).then((response) => response.ok ? response.json() : []).then((uploads: Array<{ id: string; original_name?: string; status: string; progress?: number; progress_message?: string | null; offers?: number; error?: string | null }>) => setUploadJobs(uploads.slice(0, 12).map((upload) => ({ id: upload.id, name: upload.original_name ?? "Encarte", status: upload.status, progress: upload.progress, progress_message: upload.progress_message, offers: upload.offers, error: upload.error }))));
  }, []);

  const hasActiveUploadJobs = uploadJobs.some((job) => ["uploaded", "queued", "processing"].includes(job.status));
  useEffect(() => {
    if (!hasActiveUploadJobs) return;
    let cancelled = false;
    const refresh = async () => {
      const response = await fetch("/api/uploads", { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const uploads = await response.json() as Array<{ id: string; status: string; progress?: number; progress_message?: string | null; offers?: number; error?: string | null }>;
      setUploadJobs((current) => current.map((job) => {
        const latest = uploads.find((upload) => upload.id === job.id);
        return latest ? { ...job, status: latest.status, progress: latest.progress, progress_message: latest.progress_message, offers: latest.offers, error: latest.error } : job;
      }));
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [hasActiveUploadJobs]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) { setFiles(Array.from(event.target.files ?? [])); setMessage(""); }

  async function deleteUpload(upload: UploadJob) {
    if (!window.confirm(`Excluir o encarte "${upload.name}" e as ofertas extraídas?`)) return;
    setDeletingUploadId(upload.id);
    try {
      const response = await fetch(`/api/uploads/${encodeURIComponent(upload.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error ?? "Não foi possível excluir o encarte."); return; }
      setUploadJobs((current) => current.filter((job) => job.id !== upload.id));
      setMessage("Encarte excluído com sucesso.");
    } catch { setMessage("Não foi possível excluir o encarte. Verifique o servidor e tente novamente."); }
    finally { setDeletingUploadId(null); }
  }

  function updateJob(id: string, patch: Partial<UploadJob>) {
    setUploadJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
  }

  async function processInBrowser(uploadId: string, source: Blob | string, name: string) {
    updateJob(uploadId, { status: "processing", progress: 5, progress_message: "Preparando a imagem para leitura…", error: null });
    try {
      const ocr = await runBrowserOcr(source, (progress, progressMessage) => updateJob(uploadId, { status: "processing", progress: Math.min(88, Math.max(5, progress)), progress_message: progressMessage }));
      if (!ocr.text) throw new Error("A imagem está ilegível ou não contém texto reconhecível.");
      updateJob(uploadId, { progress: 92, progress_message: "Salvando produtos e preços no relatório…" });
      const response = await fetch("/api/process/client", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: uploadId, text: ocr.text, items: ocr.items }) });
      const result = await response.json() as { error?: string; offers?: number };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o resultado do OCR.");
      updateJob(uploadId, { status: "needs_review", progress: 100, progress_message: `Leitura concluída. ${result.offers ?? 0} produto(s) enviado(s) para Relatórios.`, offers: result.offers ?? 0 });
      return result.offers ?? 0;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha no OCR do navegador.";
      updateJob(uploadId, { status: "failed", progress: 100, progress_message: "A leitura não pôde ser concluída.", error: reason });
      throw new Error(`${name}: ${reason}`);
    }
  }

  async function upload() {
    if (!files.length) return;
    setUploading(true); setMessage("Enviando arquivos…");
    try {
      const body = new FormData(); files.forEach((file) => body.append("files", file)); if (marketId) body.append("supermarket_id", marketId);
      const response = await fetch("/api/uploads", { method: "POST", body }); const result = await response.json();
      if (!response.ok) { setMessage(result.error ?? "Falha no upload."); return; }
      const jobs = (result.files ?? []).map((file: { id: string; original_name?: string }) => ({ id: file.id, name: file.original_name ?? "Encarte", status: "queued", progress: 0, progress_message: "Aguardando processamento" }));
      setUploadJobs((current) => [...jobs, ...current].slice(0, 12));
      setFiles([]); setInputKey((current) => current + 1);
      const failures: string[] = [];
      for (let index = 0; index < (result.files ?? []).length; index += 1) {
        const saved = result.files[index] as { id: string; original_name?: string };
        const source = files[index];
        try { await processInBrowser(saved.id, source, saved.original_name ?? source?.name ?? "Encarte"); } catch (error) { failures.push(error instanceof Error ? error.message : "falha"); }
      }
      setMessage(failures.length ? `Leitura concluída com ${failures.length} erro(s). Confira a mensagem no processamento.` : `${result.count} arquivo(s) lido(s) com Tesseract.js no navegador. Os produtos já foram enviados para Relatórios e Revisão.`);
    } catch { setMessage("Não foi possível enviar ou ler o arquivo. Verifique o formato e tente novamente."); }
    finally { setUploading(false); }
  }

  async function searchInstagram() {
    if (!handle || !marketId) { setMessage("Informe o @ e selecione um supermercado cadastrado antes de buscar."); return; }
    if (apifyConfigured === false) { setMessage("Configure APIFY_TOKEN no arquivo .env.local e reinicie o servidor."); return; }
    setSearching(true); setMessage("Buscando publicações públicas na Apify…");
    const response = await fetch("/api/instagram/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, supermarket_id: marketId, limit: Number(limit) }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error ?? "Não foi possível coletar esse perfil."); setSearching(false); return; }
    setPublications(result.publications ?? []); setSelectedPublication(null); setSelectedImages([]); setMessage(result.warning ?? `${result.count} publicação(ões) encontrada(s). Selecione uma imagem para extrair os preços.`); setSearching(false);
  }

  function choosePublication(publication: Publication) { setSelectedPublication(publication); setSelectedImages(publication.media_urls.map((_, index) => index)); }

  async function extractPrices() {
    if (!selectedPublication) return;
    setExtracting(true); setMessage("Baixando as imagens selecionadas…");
    const response = await fetch("/api/instagram/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publication_id: selectedPublication.id, image_indexes: selectedImages }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error ?? "Falha ao preparar a extração."); setExtracting(false); return; }
    const uploads = (result.uploads ?? []) as string[];
    const names = uploads.map((uploadId, index) => ({ uploadId, name: `Instagram · imagem ${index + 1}` }));
    setUploadJobs((current) => [...names.map(({ uploadId, name }) => ({ id: uploadId, name, status: "queued", progress: 0, progress_message: "Aguardando leitura no navegador" })), ...current].slice(0, 12));
    const failures: string[] = [];
    for (const { uploadId, name } of names) {
      try { await processInBrowser(uploadId, `/api/uploads/${encodeURIComponent(uploadId)}`, name); } catch (error) { failures.push(error instanceof Error ? error.message : "falha"); }
    }
    setMessage(failures.length ? `OCR finalizado com ${failures.length} erro(s). Confira o processamento abaixo.` : `${uploads.length} imagem(ns) lida(s) com Tesseract.js. Os produtos já estão em Relatórios para revisar e exportar.`);
    setExtracting(false);
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">Operação</div><h1>Coleta de encartes</h1><p className="subhead">Busque publicações públicas ou envie imagens autorizadas para transformar ofertas em dados comparáveis.</p></div><span className="status status-blue"><span className="status-dot" />Tesseract.js no navegador</span></div>
    <section className="card" style={{ marginBottom: 18 }}><div className="card-header"><div><h2>Buscar no Instagram</h2><p>Somente perfis e publicações públicas, sem senha ou login de concorrentes.</p></div><Search size={18} color="#2b8fba" /></div><div className="card-body"><div className="form-grid"><div className="field"><label htmlFor="instagram-market">Supermercado</label><select id="instagram-market" className="select" value={marketId} onChange={(event) => { const value = event.target.value; setMarketId(value); const market = markets.find((item) => item.id === value); if (market) setHandle(market.instagram_handle.replace(/^@/, "")); }}><option value="">Selecione um supermercado</option>{markets.map((market) => <option key={market.id} value={market.id}>{market.name} · {market.city}</option>)}</select></div><div className="field"><label htmlFor="instagram-handle">@ do Instagram público</label><input id="instagram-handle" className="input" value={handle} onChange={(event) => setHandle(event.target.value.replace(/^@/, ""))} placeholder="supermercadoexemplo" /></div><div className="field"><label htmlFor="instagram-limit">Publicações</label><select id="instagram-limit" className="select" value={limit} onChange={(event) => setLimit(event.target.value)}><option value="5">5 recentes</option><option value="10">10 recentes</option><option value="20">20 recentes</option><option value="30">30 recentes</option></select></div></div><button className="button button-primary" style={{ marginTop: 16 }} onClick={() => void searchInstagram()} disabled={searching || !marketId}>{searching ? <><LoaderCircle size={15} className="animate-spin" />Buscando…</> : <><Search size={15} />Buscar publicações</>}</button>{publications.length > 0 && <div className="publication-grid">{publications.map((publication) => <button key={publication.id} className={`publication-card ${selectedPublication?.id === publication.id ? "selected" : ""}`} onClick={() => choosePublication(publication)}><img src={publication.media_urls[0]} alt="Prévia da publicação" /><span className="publication-meta">{publication.media_urls.length > 1 ? `${publication.media_urls.length} imagens` : "1 imagem"} · {publication.published_at ? new Date(publication.published_at).toLocaleDateString("pt-BR") : "data indisponível"}</span><strong>{publication.caption?.slice(0, 80) || "Publicação sem legenda"}</strong></button>)}</div>}{selectedPublication && <div className="selection-panel"><div><strong>Imagens da publicação selecionada</strong><span className="field-note">Desmarque imagens que não sejam encartes.</span></div><div className="image-selector">{selectedPublication.media_urls.map((url, index) => <label key={url} className={selectedImages.includes(index) ? "image-choice active" : "image-choice"}><input type="checkbox" checked={selectedImages.includes(index)} onChange={() => setSelectedImages((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} /><img src={url} alt={`Imagem ${index + 1}`} /></label>)}</div><button className="button button-primary" onClick={() => void extractPrices()} disabled={extracting || !selectedImages.length}>{extracting ? <><LoaderCircle size={15} className="animate-spin" />Enviando…</> : <><ScanLine size={15} />Ler preços com OCR</>}</button></div>}{message && <div className="notice" style={{ marginTop: 16 }}>{message}</div>}</div></section>
    <div className="dashboard-grid"><section className="card"><div className="card-header"><div><h2>Enviar arquivos</h2><p>JPG, PNG, WebP, PDF ou ZIP · até 25 MB por arquivo</p></div><UploadCloud size={18} color="#2b8fba" /></div><div className="card-body"><div className="field" style={{ marginBottom: 15 }}><label htmlFor="market">Associar a supermercado (opcional)</label><select id="market" className="select" value={marketId} onChange={(event) => setMarketId(event.target.value)}><option value="">Sem supermercado — revisão manual</option>{markets.map((market) => <option key={market.id} value={market.id}>{market.name} · {market.city}</option>)}</select></div><label className="dropzone"><input key={inputKey} type="file" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,application/zip" onChange={selectFiles} /><div><UploadCloud className="upload-icon" size={30} /><strong>Arraste seus encartes ou clique para selecionar</strong><p>O resultado entra na fila sem bloquear esta tela.</p><span className="button button-soft">Selecionar arquivos</span></div></label>{files.length > 0 && <div className="list" style={{ marginTop: 16 }}>{files.map((file) => <div className="list-row" key={`${file.name}-${file.size}`}><div className="list-main"><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></div><FileImage size={16} color="#6b7b90" /></div>)}</div>}{uploadJobs.length > 0 && <div className="list" style={{ marginTop: 18 }}><strong style={{ display: "block", marginBottom: 8 }}>Processamento dos encartes</strong>{uploadJobs.map((job) => { const progress = Math.max(0, Math.min(100, job.progress ?? (["needs_review", "completed"].includes(job.status) ? 100 : 0))); const finished = ["needs_review", "completed"].includes(job.status); const active = ["uploaded", "queued", "processing"].includes(job.status); return <div className="processing-job" key={job.id}><div className="processing-job-header"><div className="list-main"><strong>{job.name}</strong><span>{job.error ?? job.progress_message ?? (job.status === "needs_review" ? `${job.offers ?? 0} oferta(s) encontrada(s)` : "Acompanhe sem sair desta tela")}</span></div><span className={`status ${job.status === "failed" ? "status-red" : finished ? "status-green" : "status-blue"}`}><span className="status-dot" />{uploadStatusLabel[job.status] ?? job.status}</span><button type="button" className="button button-ghost" style={{ padding: "7px 9px", gap: 5 }} onClick={(event) => { event.stopPropagation(); void deleteUpload(job); }} disabled={deletingUploadId === job.id} title="Excluir encarte"><Trash2 size={14} />Excluir</button></div>{(active || finished || job.status === "failed") && <div className="processing-progress" aria-label={`Progresso da leitura de ${job.name}`}><div className="processing-progress-meta"><span>{job.status === "failed" ? "Leitura interrompida" : finished ? "Leitura concluída" : "Lendo encarte"}</span><strong>{progress}%</strong></div><div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span className="progress-fill" style={{ width: `${progress}%` }} /></div></div>}</div>; })}</div>}<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}><button className="button button-primary" onClick={() => void upload()} disabled={!files.length || uploading}>{uploading ? <><LoaderCircle size={15} className="animate-spin" />Enviando…</> : <><ScanLine size={15} />Enviar e analisar</>}</button></div></div></section><section className="card"><div className="card-header"><div><h2>Fontes autorizadas</h2><p>O @ sozinho não libera publicações de terceiros.</p></div><Link2 size={18} color="#d88b36" /></div><div className="card-body"><div className="notice" style={{ marginBottom: 17 }}>A coleta usa o Actor oficial da Apify para dados públicos. Perfis privados, CAPTCHA, bloqueios e indisponibilidade do Instagram retornam uma mensagem clara.</div><div className="field"><label htmlFor="source">URL pública permitida (opcional)</label><input id="source" className="input" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://.../encarte.pdf" /></div><button className="button button-soft" style={{ marginTop: 12 }} disabled={!sourceUrl}><Link2 size={14} />Importar por URL</button><div className="list" style={{ marginTop: 22 }}><div className="list-row"><div className="list-main"><strong>Instagram via Apify</strong><span>Token configurado apenas no backend</span></div><span className="status status-blue">público</span></div><div className="list-row"><div className="list-main"><strong>Importação ZIP</strong><span>Processamento em lote local</span></div><FileArchive size={16} color="#6b7b90" /></div></div></div></section></div>
    <section className="card" style={{ marginTop: 18 }}><div className="card-header"><div><h2>Como o pipeline funciona</h2><p>Cada etapa mantém a fonte original e deixa a revisão humana no controle.</p></div></div><div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>{[{ icon: Search, title: "Busca", text: "Publicações públicas recentes" }, { icon: FileImage, title: "Seleção", text: "Imagem ou carrossel escolhido" }, { icon: ScanLine, title: "OCR gratuito", text: "Produtos e preços estruturados" }, { icon: CheckCircle2, title: "Revisão", text: "Aprovação antes da base" }].map((step) => { const Icon = step.icon; return <div key={step.title} style={{ padding: 15, background: "#f8fbfd", border: "1px solid #e5edf2", borderRadius: 9 }}><Icon size={17} color="#2b8fba" /><strong style={{ display: "block", fontSize: 12, marginTop: 14 }}>{step.title}</strong><span className="field-note" style={{ display: "block", marginTop: 5 }}>{step.text}</span></div>; })}</div></section>
  </>;
}
