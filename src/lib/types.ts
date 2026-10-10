export interface BazaarlyEvent {
  id: string;
  name: string;
  date: string;
  description: string;
  vendorFee: number;
  status: 'upcoming' | 'past';
  inventoryIds: string[];
  grossRevenue: number;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  serviceItemId: string;
  eventId?: string | null;
  price: number;
  status: 'pending' | 'approved' | 'sold' | 'discarded';
  imageUrl: string;
  overview: string;
  title: string;
  createdAt: string;
}

export interface EventSaleItem {
  inventoryItemId: string;
  title: string;
  price: number;
}

export interface EventSale {
  id: string;
  eventId: string;
  items: EventSaleItem[];
  itemCount: number;
  grossRevenue: number;
  createdAt: string;
  payment: EventSalePayment;
}

export interface EventSalePayment {
  method: 'solana_pay';
  network: 'devnet';
  status: 'confirmed';
  amount_sol: number;
  merchant_wallet: string;
  reference: string;
  signature: string;
  confirmed_at: string;
}

export interface GarmentView {
  view_id: string;
  path: string;
  label: string;
}

export interface GarmentDescriptions {
  overview: string;
  sections: Record<string, string>;
  full_description: string;
  not_visible: string[];
}

export interface GarmentItem {
  schema_version: string;
  item_id: string;
  session_id: string;
  scanned_at: string;
  status: 'processing' | 'ready' | 'approved' | 'discarded' | 'error';
  descriptions: GarmentDescriptions | null;            // null until the description is ready
  descriptions_original?: GarmentDescriptions | null;
  model_info?: {                                        // only exists after a successful description
    vlm: string;
    prompt_version: string;
    latency_s: number;
    input_tokens: number | null;
    output_tokens: number | null;
  };
  error?: string;                                       // set when status === 'error'
  views: GarmentView[];
  // descriptions: GarmentDescriptions;
  // descriptions_original?: GarmentDescriptions;
  edited: boolean;
  possible_duplicate_of: string | null;
  // model_info: {
  //   vlm: string;
  //   prompt_version: string;
  //   latency_s: number;
  //   input_tokens: number;
  //   output_tokens: number;
  // };
  approved_at?: string;
  pending_id?: string;
}

export interface CartItem {
  itemId: string;
  price: number;
  title: string;
  imageUrl?: string;
}

export type Highlight = {
  bbox: [number, number, number, number];   // x, y, w, h, 0-1 of the frame
  outline: [number, number][];              // polygon points, 0-1 of the frame
};

// What POST /scan/frame returns. Switch on `result`.
export type ScanResult =
  | { result: 'new_item'; item_id: string; status: 'processing'; highlight: Highlight }
  | { result: 'awaiting_approval'; item_id: string }
  | { result: 'duplicate_pending'; pending_id: string; similarity: number; highlight: Highlight;
      existing_item: { item_id: string; image_url: string; overview: string | null } }
  | { result: 'awaiting_user'; pending_id: string; highlight: Highlight }
  | { result: 'suppressed'; possible_duplicate_of: string; highlight: Highlight }
  | { result: 'rejected'; reason: 'blurry'; blur_score: number }
  | { result: 'no_garment' }
  | { result: 'cooldown' };

export type ResolveResult =
  | { result: 'dismissed' }
  | { result: 'new_item'; item_id: string; status: 'processing'; possible_duplicate_of: string };

export interface EchoResult {
  ok: boolean;
  content_type: string | null;
  expected: Record<string, string>;
  received: Record<string, unknown>;
  missing: string[];
  wrong_kind: string[];
  unexpected: string[];
}
