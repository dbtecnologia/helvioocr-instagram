export type ReviewStatus = "pending" | "needs_review" | "approved" | "rejected";

export type Supermarket = {
  id: string;
  name: string;
  instagram_handle: string;
  instagram_url: string;
  city: string;
  neighborhood: string;
  address?: string;
  network?: string;
  active: boolean;
  market_type: "own" | "competitor";
  monitoring_enabled?: boolean;
  monitoring_frequency?: "minute" | "daily" | "weekly" | "manual" | string;
  notes?: string;
  created_at: string;
  updated_at: string;
  last_collection_at?: string | null;
  flyer_count?: number;
};

export type Offer = {
  id: string;
  upload_id?: string | null;
  publication_id?: string | null;
  supermarket_id: string;
  supermarket_name?: string;
  product_name: string;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price: number;
  previous_price?: number | null;
  unit_price?: number | null;
  currency: "BRL";
  confidence_score: number;
  review_status: ReviewStatus;
  approved_at?: string | null;
  published_at?: string | null;
  valid_until?: string | null;
  source_url?: string | null;
  category?: string | null;
  promotion_conditions?: string | null;
  raw_ocr_text?: string | null;
  extracted_at?: string | null;
};

export type UploadRecord = {
  id: string;
  original_name: string;
  mime_type: string;
  size: number;
  content_hash: string;
  storage_path: string;
  processed_path?: string | null;
  supermarket_id?: string | null;
  publication_id?: string | null;
  source_url?: string | null;
  status: string;
  progress?: number;
  progress_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  started_at?: string | null;
  raw_ocr_text?: string | null;
  offers?: number;
  error?: string | null;
};

export type Publication = {
  id: string;
  supermarket_id: string;
  external_id?: string | null;
  source_url?: string | null;
  published_at?: string | null;
  collected_at: string;
  caption?: string | null;
  content_hash: string;
  media_urls: string[];
  media_type?: string | null;
};

export type DashboardData = {
  supermarkets: number;
  flyers: number;
  products: number;
  approved: number;
  pending: number;
  errors: number;
  ai_cost: number;
  last_update?: string | null;
  lowest_prices: Offer[];
  recent_supermarkets: Supermarket[];
};
