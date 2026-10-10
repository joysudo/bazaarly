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
  status: string;
  views: GarmentView[];
  descriptions: GarmentDescriptions;
  descriptions_original?: GarmentDescriptions;
  edited: boolean;
  possible_duplicate_of: string | null;
  model_info: {
    vlm: string;
    prompt_version: string;
    latency_s: number;
    input_tokens: number;
    output_tokens: number;
  };
  approved_at?: string;
  pending_id?: string;
}

export interface CartItem {
  itemId: string;
  price: number;
  title: string;
  imageUrl?: string;
}
