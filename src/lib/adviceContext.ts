import type { BazaarlyEvent, InventoryItem } from './types';
import {
  averageOrderValue,
  eventSales,
  groupBreakdown,
  normalizeConfirmedSale,
  productPerformance,
  roundMoney,
  sumRevenue,
  sumUnits,
  type IntelligenceSale,
} from './sellerAnalytics';

// Raw Firestore documents for one event, as loaded by the chat panel.
export interface RawEventData {
  inventory: InventoryItem[];
  sales: Array<{ id: string } & Record<string, unknown>>;
}

interface Slice { label: string; units: number; revenue: number }

export interface EventAdviceSummary {
  id: string;
  name: string;
  date: string;
  status: BazaarlyEvent['status'];
  vendorFee: number;
  sales: {
    orders: number;
    units: number;
    revenue: number | null;
    revenueAfterVendorFee: number | null; // not profit: other costs are not included
    averageOrderValue: number | null;
  };
  sellThrough: number | null;             // 0..1, items sold / items assigned to the event
  itemsAssigned: number;
  topProducts: Array<{ title: string; units: number; revenue: number; garmentType?: string }>;
  byGarmentType: Slice[];
  byColor: Slice[];
  revenueByHour: Array<{ hour: string; revenue: number; orders: number }>;
  unsoldItems: Array<{ title: string; price: number; garmentType?: string }>;
  dataNotes: string[];
}

export interface AdviceContext {
  generatedAt: string;
  focusEventId: string | null;
  events: EventAdviceSummary[];
}

const MAX_EVENTS = 6;
const MAX_BYTES = 28_000; // the server rejects anything over 30 KB

export function buildAdviceContext(
  events: BazaarlyEvent[],
  data: Record<string, RawEventData>,
  focusEventId: string | null,
): AdviceContext {
  const chosen = pickEvents(events, focusEventId);
  const summaries = chosen.map(event =>
    summarizeEvent(event, data[event.id] ?? { inventory: [], sales: [] }, event.id === focusEventId),
  );
  return fitToBudget({ generatedAt: new Date().toISOString(), focusEventId, events: summaries }, focusEventId);
}

/** The focus event plus the most recent past events, newest first. */
export function pickEvents(events: BazaarlyEvent[], focusEventId: string | null): BazaarlyEvent[] {
  const byDateDesc = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const focus = byDateDesc.find(event => event.id === focusEventId);
  const past = byDateDesc.filter(event => event.status === 'past' && event.id !== focusEventId);
  const upcoming = byDateDesc.filter(event => event.status === 'upcoming' && event.id !== focusEventId);
  const rest = focus ? [focus, ...past] : [...past, ...upcoming];
  return rest.slice(0, MAX_EVENTS);
}

function summarizeEvent(event: BazaarlyEvent, raw: RawEventData, isFocus: boolean): EventAdviceSummary {
  const normalized = raw.sales.map(sale => normalizeConfirmedSale(sale.id, sale));
  const skipped = normalized.filter(sale => sale === null).length;
  const sales = eventSales(event.id, normalized.filter((sale): sale is IntelligenceSale => sale !== null));

  const revenue = sumRevenue(sales);
  const products = productPerformance(sales, raw.inventory);
  const soldCount = raw.inventory.filter(item => item.status === 'sold').length;
  const sellable = raw.inventory.filter(item => item.status !== 'discarded');
  const vendorFee = Number.isFinite(event.vendorFee) ? event.vendorFee : 0;

  const notes: string[] = [];
  if (skipped > 0) notes.push(`${skipped} sale record(s) were not confirmed and are ignored.`);
  if (sales.some(sale => sale.grossRevenue === null)) notes.push('Some sales have no recorded revenue, so totals may be incomplete.');
  if (sales.some(sale => !sale.itemsComplete)) notes.push('Some sales have incomplete item lists.');
  if (sales.length === 0) notes.push(event.status === 'upcoming' ? 'Upcoming event: no sales yet.' : 'No confirmed sales recorded.');
  if (sales.length > 0 && sales.length < 5) notes.push('Very few sales, so patterns are weak.');

  return {
    id: event.id,
    name: event.name,
    date: event.date,
    status: event.status,
    vendorFee,
    sales: {
      orders: sales.length,
      units: sumUnits(sales),
      revenue,
      revenueAfterVendorFee: revenue === null ? null : roundMoney(revenue - vendorFee),
      averageOrderValue: averageOrderValue(sales),
    },
    sellThrough: sellable.length > 0 ? roundMoney(soldCount / sellable.length) : null,
    itemsAssigned: sellable.length,
    topProducts: [...products]
      .sort((a, b) => b.grossRevenue - a.grossRevenue)
      .slice(0, 5)
      .map(p => ({ title: p.title, units: p.unitsSold, revenue: p.grossRevenue, garmentType: p.garmentType })),
    byGarmentType: toSlices(groupBreakdown(products, 'garmentType')),
    byColor: toSlices(groupBreakdown(products, 'mainColors')),
    revenueByHour: revenueByHour(sales),
    unsoldItems: raw.inventory
      .filter(item => item.status !== 'sold' && item.status !== 'discarded')
      .sort((a, b) => b.price - a.price)
      .slice(0, isFocus ? 20 : 8)
      .map(item => ({ title: item.title, price: item.price, garmentType: item.garmentType })),
    dataNotes: notes,
  };
}

function toSlices(groups: ReturnType<typeof groupBreakdown>): Slice[] {
  return groups.slice(0, 6).map(g => ({ label: g.label, units: g.unitsSold, revenue: g.grossRevenue }));
}

function revenueByHour(sales: IntelligenceSale[]) {
  const hours = new Map<number, { revenue: number; orders: number }>();
  for (const sale of sales) {
    if (!sale.timestamp || sale.grossRevenue === null) continue;
    const hour = sale.timestamp.getHours(); // browser-local time, which matches the vendor's market
    const slot = hours.get(hour) ?? { revenue: 0, orders: 0 };
    slot.revenue = roundMoney(slot.revenue + sale.grossRevenue);
    slot.orders += 1;
    hours.set(hour, slot);
  }
  return [...hours.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, slot]) => ({ hour: `${String(hour).padStart(2, '0')}:00`, ...slot }));
}

/** Keep the payload under the server's cap by trimming the least important detail first. */
function fitToBudget(context: AdviceContext, focusEventId: string | null): AdviceContext {
  const size = () => new Blob([JSON.stringify(context)]).size;
  if (size() <= MAX_BYTES) return context;

  for (const event of context.events) {
    if (event.id !== focusEventId) event.unsoldItems = [];
  }
  while (size() > MAX_BYTES && context.events.length > 1) {
    const dropAt = context.events.length - 1;
    if (context.events[dropAt].id === focusEventId) break;
    context.events.pop();
  }
  for (const event of context.events) {
    if (size() <= MAX_BYTES) break;
    event.byColor = [];
    event.revenueByHour = [];
  }
  return context;
}
