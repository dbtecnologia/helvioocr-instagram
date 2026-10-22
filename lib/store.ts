import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAdminSupabase } from "./supabase-server";
import type { DashboardData, Offer, Publication, Supermarket, UploadRecord } from "./types";

type LocalStore = { supermarkets: Supermarket[]; offers: Offer[]; uploads: Array<Record<string, unknown>>; publications?: Publication[] };
const dataDir = path.join(process.cwd(), "data");
const storeFile = path.join(dataDir, "store.json");

async function readLocal(): Promise<LocalStore> {
  try { return JSON.parse(await readFile(storeFile, "utf8")) as LocalStore; }
  catch { return { supermarkets: [], offers: [], uploads: [], publications: [] }; }
}

async function writeLocal(store: LocalStore) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storeFile, JSON.stringify(store, null, 2), "utf8");
}

export async function listSupermarkets(): Promise<Supermarket[]> {
  const supabase = getAdminSupabase();
  if (supabase) {
    const { data, error } = await supabase.from("supermarkets").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Supermarket[];
  }
  return (await readLocal()).supermarkets;
}

export async function createSupermarket(input: Omit<Supermarket, "id" | "created_at" | "updated_at">) {
  const now = new Date().toISOString();
  const record: Supermarket = { ...input, id: randomUUID(), created_at: now, updated_at: now, last_collection_at: null, flyer_count: 0 };
  const supabase = getAdminSupabase();
  if (supabase) {
    const { data, error } = await supabase.from("supermarkets").insert(record).select().single();
    if (error) throw new Error(error.message);
    return data as Supermarket;
  }
  const store = await readLocal(); store.supermarkets.unshift(record); await writeLocal(store); return record;
}

export async function updateSupermarket(id: string, input: Partial<Supermarket>) {
  const supabase = getAdminSupabase();
  if (supabase) {
    const { data, error } = await supabase.from("supermarkets").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw new Error(error.message); return data as Supermarket;
  }
  const store = await readLocal(); const index = store.supermarkets.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Supermercado não encontrado.");
  store.supermarkets[index] = { ...store.supermarkets[index], ...input, updated_at: new Date().toISOString() }; await writeLocal(store); return store.supermarkets[index];
}

export async function deleteSupermarket(id: string) {
  const supabase = getAdminSupabase();
  if (supabase) { const { error } = await supabase.from("supermarkets").delete().eq("id", id); if (error) throw new Error(error.message); return; }
  const store = await readLocal(); store.supermarkets = store.supermarkets.filter((item) => item.id !== id); await writeLocal(store);
}

