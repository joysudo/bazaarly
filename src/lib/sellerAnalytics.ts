import type { BazaarlyEvent, EventSaleItem, InventoryItem } from './types';

export interface IntelligenceSale {
  id: string;
  eventId: string;
  items: EventSaleItem[];
  itemCount: number;
  grossRevenue: number | null;
  itemsComplete: boolean;
  timestamp: Date | null;
  timestampSource: 'confirmed' | 'recorded' | 'unavailable';
  payment: Record<string, unknown>;
}

export interface ProductPerformance {
  inventoryItemId: string;
  title: string;
  unitsSold: number;
  grossRevenue: number;
  salePrice: number | null;
  imageUrl?: string;
  garmentType?: string;
  mainColors?: string[];
  artwork?: string;
  searchText?: string[];
  status?: InventoryItem['status'];
  currentPrice?: number;
}

export function normalizeConfirmedSale(
  id: string,
  data: Record<string, unknown>,
): IntelligenceSale | null {
  const payment = isRecord(data.payment) ? data.payment : {};
  if (payment.status !== 'confirmed' || typeof data.eventId !== 'string') return null;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.flatMap(value => {
    if (!isRecord(value) || typeof value.inventoryItemId !== 'string') return [];
    if (!isFiniteNumber(value.price) || value.price < 0) return [];
    return [{
      inventoryItemId: value.inventoryItemId,
      title: typeof value.title === 'string' ? value.title : 'Untitled item',
      price: value.price,
    }];
  });
  const rawCount = data.itemCount;
  const itemCount = typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount >= 0
    ? rawCount
    : items.length;
  const rawGross = data.grossRevenue;
  const grossRevenue = isFiniteNumber(rawGross) && rawGross >= 0 ? rawGross : null;
  const confirmedTimestamp = parseDate(payment.confirmed_at);
  const recordedTimestamp = parseDate(data.createdAt);
  const timestamp = confirmedTimestamp ?? recordedTimestamp;

  return {
    id,
    eventId: data.eventId,
    items,
    itemCount,
    grossRevenue,
    itemsComplete: rawItems.length === items.length,
    timestamp,
    timestampSource: confirmedTimestamp ? 'confirmed' : recordedTimestamp ? 'recorded' : 'unavailable',
    payment,
  };
}

export function completedEvents(events: BazaarlyEvent[]): BazaarlyEvent[] {
  return events.filter(event => event.status === 'past');
}

export function eventSales(eventId: string, sales: IntelligenceSale[]): IntelligenceSale[] {
  return sales.filter(sale => sale.eventId === eventId);
}

export function sumRevenue(sales: IntelligenceSale[]): number | null {
  if (sales.some(sale => sale.grossRevenue === null)) return null;
  return roundMoney(sales.reduce((total, sale) => total + (sale.grossRevenue ?? 0), 0));
}

export function sumUnits(sales: IntelligenceSale[]): number {
  return sales.reduce((total, sale) => total + sale.itemCount, 0);
}

export function averageOrderValue(sales: IntelligenceSale[]): number | null {
  if (sales.length === 0) return null;
  const revenue = sumRevenue(sales);
  return revenue === null ? null : roundMoney(revenue / sales.length);
}

export function productPerformance(
  sales: IntelligenceSale[],
  inventory: InventoryItem[],
): ProductPerformance[] {
  const inventoryById = new Map(inventory.map(item => [item.id, item]));
  const products = new Map<string, ProductPerformance>();

  for (const sale of sales) {
    for (const soldItem of sale.items) {
      const current = inventoryById.get(soldItem.inventoryItemId);
      const product = products.get(soldItem.inventoryItemId) ?? {
        inventoryItemId: soldItem.inventoryItemId,
        title: soldItem.title || current?.title || 'Untitled item',
        unitsSold: 0,
        grossRevenue: 0,
        salePrice: soldItem.price,
        imageUrl: current?.imageUrl,
        garmentType: current?.garmentType,
        mainColors: current?.mainColors,
        artwork: current?.artwork,
        searchText: current?.searchText,
        status: current?.status,
        currentPrice: current?.price,
      };
      product.unitsSold += 1;
      product.grossRevenue = roundMoney(product.grossRevenue + soldItem.price);
      products.set(soldItem.inventoryItemId, product);
    }
  }

  return [...products.values()];
}

export function saleIntegrityIssues(sales: IntelligenceSale[]): number {
  return sales.filter(sale => {
    if (!sale.itemsComplete || sale.items.length !== sale.itemCount) return true;
    if (sale.grossRevenue === null || sale.items.length === 0) return false;
    const itemTotal = roundMoney(sale.items.reduce((total, item) => total + item.price, 0));
    return itemTotal !== roundMoney(sale.grossRevenue);
  }).length;
}

export function eventRevenueMismatch(event: BazaarlyEvent, sales: IntelligenceSale[]): number | null {
  const recordedRevenue = sumRevenue(sales);
  if (recordedRevenue === null || !isFiniteNumber(event.grossRevenue)) return null;
  return roundMoney(event.grossRevenue - recordedRevenue);
}

export function groupBreakdown(
  products: ProductPerformance[],
  key: 'garmentType' | 'mainColors',
): Array<{ label: string; unitsSold: number; grossRevenue: number }> {
  const groups = new Map<string, { label: string; unitsSold: number; grossRevenue: number }>();
  for (const product of products) {
    const values = key === 'garmentType'
      ? [product.garmentType?.trim() || 'Uncategorized']
      : product.mainColors?.length ? product.mainColors : ['Unknown color'];
    for (const rawLabel of values) {
      const normalized = rawLabel.trim().toLocaleLowerCase() || (key === 'garmentType' ? 'uncategorized' : 'unknown color');
      const label = groups.get(normalized)?.label ?? (normalized === 'uncategorized'
        ? 'Uncategorized'
        : normalized === 'unknown color' ? 'Unknown color' : rawLabel.trim());
      const group = groups.get(normalized) ?? { label, unitsSold: 0, grossRevenue: 0 };
      group.unitsSold += product.unitsSold;
      group.grossRevenue = roundMoney(group.grossRevenue + product.grossRevenue);
      groups.set(normalized, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.grossRevenue - a.grossRevenue);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