export async function listOffers(): Promise<Offer[]> {
  const supabase = getAdminSupabase();
  if (supabase) {
    const { data, error } = await supabase.from("offers").select("*, supermarkets(name)").order("extracted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((item) => ({ ...item, product_name: item.raw_product_name ?? item.product_name, supermarket_name: (item.supermarkets as { name?: string } | null)?.name })) as Offer[];
  }
  return (await readLocal()).offers;
}

export async function getDashboardData(): Promise<DashboardData> {
  const [supermarkets, offers] = await Promise.all([listSupermarkets(), listOffers()]);
  const approved = offers.filter((offer) => offer.review_status === "approved");
  return { supermarkets: supermarkets.length, flyers: supermarkets.reduce((sum, s) => sum + (s.flyer_count ?? 0), 0), products: new Set(offers.map((offer) => offer.product_name.toLowerCase())).size, approved: approved.length, pending: offers.filter((offer) => offer.review_status !== "approved").length, errors: 0, ai_cost: 0, last_update: offers[0]?.published_at ?? supermarkets[0]?.updated_at ?? null, lowest_prices: approved.slice(0, 5), recent_supermarkets: supermarkets.slice(0, 5) };
}

export async function addUpload(upload: Record<string, unknown>) { const store = await readLocal(); store.uploads.unshift(upload); await writeLocal(store); }

export async function listUploads(): Promise<UploadRecord[]> {
  const supabase = getAdminSupabase();
  if (supabase) { const { data, error } = await supabase.from("flyer_images").select("*").order("created_at", { ascending: false }); if (error) throw new Error(error.message); return (data ?? []).map((item) => ({ id: item.id, original_name: item.metadata?.original_name ?? item.storage_path, mime_type: item.metadata?.mime_type ?? "image/*", size: item.metadata?.size ?? 0, content_hash: item.image_hash, storage_path: item.storage_path, processed_path: item.metadata?.processed_path ?? null, supermarket_id: item.metadata?.supermarket_id ?? null, publication_id: item.publication_id ?? item.metadata?.publication_id ?? null, source_url: item.metadata?.source_url ?? null, status: item.processing_status, progress: item.metadata?.progress ?? 0, progress_message: item.metadata?.progress_message ?? null, created_at: item.created_at, completed_at: item.metadata?.completed_at ?? null, started_at: item.metadata?.started_at ?? null, raw_ocr_text: item.metadata?.raw_ocr_text ?? null, offers: item.metadata?.offers ?? 0, error: item.metadata?.error ?? null })) as UploadRecord[]; }
  return (await readLocal()).uploads as UploadRecord[];
}

export async function getUpload(id: string): Promise<UploadRecord | null> { const supabase = getAdminSupabase(); if (supabase) { const { data, error } = await supabase.from("flyer_images").select("*").eq("id", id).maybeSingle(); if (error) throw new Error(error.message); if (!data) return null; return { id: data.id, original_name: data.metadata?.original_name ?? data.storage_path, mime_type: data.metadata?.mime_type ?? "image/*", size: data.metadata?.size ?? 0, content_hash: data.image_hash, storage_path: data.storage_path, processed_path: data.metadata?.processed_path ?? null, supermarket_id: data.metadata?.supermarket_id ?? null, publication_id: data.publication_id ?? data.metadata?.publication_id ?? null, source_url: data.metadata?.source_url ?? null, status: data.processing_status, progress: data.metadata?.progress ?? 0, progress_message: data.metadata?.progress_message ?? null, created_at: data.created_at, completed_at: data.metadata?.completed_at ?? null, started_at: data.metadata?.started_at ?? null, raw_ocr_text: data.metadata?.raw_ocr_text ?? null, offers: data.metadata?.offers ?? 0, error: data.metadata?.error ?? null } as UploadRecord; } return ((await readLocal()).uploads.find((upload) => upload.id === id) ?? null) as UploadRecord | null; }

export async function updateUpload(id: string, input: Record<string, unknown>) {
  const supabase = getAdminSupabase();
  if (supabase) { const current = await getUpload(id); if (!current) throw new Error("Upload não encontrado."); const metadata = { original_name: current.original_name, mime_type: current.mime_type, size: current.size, processed_path: current.processed_path, supermarket_id: current.supermarket_id, publication_id: current.publication_id, source_url: current.source_url, raw_ocr_text: current.raw_ocr_text, offers: current.offers, progress: current.progress, progress_message: current.progress_message, completed_at: current.completed_at, started_at: current.started_at, error: current.error, ...input }; const { data, error } = await supabase.from("flyer_images").update({ processing_status: String(input.status ?? current.status), metadata, publication_id: current.publication_id ?? input.publication_id ?? null }).eq("id", id).select("*").single(); if (error) throw new Error(error.message); return data; }
  const store = await readLocal(); const index = store.uploads.findIndex((upload) => upload.id === id);
  if (index < 0) throw new Error("Upload não encontrado.");
  store.uploads[index] = { ...store.uploads[index], ...input }; await writeLocal(store); return store.uploads[index];
}

export async function deleteUpload(id: string) {
  const current = await getUpload(id);
  if (!current) throw new Error("Upload não encontrado.");
  const supabase = getAdminSupabase();
  if (supabase) {
    const { error: offersError } = await supabase.from("offers").delete().eq("flyer_image_id", id);
    if (offersError) throw new Error(offersError.message);
    const storagePaths = [current.storage_path, current.processed_path].filter((value): value is string => Boolean(value));
    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage.from(envStorageBucket()).remove(storagePaths);
      if (storageError) throw new Error(storageError.message);
    }
    const { error } = await supabase.from("flyer_images").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const store = await readLocal();
  store.uploads = store.uploads.filter((upload) => upload.id !== id);
  store.offers = store.offers.filter((offer) => offer.upload_id !== id);
  await writeLocal(store);
  const safeName = String(current.original_name).replace(/[^a-zA-Z0-9._-]/g, "-");
  await Promise.all([
    rm(path.join(dataDir, "uploads", `${id}-${safeName}`), { force: true }),
    rm(path.join(dataDir, "uploads", `${id}-${safeName}.png`), { force: true }),
  ]);
}

export async function addOffers(offers: Offer[]) {
  const supabase = getAdminSupabase();
  if (supabase) {
    const rows = offers.map((offer) => ({ id: offer.id, supermarket_id: offer.supermarket_id, publication_id: offer.publication_id ?? null, flyer_image_id: offer.upload_id ?? null, raw_product_name: offer.product_name, brand: offer.brand, quantity: offer.quantity, unit: offer.unit, price: offer.price, previous_price: offer.previous_price, currency: offer.currency, promotion_conditions: offer.promotion_conditions, valid_until: offer.valid_until, confidence_score: offer.confidence_score, review_status: offer.review_status, source_url: offer.source_url }));
    const { data, error } = await supabase.from("offers").upsert(rows, { onConflict: "id" }).select(); if (error) throw new Error(error.message); return data as Offer[];
  }
  const store = await readLocal();
  for (const offer of offers) {
    const index = store.offers.findIndex((current) => current.id === offer.id);
    if (index >= 0) store.offers[index] = offer;
    else store.offers.push(offer);
  }
  await writeLocal(store); return offers;
}

export async function replaceOffersForUpload(uploadId: string, offers: Offer[]) {
  const supabase = getAdminSupabase();
  if (supabase) {
    const { error: deleteError } = await supabase.from("offers").delete().eq("flyer_image_id", uploadId);
    if (deleteError) throw new Error(deleteError.message);
    if (!offers.length) return [];
    const rows = offers.map((offer) => ({ id: offer.id, supermarket_id: offer.supermarket_id, publication_id: offer.publication_id ?? null, flyer_image_id: uploadId, raw_product_name: offer.product_name, brand: offer.brand, quantity: offer.quantity, unit: offer.unit, price: offer.price, previous_price: offer.previous_price, currency: offer.currency, promotion_conditions: offer.promotion_conditions, valid_until: offer.valid_until, confidence_score: offer.confidence_score, review_status: offer.review_status, source_url: offer.source_url }));
    const { data, error } = await supabase.from("offers").insert(rows).select();
    if (error) throw new Error(error.message);
    return data as Offer[];
  }
  const store = await readLocal();
  store.offers = store.offers.filter((offer) => offer.upload_id !== uploadId);
  store.offers.push(...offers);
  await writeLocal(store);
  return offers;
}

export async function updateOffer(id: string, input: Partial<Offer>) {
  const supabase = getAdminSupabase();
  if (supabase) { const payload = { raw_product_name: input.product_name, brand: input.brand, quantity: input.quantity, unit: input.unit, price: input.price, previous_price: input.previous_price, review_status: input.review_status, approved_at: input.review_status === "approved" ? new Date().toISOString() : null }; const { data, error } = await supabase.from("offers").update(payload).eq("id", id).select().single(); if (error) throw new Error(error.message); return { ...data, product_name: data.raw_product_name } as Offer; }
  const store = await readLocal(); const index = store.offers.findIndex((offer) => offer.id === id); if (index < 0) throw new Error("Oferta não encontrada."); store.offers[index] = { ...store.offers[index], ...input, approved_at: input.review_status === "approved" ? new Date().toISOString() : store.offers[index].approved_at }; await writeLocal(store); return store.offers[index];
}

export async function getOffer(id: string) { return (await listOffers()).find((offer) => offer.id === id) ?? null; }

export async function listPublications(supermarketId?: string): Promise<Publication[]> {
  const supabase = getAdminSupabase();
  if (supabase) {
    let query = supabase.from("publications").select("*").order("published_at", { ascending: false });
    if (supermarketId) query = query.eq("supermarket_id", supermarketId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((item) => ({ ...item, media_urls: Array.isArray(item.media_urls) ? item.media_urls : [] })) as Publication[];
  }
  const items = (await readLocal()).publications ?? [];
  return supermarketId ? items.filter((item) => item.supermarket_id === supermarketId) : items;
}

export async function getPublication(id: string) {
  const supabase = getAdminSupabase();
  if (supabase) {
    const { data, error } = await supabase.from("publications").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? ({ ...data, media_urls: Array.isArray(data.media_urls) ? data.media_urls : [] } as Publication) : null;
  }
  return ((await readLocal()).publications ?? []).find((item) => item.id === id) ?? null;
}

export async function upsertPublications(items: Publication[]) {
  if (!items.length) return [];
  const supabase = getAdminSupabase();
  if (supabase) {
    const rows = items.map((item) => ({ ...item, media_urls: item.media_urls }));
    const { data, error } = await supabase.from("publications").upsert(rows, { onConflict: "supermarket_id,content_hash" }).select();
    if (error) throw new Error(error.message);
    return (data ?? []) as Publication[];
  }
  const store = await readLocal();
  const publications = store.publications ?? [];
  for (const item of items) {
    const index = publications.findIndex((current) => current.supermarket_id === item.supermarket_id && (current.content_hash === item.content_hash || (item.external_id && current.external_id === item.external_id)));
    if (index >= 0) publications[index] = { ...publications[index], ...item };
    else publications.unshift(item);
  }
  store.publications = publications;
  await writeLocal(store);
  return items;
}

export async function createUploadFromBuffer(input: { id: string; original_name: string; mime_type: string; size: number; content_hash: string; storage_path: string; supermarket_id?: string | null; publication_id?: string | null; source_url?: string | null; buffer: Buffer }) {
  const supabase = getAdminSupabase();
  if (supabase) {
    const { error: uploadError } = await supabase.storage.from(envStorageBucket()).upload(input.storage_path, input.buffer, { contentType: input.mime_type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { error } = await supabase.from("flyer_images").insert({ id: input.id, publication_id: input.publication_id ?? null, storage_path: input.storage_path, image_hash: input.content_hash, processing_status: "uploaded", metadata: { original_name: input.original_name, mime_type: input.mime_type, size: input.size, supermarket_id: input.supermarket_id ?? null, publication_id: input.publication_id ?? null, source_url: input.source_url ?? null } });
    if (error) throw new Error(error.message);
    return;
  }
  await mkdir(path.join(dataDir, "uploads"), { recursive: true });
  await writeFile(path.join(dataDir, "uploads", `${input.id}-${input.original_name}`), input.buffer);
  await addUpload({ id: input.id, original_name: input.original_name, mime_type: input.mime_type, size: input.size, content_hash: input.content_hash, storage_path: input.storage_path, processed_path: null, supermarket_id: input.supermarket_id ?? null, publication_id: input.publication_id ?? null, source_url: input.source_url ?? null, status: "uploaded", created_at: new Date().toISOString() });
}

function envStorageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "flyer-images"; }
