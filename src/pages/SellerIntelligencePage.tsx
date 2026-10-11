import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BazaarlyEvent, InventoryItem } from '../lib/types';
import {
  averageOrderValue,
  completedEvents,
  eventRevenueMismatch,
  eventSales,
  groupBreakdown,
  normalizeConfirmedSale,
  productPerformance,
  saleIntegrityIssues,
  sumRevenue,
  sumUnits,
  type IntelligenceSale,
  type ProductPerformance,
} from '../lib/sellerAnalytics';
import './SellerIntelligencePage.css';

type IntelligenceView = 'overview' | 'events' | 'inventory' | 'sales' | 'debrief';
type DatePreset = 'all' | '30' | '90' | 'custom';
type EventSort = 'gross' | 'units' | 'aov' | 'afterFee';
type ProductSort = 'gross' | 'units' | 'title';

interface DashboardData {
  events: BazaarlyEvent[];
  inventory: InventoryItem[];
  sales: IntelligenceSale[];
}

interface DateRange {
  from: string;
  to: string;
}

const tabs: Array<{ id: Exclude<IntelligenceView, 'debrief'>; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'events', label: 'Events' },
  { id: 'inventory', label: 'Inventory insights' },
  { id: 'sales', label: 'Sales' },
];

export function SellerIntelligencePage() {
  const [data, setData] = useState<DashboardData>({ events: [], inventory: [], sales: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [view, setView] = useState<IntelligenceView>('overview');
  const [previousView, setPreviousView] = useState<Exclude<IntelligenceView, 'debrief'>>('events');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [eventSort, setEventSort] = useState<EventSort>('gross');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryType, setInventoryType] = useState('all');
  const [inventoryColor, setInventoryColor] = useState('all');
  const [inventoryStatus, setInventoryStatus] = useState('all');
  const [priceLimit, setPriceLimit] = useState('');
  const [productSort, setProductSort] = useState<ProductSort>('gross');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [salesSearch, setSalesSearch] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocs(collection(db, 'events')),
      getDocs(collection(db, 'inventory')),
      getDocs(collection(db, 'sales')),
    ])
      .then(([eventSnapshot, inventorySnapshot, saleSnapshot]) => {
        if (!active) return;
        setData({
          events: eventSnapshot.docs.map(document => ({ id: document.id, ...document.data() } as BazaarlyEvent)),
          inventory: inventorySnapshot.docs.map(document => ({ id: document.id, ...document.data() } as InventoryItem)),
          sales: saleSnapshot.docs.flatMap(document => {
            const sale = normalizeConfirmedSale(document.id, document.data());
            return sale ? [sale] : [];
          }),
        });
        setLoadError('');
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load seller analytics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [refreshToken]);

  const pastEvents = useMemo(() => completedEvents(data.events), [data.events]);
  const eventById = useMemo(() => new Map(data.events.map(event => [event.id, event])), [data.events]);
  const selectedEvent = selectedEventId ? eventById.get(selectedEventId) ?? null : null;
  const range = useMemo(
    () => getDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );
  const rangedEvents = useMemo(
    () => pastEvents.filter(event => isInDateRange(event.date, range)),
    [pastEvents, range],
  );
  const rangedEventIds = useMemo(() => new Set(rangedEvents.map(event => event.id)), [rangedEvents]);
  const rangedSales = useMemo(
    () => data.sales.filter(sale => rangedEventIds.has(sale.eventId)),
    [data.sales, rangedEventIds],
  );

  const openEvent = (eventId: string, returnTo: Exclude<IntelligenceView, 'debrief'> = 'events') => {
    setPreviousView(returnTo);
    setSelectedEventId(eventId);
    setView('debrief');
    setSelectedProductId(null);
  };

  const changeView = (nextView: IntelligenceView) => {
    setView(nextView);
    if (nextView !== 'debrief') setSelectedEventId(null);
    setSelectedProductId(null);
  };

  if (loading) {
    return (
      <main className="intel-page" aria-busy="true">
        <div className="intel-heading">
          <p className="intel-eyebrow">BAZAARLY · SELLER TOOLS</p>
          <h1>Seller Intelligence</h1>
          <p>Understand your sales. Learn from every market.</p>
        </div>
        <div className="intel-loading" role="status">Loading your event and sales data…</div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="intel-page">
        <div className="intel-heading">
          <p className="intel-eyebrow">BAZAARLY · SELLER TOOLS</p>
          <h1>Seller Intelligence</h1>
        </div>
        <div className="intel-panel intel-error" role="alert">
          <strong>Analytics could not be loaded.</strong>
          <p>{loadError}</p>
          <button className="intel-button intel-button-primary" onClick={() => setRefreshToken(token => token + 1)}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const currentEventSales = selectedEvent ? eventSales(selectedEvent.id, data.sales) : [];

  return (
    <main className="intel-page">
      {view === 'debrief' && selectedEvent ? (
        <EventDebrief
          event={selectedEvent}
          sales={currentEventSales}
          inventory={data.inventory}
          onBack={() => changeView(previousView)}
          backLabel={previousView === 'sales' ? '← Confirmed sales' : previousView === 'inventory' ? '← Inventory insights' : '← Completed events'}
          onOpenInventory={(productId) => {
            setSelectedProductId(productId);
            setView('inventory');
          }}
          onOpenSales={() => {
            setSalesSearch(selectedEvent.name);
            setView('sales');
          }}
        />
      ) : (
        <>
          <div className="intel-heading">
            <div>
              <p className="intel-eyebrow">BAZAARLY · SELLER TOOLS</p>
              <h1>Seller Intelligence</h1>
              <p>Understand your sales. Learn from every market.</p>
            </div>
            <button className="intel-button" onClick={() => setRefreshToken(token => token + 1)}>
              Refresh data
            </button>
          </div>

          <div className="intel-tabs" role="tablist" aria-label="Seller Intelligence sections">
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={view === tab.id}
                className={`intel-tab${view === tab.id ? ' is-active' : ''}`}
                onClick={() => changeView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {view === 'overview' && (
            <Overview
              events={rangedEvents}
              sales={rangedSales}
              inventory={data.inventory}
              allEvents={pastEvents}
              datePreset={datePreset}
              customFrom={customFrom}
              customTo={customTo}
              onDatePresetChange={setDatePreset}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              onOpenEvent={openEvent}
              onBrowseEvents={() => changeView('events')}
              onOpenInventory={() => changeView('inventory')}
            />
          )}
          {view === 'events' && (
            <EventsDirectory
              events={pastEvents}
              sales={data.sales}
              search={eventSearch}
              sort={eventSort}
              compareIds={compareIds}
              onSearch={setEventSearch}
              onSort={setEventSort}
              onCompare={setCompareIds}
              onOpenEvent={openEvent}
            />
          )}
          {view === 'inventory' && (
            <InventoryInsights
              inventory={data.inventory}
              events={data.events}
              sales={data.sales}
              search={inventorySearch}
              garmentType={inventoryType}
              color={inventoryColor}
              status={inventoryStatus}
              priceLimit={priceLimit}
              sort={productSort}
              selectedProductId={selectedProductId}
              onSearch={setInventorySearch}
              onType={setInventoryType}
              onColor={setInventoryColor}
              onStatus={setInventoryStatus}
              onPriceLimit={setPriceLimit}
              onSort={setProductSort}
              onSelectProduct={setSelectedProductId}
              onOpenEvent={(eventId) => openEvent(eventId, 'inventory')}
            />
          )}
          {view === 'sales' && (
            <SalesLedger
              sales={data.sales}
              events={data.events}
              search={salesSearch}
              selectedSaleId={selectedSaleId}
              onSearch={setSalesSearch}
              onSelectSale={setSelectedSaleId}
              onOpenEvent={(eventId) => openEvent(eventId, 'sales')}
            />
          )}
        </>
      )}
      <p className="intel-demo-note">
        Sales shown are confirmed Bazaarly records. Payments currently use Solana Devnet and a fixed demo amount;
        recorded USD item prices are not a measure of real-world crypto payment volume.
      </p>
    </main>
  );
}

function Overview({
  events,
  sales,
  inventory,
  allEvents,
  datePreset,
  customFrom,
  customTo,
  onDatePresetChange,
  onCustomFromChange,
  onCustomToChange,
  onOpenEvent,
  onBrowseEvents,
  onOpenInventory,
}: {
  events: BazaarlyEvent[];
  sales: IntelligenceSale[];
  inventory: InventoryItem[];
  allEvents: BazaarlyEvent[];
  datePreset: DatePreset;
  customFrom: string;
  customTo: string;
  onDatePresetChange: (preset: DatePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onOpenEvent: (eventId: string) => void;
  onBrowseEvents: () => void;
  onOpenInventory: () => void;
}) {
  const [sort, setSort] = useState<EventSort>('gross');
  const gross = sumRevenue(sales);
  const units = sumUnits(sales);
  const feesComplete = events.every(event => isValidFee(event.vendorFee));
  const fees = events.reduce((total, event) => total + (isValidFee(event.vendorFee) ? event.vendorFee : 0), 0);
  const ordersWithUnknownGross = sales.filter(sale => sale.grossRevenue === null).length;
  const eventRows = useMemo(() => events.map(event => ({
    event,
    sales: eventSales(event.id, sales),
  })), [events, sales]).map(row => ({
    ...row,
    gross: sumRevenue(row.sales),
    units: sumUnits(row.sales),
    aov: averageOrderValue(row.sales),
    afterFee: sumRevenue(row.sales) === null || !isValidFee(row.event.vendorFee)
      ? null
      : (sumRevenue(row.sales) ?? 0) - row.event.vendorFee,
  }));
  const ranked = [...eventRows].sort((a, b) => compareEventMetric(a, b, sort));
  const maxMetric = Math.max(1, ...ranked.map(row => Math.max(0, metricNumber(row, sort))));
  const categoryBreakdown = groupBreakdown(productPerformance(sales, inventory), 'garmentType');
  const insight = getTakeaway(events, sales, inventory);
  const recent = [...eventRows].sort((a, b) => dateValue(b.event.date) - dateValue(a.event.date)).slice(0, 3);
  const revenueMismatches = events.filter(event => {
    const difference = eventRevenueMismatch(event, eventSales(event.id, sales));
    return difference !== null && Math.abs(difference) >= 0.01;
  }).length;
  const itemIntegrityIssues = saleIntegrityIssues(sales);

  return (
    <div className="intel-content">
      <div className="intel-section-heading intel-heading-row">
        <div>
          <h2>Business overview</h2>
          <p>Completed-event performance, grounded in confirmed sales.</p>
        </div>
        <div className="intel-period-control">
          <label className="sr-only" htmlFor="intel-date-range">Filter by event date</label>
          <select id="intel-date-range" value={datePreset} onChange={event => onDatePresetChange(event.target.value as DatePreset)}>
            <option value="all">All time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
          {datePreset === 'custom' && (
            <div className="intel-date-inputs">
              <label>From <input type="date" value={customFrom} onChange={event => onCustomFromChange(event.target.value)} /></label>
              <label>To <input type="date" value={customTo} onChange={event => onCustomToChange(event.target.value)} /></label>
            </div>
          )}
          <span>Range uses event dates</span>
        </div>
      </div>

      {allEvents.length === 0 ? (
        <EmptyState
          title="Your event story starts here"
          body="Once an event is marked complete and has confirmed sales, you’ll see its financial and product performance here."
        />
      ) : events.length === 0 ? (
        <EmptyState title="No completed events in this range" body="Try a wider date range or choose All time." />
      ) : (
        <>
          <div className="intel-stat-grid">
            <StatCard label="Gross sales" value={gross === null ? 'Incomplete' : money(gross)} detail="Sum of confirmed sale records" />
            <StatCard label="Items sold" value={units.toLocaleString()} detail="Units recorded on confirmed orders" />
            <StatCard label="Average order" value={averageOrderValue(sales) === null ? '—' : money(averageOrderValue(sales)!)} detail="Gross sales ÷ confirmed orders" />
            <StatCard label="Vendor fees" value={feesComplete ? money(fees) : 'Incomplete'} detail="Fees for completed events in range" />
          </div>
          {ordersWithUnknownGross > 0 && (
            <p className="intel-integrity-note" role="status">
              {ordersWithUnknownGross} confirmed sale record(s) have no valid USD total and are omitted from gross-sales calculations.
            </p>
          )}
          {(revenueMismatches > 0 || itemIntegrityIssues > 0) && (
            <p className="intel-integrity-note" role="status">
              {revenueMismatches > 0 && `${revenueMismatches} event running total(s) do not match their confirmed sales sum. `}
              {itemIntegrityIssues > 0 && `${itemIntegrityIssues} sale record(s) do not reconcile to their item snapshots. `}
              Analytics use confirmed sale records; event running revenue is only a reconciliation check.
            </p>
          )}
          {sales.length === 0 && (
            <p className="intel-muted-note">No confirmed sales are recorded for these completed events yet. Revenue and order averages are unavailable.</p>
          )}

          <div className="intel-overview-grid">
            <section className="intel-panel">
              <div className="intel-section-heading intel-heading-row">
                <div><h2>Event performance</h2><p>Compare completed markets by a consistent metric.</p></div>
                <label className="intel-sort-label">
                  Rank by
                  <select value={sort} onChange={event => setSort(event.target.value as EventSort)}>
                    <option value="gross">Gross sales</option>
                    <option value="units">Items sold</option>
                    <option value="aov">Average order</option>
                    <option value="afterFee">Gross less vendor fee</option>
                  </select>
                </label>
              </div>
              <div className="intel-ranking">
                {ranked.slice(0, 6).map((row, index) => {
                  const value = metricNumber(row, sort);
                  return (
                    <button className="intel-rank-row" key={row.event.id} onClick={() => onOpenEvent(row.event.id)}>
                      <span className="intel-rank-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="intel-rank-main">
                        <span className="intel-rank-title">{row.event.name}</span>
                        <span className="intel-rank-meta">
                          {formatDate(row.event.date)} · {row.units} item{row.units === 1 ? '' : 's'} · fee {moneyOrDash(row.event.vendorFee)}
                        </span>
                        <span className="intel-bar-track"><span style={{ width: `${value <= 0 ? 0 : Math.max(2, Math.min(100, value / maxMetric * 100))}%` }} /></span>
                      </span>
                      <strong className="intel-rank-value">{formatMetric(row, sort)}</strong>
                    </button>
                  );
                })}
              </div>
              <button className="intel-text-link" onClick={onBrowseEvents}>See all completed events →</button>
            </section>

            <section className="intel-panel intel-takeaway-panel">
              <p className="intel-eyebrow">A useful signal</p>
              <h2>{insight.title}</h2>
              <p>{insight.body}</p>
              {insight.action === 'inventory' ? (
                <button className="intel-text-link" onClick={onOpenInventory}>Explore product performance →</button>
              ) : insight.action === 'event' && insight.eventId ? (
                <button className="intel-text-link" onClick={() => onOpenEvent(insight.eventId!)}>Open event debrief →</button>
              ) : null}
              {categoryBreakdown.length > 0 && (
                <div className="intel-mini-category">
                  <span>Top garment type · item snapshot sales</span>
                  <strong>{categoryBreakdown[0].label}</strong>
                  <small>{money(categoryBreakdown[0].grossRevenue)} across {categoryBreakdown[0].unitsSold} sold item(s)</small>
                </div>
              )}
            </section>
          </div>

          <section className="intel-panel">
            <div className="intel-section-heading intel-heading-row">
              <div><h2>Recent completed events</h2><p>Quick links to the latest event debriefs.</p></div>
              <button className="intel-text-link" onClick={onBrowseEvents}>All events →</button>
            </div>
            <div className="intel-recent-list">
              {recent.map(row => (
                <button className="intel-recent-row" key={row.event.id} onClick={() => onOpenEvent(row.event.id)}>
                  <span><strong>{row.event.name}</strong><small>{formatDate(row.event.date)}</small></span>
                  <span><small>Gross sales</small><strong>{row.gross === null ? '—' : money(row.gross)}</strong></span>
                  <span><small>Items sold</small><strong>{row.units}</strong></span>
                  <span><small>Vendor fee</small><strong>{moneyOrDash(row.event.vendorFee)}</strong></span>
                  <span className="intel-row-arrow">Debrief ↗</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EventDebrief({
  event,
  sales,
  inventory,
  onBack,
  backLabel,
  onOpenInventory,
  onOpenSales,
}: {
  event: BazaarlyEvent;
  sales: IntelligenceSale[];
  inventory: InventoryItem[];
  onBack: () => void;
  backLabel: string;
  onOpenInventory: (productId: string) => void;
  onOpenSales: () => void;
}) {
  const gross = sumRevenue(sales);
  const units = sumUnits(sales);
  const products = productPerformance(sales, inventory).sort((a, b) => b.grossRevenue - a.grossRevenue);
  const categories = groupBreakdown(products, 'garmentType');
  const mismatch = eventRevenueMismatch(event, sales);
  const integrityIssues = saleIntegrityIssues(sales);
  const takeaway = getEventTakeaway(event, sales, products);

  return (
    <div className="intel-content">
      <button className="intel-back-link" onClick={onBack}>{backLabel}</button>
      <header className="intel-event-heading">
        <div>
          <p className="intel-eyebrow">{event.status === 'past' ? 'EVENT DEBRIEF' : 'EVENT SALES SUMMARY'} · {formatDate(event.date)}</p>
          <h1>{event.name}</h1>
          {event.description && <p>{event.description}</p>}
        </div>
        <span className="intel-status-pill">{event.status === 'past' ? 'Completed event' : 'Upcoming event'}</span>
      </header>

      <div className="intel-stat-grid intel-debrief-stats">
        <StatCard label="Gross revenue" value={gross === null ? 'Incomplete' : money(gross)} detail="Sum of confirmed sale records" />
        <StatCard label="Orders" value={sales.length.toLocaleString()} detail="One record per confirmed checkout" />
        <StatCard label="Items sold" value={units.toLocaleString()} detail="Units recorded on sale records" />
        <StatCard label="Average order" value={averageOrderValue(sales) === null ? '—' : money(averageOrderValue(sales)!)} detail="Gross revenue ÷ confirmed orders" />
      </div>
      {sales.length === 0 && (
        <p className="intel-muted-note">No confirmed sales are recorded for this event. Current inventory assignment is not used to estimate original stock or sell-through.</p>
      )}

      <section className="intel-panel">
        <div className="intel-section-heading">
          <h2>Sales over time</h2>
          <p>Cumulative confirmed USD sale totals by confirmation timestamp. This is transaction timing, not attendance.</p>
        </div>
        <RevenueTimeline sales={sales} />
      </section>

      <div className="intel-overview-grid">
        <section className="intel-panel">
          <div className="intel-section-heading"><h2>What sold?</h2><p>Prices are taken from each confirmed sale snapshot.</p></div>
          {products.length === 0 ? (
            <p className="intel-empty-inline">Product-level sales will appear when confirmed orders include item snapshots.</p>
          ) : (
            <div className="intel-product-list">
              {products.slice(0, 8).map(product => (
                <ProductRow
                  key={product.inventoryItemId}
                  product={product}
                  onClick={() => onOpenInventory(product.inventoryItemId)}
                />
              ))}
            </div>
          )}
          <button className="intel-text-link" onClick={onOpenSales}>View supporting sales records →</button>
        </section>

        <section className="intel-panel">
          <div className="intel-section-heading"><h2>Category mix</h2><p>Garment type · share of item-snapshot gross sales</p></div>
          <BreakdownList groups={categories} total={products.reduce((sum, product) => sum + product.grossRevenue, 0)} metric="revenue" />
          {categories.length === 0 && <p className="intel-empty-inline">No product category metadata is available for these sales.</p>}
        </section>
      </div>

      <section className="intel-financial-panel">
        <div>
          <p className="intel-eyebrow">EVENT FINANCIAL SUMMARY</p>
          <h2>Revenue after vendor fee</h2>
          <p>This is gross recorded sales minus the recorded vendor fee, not profit or ROI.</p>
        </div>
        <div className="intel-financial-values">
          <div><small>Gross revenue</small><strong>{gross === null ? 'Incomplete' : money(gross)}</strong></div>
          <span aria-hidden="true">−</span>
          <div><small>Vendor fee</small><strong>{moneyOrUnavailableFee(event.vendorFee)}</strong></div>
          <span aria-hidden="true">=</span>
          <div><small>After vendor fee</small><strong>{gross === null || !isValidFee(event.vendorFee) ? 'Unavailable' : money(gross - event.vendorFee)}</strong></div>
        </div>
        {isValidFee(event.vendorFee) && event.vendorFee > 0 && gross !== null && (
          <p className="intel-coverage">
            Gross sales were {(gross / event.vendorFee).toFixed(2)}× the vendor fee. This is fee coverage, not a profit margin.
          </p>
        )}
        {isValidFee(event.vendorFee) && event.vendorFee === 0 && <p className="intel-coverage">Vendor-fee coverage is unavailable because the recorded fee is $0.00.</p>}
      </section>

      {takeaway && (
        <section className="intel-panel intel-takeaway-panel">
          <p className="intel-eyebrow">WHAT THIS EVENT TELLS YOU</p>
          <h2>{takeaway.title}</h2>
          <p>{takeaway.body}</p>
          {takeaway.productId && (
            <button className="intel-text-link" onClick={() => onOpenInventory(takeaway.productId!)}>
              Inspect supporting product →
            </button>
          )}
        </section>
      )}

      {(mismatch !== null && Math.abs(mismatch) >= 0.01 || integrityIssues > 0) && (
        <section className="intel-integrity-note" role="status">
          <strong>Some records need reconciliation.</strong>
          {mismatch !== null && Math.abs(mismatch) >= 0.01 && (
            <span> Event running revenue differs from the confirmed sales sum by {money(mismatch)}; analytics use the confirmed sales records.</span>
          )}
          {integrityIssues > 0 && <span> {integrityIssues} sale record(s) do not reconcile to their item price snapshots.</span>}
        </section>
      )}
    </div>
  );
}

function EventsDirectory({
  events,
  sales,
  search,
  sort,
  compareIds,
  onSearch,
  onSort,
  onCompare,
  onOpenEvent,
}: {
  events: BazaarlyEvent[];
  sales: IntelligenceSale[];
  search: string;
  sort: EventSort;
  compareIds: string[];
  onSearch: (value: string) => void;
  onSort: (sort: EventSort) => void;
  onCompare: (ids: string[]) => void;
  onOpenEvent: (id: string) => void;
}) {
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const dateRange = getDateRange(datePreset, customFrom, customTo);
  const rows = events.map(event => {
    const eventSaleRecords = eventSales(event.id, sales);
    const gross = sumRevenue(eventSaleRecords);
    return {
      event,
      sales: eventSaleRecords,
      gross,
      units: sumUnits(eventSaleRecords),
      aov: averageOrderValue(eventSaleRecords),
      afterFee: gross === null || !isValidFee(event.vendorFee) ? null : gross - event.vendorFee,
    };
  }).filter(row => isInDateRange(row.event.date, dateRange))
    .filter(row => row.event.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => compareEventMetric(a, b, sort));
  const selectedRows = compareIds.flatMap(id => {
    const row = rows.find(candidate => candidate.event.id === id);
    return row ? [row] : [];
  });

  function toggleCompare(id: string) {
    if (compareIds.includes(id)) onCompare(compareIds.filter(item => item !== id));
    else if (compareIds.length < 4) onCompare([...compareIds, id]);
  }

  return (
    <div className="intel-content">
      <div className="intel-section-heading"><h2>Completed events</h2><p>Search, sort, and compare up to four markets using the same metric definitions.</p></div>
      <div className="intel-toolbar">
        <label className="intel-search-label">Search events
          <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Event name" />
        </label>
        <label className="intel-sort-label">Sort by
          <select value={sort} onChange={event => onSort(event.target.value as EventSort)}>
            <option value="gross">Gross sales</option><option value="units">Items sold</option>
            <option value="aov">Average order</option><option value="afterFee">Gross less fee</option>
          </select>
        </label>
        <label className="intel-sort-label">Event date
          <select value={datePreset} onChange={event => setDatePreset(event.target.value as DatePreset)}>
            <option value="all">All dates</option><option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option><option value="custom">Custom range</option>
          </select>
        </label>
        <span className="intel-compare-counter">{compareIds.length}/4 selected to compare</span>
      </div>
      {datePreset === 'custom' && (
        <div className="intel-date-inputs intel-directory-date-inputs">
          <label>From <input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} /></label>
          <label>To <input type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} /></label>
        </div>
      )}

      {rows.length === 0 ? <EmptyState title="No matching completed events" body="Try another search, or check back after an event is complete." /> : (
        <div className="intel-table-wrap">
          <table className="intel-table">
            <thead><tr>
              <th scope="col"><span className="sr-only">Compare</span></th>
              <th scope="col">Event</th><th scope="col">Date</th><th scope="col">Gross sales</th>
              <th scope="col">Orders</th><th scope="col">Items</th><th scope="col">Avg. order</th>
              <th scope="col">Vendor fee</th><th scope="col">After fee</th><th scope="col">Debrief</th>
            </tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.event.id}>
                <td><input aria-label={`Compare ${row.event.name}`} type="checkbox" checked={compareIds.includes(row.event.id)} disabled={!compareIds.includes(row.event.id) && compareIds.length >= 4} onChange={() => toggleCompare(row.event.id)} /></td>
                <th scope="row">{row.event.name}</th><td>{formatDate(row.event.date)}</td>
                <td>{row.gross === null ? '—' : money(row.gross)}</td><td>{row.sales.length}</td><td>{row.units}</td>
                <td>{row.aov === null ? '—' : money(row.aov)}</td><td>{moneyOrDash(row.event.vendorFee)}</td>
                <td>{row.afterFee === null ? '—' : money(row.afterFee)}</td>
                <td><button className="intel-text-link" onClick={() => onOpenEvent(row.event.id)}>Open →</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {selectedRows.length > 0 && (
        <section className="intel-panel intel-compare-panel">
          <div className="intel-section-heading"><h2>Event comparison</h2><p>No overall winner is inferred; compare each measure on its own.</p></div>
          <div className="intel-compare-grid">
            {selectedRows.map(row => (
              <article key={row.event.id}>
                <button className="intel-text-link" onClick={() => onOpenEvent(row.event.id)}>{row.event.name} ↗</button>
                <small>{formatDate(row.event.date)}</small>
                <dl>
                  <div><dt>Gross sales</dt><dd>{row.gross === null ? '—' : money(row.gross)}</dd></div>
                  <div><dt>Orders</dt><dd>{row.sales.length}</dd></div>
                  <div><dt>Items sold</dt><dd>{row.units}</dd></div>
                  <div><dt>Average order</dt><dd>{row.aov === null ? '—' : money(row.aov)}</dd></div>
                  <div><dt>Vendor fee</dt><dd>{moneyOrDash(row.event.vendorFee)}</dd></div>
                  <div><dt>After fee</dt><dd>{row.afterFee === null ? '—' : money(row.afterFee)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InventoryInsights({
  inventory,
  events,
  sales,
  search,
  garmentType,
  color,
  status,
  priceLimit,
  sort,
  selectedProductId,
  onSearch,
  onType,
  onColor,
  onStatus,
  onPriceLimit,
  onSort,
  onSelectProduct,
  onOpenEvent,
}: {
  inventory: InventoryItem[];
  events: BazaarlyEvent[];
  sales: IntelligenceSale[];
  search: string;
  garmentType: string;
  color: string;
  status: string;
  priceLimit: string;
  sort: ProductSort;
  selectedProductId: string | null;
  onSearch: (value: string) => void;
  onType: (value: string) => void;
  onColor: (value: string) => void;
  onStatus: (value: string) => void;
  onPriceLimit: (value: string) => void;
  onSort: (value: ProductSort) => void;
  onSelectProduct: (value: string | null) => void;
  onOpenEvent: (value: string) => void;
}) {
  const products = productPerformance(sales, inventory);
  const salesById = new Map(products.map(product => [product.inventoryItemId, product]));
  const rows: ProductPerformance[] = inventory.map(item => {
    const sold = salesById.get(item.id);
    return sold ? { ...sold, status: item.status } : {
      inventoryItemId: item.id,
      title: item.title || 'Untitled item',
      unitsSold: 0,
      grossRevenue: 0,
      salePrice: null,
      currentPrice: item.price,
      imageUrl: item.imageUrl,
      garmentType: item.garmentType,
      mainColors: item.mainColors,
      artwork: item.artwork,
      searchText: item.searchText,
      status: item.status,
    };
  });
  for (const sold of products) {
    if (!inventory.some(item => item.id === sold.inventoryItemId)) rows.push(sold);
  }

  const types = uniqueLabels(rows.flatMap(product => product.garmentType ? [product.garmentType] : []));
  const colors = uniqueLabels(rows.flatMap(product => product.mainColors ?? []));
  const filtered = rows.filter(product => {
    const query = search.trim().toLocaleLowerCase();
    if (query && ![product.title, product.garmentType ?? '', product.artwork ?? '', ...(product.searchText ?? [])]
      .some(value => value.toLocaleLowerCase().includes(query))) return false;
    if (garmentType !== 'all' && product.garmentType !== garmentType) return false;
    if (color !== 'all' && !product.mainColors?.includes(color)) return false;
    if (status !== 'all' && product.status !== status) return false;
    if (priceLimit) {
      const price = product.salePrice ?? product.currentPrice;
      if (price === undefined || price > Number(priceLimit)) return false;
    }
    return true;
  }).sort((a, b) => sort === 'title'
    ? a.title.localeCompare(b.title)
    : sort === 'units' ? b.unitsSold - a.unitsSold : b.grossRevenue - a.grossRevenue);
  const selectedProduct = selectedProductId
    ? filtered.find(product => product.inventoryItemId === selectedProductId) ?? rows.find(product => product.inventoryItemId === selectedProductId) ?? null
    : null;
  const globalSalesProducts = products;
  const categories = groupBreakdown(globalSalesProducts, 'garmentType');
  const eventNameById = new Map(events.map(event => [event.id, event.name]));
  const selectedProductSales = selectedProduct
    ? sales.filter(sale => sale.items.some(item => item.inventoryItemId === selectedProduct.inventoryItemId))
    : [];

  return (
    <div className="intel-content">
      <div className="intel-section-heading"><h2>Inventory insights</h2><p>See what sold and what is currently in inventory. Current listing price is separate from historical sale price.</p></div>
      <section className="intel-panel">
        <div className="intel-section-heading"><h2>Recorded sales by garment type</h2><p>Category gross is based on item price snapshots; uncategorized items remain visible.</p></div>
        <BreakdownList groups={categories} total={globalSalesProducts.reduce((sum, product) => sum + product.grossRevenue, 0)} metric="revenue" />
        {categories.length === 0 && <p className="intel-empty-inline">No item-level sales are available yet.</p>}
      </section>
      <div className="intel-toolbar intel-filter-toolbar">
        <label className="intel-search-label">Search products
          <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Title, style, tags" />
        </label>
        <FilterSelect label="Garment type" value={garmentType} values={types} onChange={onType} />
        <FilterSelect label="Color" value={color} values={colors} onChange={onColor} />
        <FilterSelect label="Current status" value={status} values={['pending', 'approved', 'sold', 'discarded']} onChange={onStatus} />
        <label className="intel-sort-label">Sale price up to
          <input type="number" min="0" step="1" value={priceLimit} onChange={event => onPriceLimit(event.target.value)} placeholder="Any" />
        </label>
        <label className="intel-sort-label">Sort
          <select value={sort} onChange={event => onSort(event.target.value as ProductSort)}>
            <option value="gross">Gross sales</option><option value="units">Units sold</option><option value="title">Title</option>
          </select>
        </label>
      </div>
      <div className="intel-table-wrap">
        <table className="intel-table intel-inventory-table">
          <thead><tr><th scope="col">Product</th><th scope="col">Garment type</th><th scope="col">Color</th><th scope="col">Current status</th><th scope="col">Historical sale price</th><th scope="col">Current listing price</th><th scope="col">Units sold</th><th scope="col">Item gross</th></tr></thead>
          <tbody>{filtered.map(product => (
            <tr key={product.inventoryItemId}>
              <th scope="row">
                <button className="intel-product-button" onClick={() => onSelectProduct(selectedProductId === product.inventoryItemId ? null : product.inventoryItemId)}>
                    <SafeImage key={product.imageUrl ?? 'no-image'} src={product.imageUrl} alt="" className="intel-table-thumb" fallback="No image" />
                  <span>{product.title}</span>
                </button>
              </th>
              <td>{product.garmentType || 'Unknown'}</td><td>{product.mainColors?.join(', ') || 'Unknown'}</td>
              <td>{product.status ?? 'Metadata unavailable'}</td>
              <td>{product.salePrice === null ? 'No recorded sale' : money(product.salePrice)}</td>
              <td>{product.currentPrice === undefined ? 'Unavailable' : money(product.currentPrice)}</td>
              <td>{product.unitsSold}</td><td>{money(product.grossRevenue)}</td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <p className="intel-empty-inline">No products match those filters.</p>}
      </div>
      {selectedProduct && (
        <section className="intel-panel intel-product-detail">
          <button className="intel-detail-close" onClick={() => onSelectProduct(null)} aria-label="Close product details">×</button>
          <div className="intel-product-detail-heading">
            <SafeImage key={selectedProduct.imageUrl ?? 'no-image'} src={selectedProduct.imageUrl} alt={selectedProduct.title} className="intel-detail-image" fallback="No image" />
            <div><p className="intel-eyebrow">PRODUCT DETAILS</p><h2>{selectedProduct.title}</h2>
              <p>{selectedProduct.garmentType || 'Garment type unavailable'} · {selectedProduct.mainColors?.join(', ') || 'Color unavailable'} · Current status: {selectedProduct.status ?? 'Unavailable'}</p>
              {selectedProduct.artwork && <p>{selectedProduct.artwork}</p>}
            </div>
          </div>
          <p><strong>{selectedProduct.unitsSold}</strong> recorded unit(s) · <strong>{money(selectedProduct.grossRevenue)}</strong> item-snapshot gross
            {selectedProduct.salePrice !== null && ` · latest listed sale snapshot ${money(selectedProduct.salePrice)}`}
          </p>
          <div className="intel-associated-sales">
            {selectedProductSales.map(sale => (
              <div key={sale.id}>
                <span>{eventNameById.get(sale.eventId) ?? 'Event unavailable'} · {sale.timestamp ? formatDateTime(sale.timestamp) : 'Time unavailable'}</span>
                <span>{money(sale.grossRevenue ?? 0)} order</span>
                {eventNameById.has(sale.eventId) && <button className="intel-text-link" onClick={() => onOpenEvent(sale.eventId)}>Event debrief →</button>}
              </div>
            ))}
            {selectedProductSales.length === 0 && <span>No confirmed sale records for this item.</span>}
          </div>
        </section>
      )}
    </div>
  );
}

function SalesLedger({
  sales,
  events,
  search,
  selectedSaleId,
  onSearch,
  onSelectSale,
  onOpenEvent,
}: {
  sales: IntelligenceSale[];
  events: BazaarlyEvent[];
  search: string;
  selectedSaleId: string | null;
  onSearch: (value: string) => void;
  onSelectSale: (value: string | null) => void;
  onOpenEvent: (value: string) => void;
}) {
  const eventById = new Map(events.map(event => [event.id, event]));
  const filtered = sales.filter(sale => {
    const eventName = eventById.get(sale.eventId)?.name ?? '';
    const text = `${eventName} ${sale.items.map(item => item.title).join(' ')} ${sale.id}`.toLocaleLowerCase();
    return text.includes(search.trim().toLocaleLowerCase());
  }).sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0));
  const selected = filtered.find(sale => sale.id === selectedSaleId) ?? null;

  return (
    <div className="intel-content">
      <div className="intel-section-heading"><h2>Confirmed sales</h2><p>Only sale records marked confirmed are included. Each row represents one checkout.</p></div>
      <div className="intel-toolbar">
        <label className="intel-search-label">Search sales
          <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Event, product, or signature" />
        </label>
        <button className="intel-button" onClick={() => downloadSalesCsv(filtered, eventById)}>Export filtered CSV</button>
      </div>
      {filtered.length === 0 ? <EmptyState title="No matching confirmed sales" body="Confirmed transactions will appear here with their timestamp, event, and sale snapshot." /> : (
        <div className="intel-table-wrap">
          <table className="intel-table">
            <thead><tr><th scope="col">Sale time</th><th scope="col">Event</th><th scope="col">Items</th><th scope="col">Gross USD</th><th scope="col">Payment</th><th scope="col">Details</th></tr></thead>
            <tbody>{filtered.map(sale => (
              <tr key={sale.id}>
                <td>{sale.timestamp ? formatDateTime(sale.timestamp) : 'Timestamp unavailable'}</td>
                <td>{eventById.get(sale.eventId)?.name ?? 'Event unavailable'}</td>
                <td>{sale.itemCount}</td><td>{sale.grossRevenue === null ? 'Unavailable' : money(sale.grossRevenue)}</td>
                <td>{String(sale.payment.network ?? 'Unknown')} · confirmed</td>
                <td><button className="intel-text-link" onClick={() => onSelectSale(selectedSaleId === sale.id ? null : sale.id)}>Details</button>
                  {eventById.has(sale.eventId) && <button className="intel-text-link intel-inline-link" onClick={() => onOpenEvent(sale.eventId)}>Event ↗</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {selected && (
        <section className="intel-panel intel-sale-detail">
          <div className="intel-section-heading">
            <h2>Sale details</h2>
            <p>{selected.timestamp
              ? `${selected.timestampSource === 'confirmed' ? 'Confirmed at' : 'Record saved at'} ${formatDateTime(selected.timestamp)}`
              : 'Timestamp unavailable'}</p>
          </div>
          <dl className="intel-detail-grid">
            <div><dt>Confirmation status</dt><dd>{String(selected.payment.status)}</dd></div>
            <div><dt>Network</dt><dd>{String(selected.payment.network ?? 'Unavailable')} · demo</dd></div>
            <div><dt>SOL amount</dt><dd>{typeof selected.payment.amount_sol === 'number' ? `${selected.payment.amount_sol} SOL` : 'Unavailable'}</dd></div>
            <div><dt>USD sale snapshot</dt><dd>{selected.grossRevenue === null ? 'Unavailable' : money(selected.grossRevenue)}</dd></div>
            <div><dt>Merchant wallet</dt><dd>{String(selected.payment.merchant_wallet ?? 'Unavailable')}</dd></div>
            <div><dt>Reference</dt><dd className="intel-wrap">{String(selected.payment.reference ?? 'Unavailable')}</dd></div>
            <div><dt>Transaction signature</dt><dd className="intel-wrap">{selected.id}</dd></div>
          </dl>
          {selected.id && <a className="intel-text-link" href={`https://explorer.solana.com/tx/${encodeURIComponent(selected.id)}?cluster=devnet`} target="_blank" rel="noreferrer">Open Devnet transaction ↗</a>}
          <ul className="intel-sale-items">
            {selected.items.map(item => <li key={item.inventoryItemId}>{item.title} <strong>{money(item.price)}</strong></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function RevenueTimeline({ sales }: { sales: IntelligenceSale[] }) {
  const points = sales.filter(sale => sale.timestamp && sale.grossRevenue !== null)
    .sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));
  if (points.length === 0) {
    return <p className="intel-empty-inline">No usable sale timestamps and USD totals are available for a timeline. No artificial data points are shown.</p>;
  }
  const omittedCount = sales.length - points.length;
  const timestampLabel = points.every(point => point.timestampSource === 'confirmed')
    ? 'Confirmation timestamp'
    : 'Sale record timestamp (confirmation time when available)';
  if (points.length < 2 || points[0].timestamp!.getTime() === points[points.length - 1].timestamp!.getTime()) {
    const reason = points.length < 2 ? 'too few transactions' : 'no distinct transaction times';
    return (
      <div className="intel-empty-inline">
        <p>{points.length} transaction(s) with usable timestamps—{reason}, so there is no meaningful timeline. Recorded gross for these transactions is {money(sumRevenue(points) ?? 0)}. No artificial data points are shown.</p>
        {omittedCount > 0 && <p>{omittedCount} other sale record(s) are omitted because timestamp or USD total is unavailable.</p>}
      </div>
    );
  }
  const cumulative: Array<{ sale: IntelligenceSale; total: number }> = [];
  let total = 0;
  for (const sale of points) {
    total += sale.grossRevenue ?? 0;
    cumulative.push({ sale, total });
  }
  const width = 760;
  const height = 290;
  const left = 72;
  const right = 20;
  const top = 18;
  const bottom = 48;
  const max = Math.max(1, ...cumulative.map(point => point.total));
  const firstTime = points[0].timestamp!.getTime();
  const lastTime = points[points.length - 1].timestamp!.getTime();
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coordinates = cumulative.map(point => {
    const x = left + ((point.sale.timestamp!.getTime() - firstTime) / (lastTime - firstTime)) * plotWidth;
    const y = top + plotHeight - (point.total / max) * plotHeight;
    return { ...point, x, y };
  });
  const polyline = coordinates.map(point => `${point.x},${point.y}`).join(' ');

  return (
    <div className="intel-chart-scroll">
      <svg className="intel-revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative recorded gross sales from ${formatDateTime(points[0].timestamp!)} to ${formatDateTime(points[points.length - 1].timestamp!)}. Y-axis is USD.`}>
        <text x="12" y="17" className="intel-chart-axis-title">USD</text>
        {[0, 0.5, 1].map(fraction => {
          const y = top + plotHeight * (1 - fraction);
          return <g key={fraction}><line x1={left} x2={width - right} y1={y} y2={y} className="intel-chart-grid" /><text x={left - 10} y={y + 4} textAnchor="end" className="intel-chart-label">{money(max * fraction)}</text></g>;
        })}
        <polyline points={polyline} className="intel-chart-line" fill="none" />
        {coordinates.map(point => (
          <circle key={point.sale.id} cx={point.x} cy={point.y} r="4.5" className="intel-chart-point" tabIndex={0}>
            <title>{`${formatDateTime(point.sale.timestamp!)} · ${money(point.sale.grossRevenue!)} sale · ${money(point.total)} cumulative`}</title>
          </circle>
        ))}
        <text x={left} y={height - 12} className="intel-chart-label">{formatDateObject(points[0].timestamp!)}</text>
        <text x={width - right} y={height - 12} textAnchor="end" className="intel-chart-label">{formatDateObject(points[points.length - 1].timestamp!)}</text>
        <text x={width / 2} y={height - 12} textAnchor="middle" className="intel-chart-axis-title">{timestampLabel}</text>
      </svg>
      {omittedCount > 0 && <p className="intel-integrity-note">{omittedCount} sale record(s) are omitted from this timeline because timestamp or USD total is unavailable.</p>}
    </div>
  );
}

function ProductRow({ product, onClick }: { product: ProductPerformance; onClick: () => void }) {
  return (
    <button className="intel-product-row" onClick={onClick}>
      <SafeImage key={product.imageUrl ?? 'no-image'} src={product.imageUrl} alt="" className="intel-product-row-image" fallback="No image" />
      <span className="intel-product-copy"><strong>{product.title}</strong><small>{product.garmentType || 'Category unavailable'} · {product.unitsSold} unit{product.unitsSold === 1 ? '' : 's'}</small></span>
      <span className="intel-product-price">{money(product.grossRevenue)}<small>item gross</small></span>
    </button>
  );
}

function SafeImage({ src, alt, className, fallback }: { src?: string; alt: string; className: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`${className} intel-image-fallback`}>{fallback}</span>;
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function BreakdownList({
  groups,
  total,
  metric,
}: {
  groups: Array<{ label: string; unitsSold: number; grossRevenue: number }>;
  total: number;
  metric: 'revenue' | 'units';
}) {
  if (groups.length === 0) return null;
  return (
    <div className="intel-breakdown">
      {groups.slice(0, 7).map(group => {
        const value = metric === 'revenue' ? group.grossRevenue : group.unitsSold;
        const denominator = metric === 'revenue' ? total : groups.reduce((sum, item) => sum + item.unitsSold, 0);
        const percentage = denominator > 0 ? value / denominator * 100 : 0;
        return (
          <div className="intel-breakdown-row" key={group.label}>
            <div><strong>{group.label}</strong><span>{metric === 'revenue' ? money(group.grossRevenue) : `${group.unitsSold} units`} · {percentage.toFixed(0)}%</span></div>
            <div className="intel-bar-track"><span style={{ width: `${percentage}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="intel-stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label className="intel-sort-label">{label}
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="all">All</option>
        {values.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="intel-empty-state"><span aria-hidden="true">◌</span><h2>{title}</h2><p>{body}</p></div>;
}

function getTakeaway(events: BazaarlyEvent[], sales: IntelligenceSale[], inventory: InventoryItem[]): { title: string; body: string; action: 'event' | 'inventory' | null; eventId?: string } {
  const products = productPerformance(sales, inventory);
  const categories = groupBreakdown(products, 'garmentType').filter(group => group.label !== 'Uncategorized' && group.grossRevenue > 0);
  const knownProductRevenue = products.reduce((sum, product) => sum + product.grossRevenue, 0);
  const knownCategoryCount = categories.length;
  const gross = sumRevenue(sales);
  const productSnapshotsReconcile = saleIntegrityIssues(sales) === 0
    && gross !== null
    && Math.abs(gross - knownProductRevenue) < 0.01;
  if (productSnapshotsReconcile && knownCategoryCount >= 2 && knownProductRevenue > 0 && categories[0].grossRevenue / knownProductRevenue >= 0.25) {
    const share = categories[0].grossRevenue / knownProductRevenue * 100;
    return {
      title: `${categories[0].label} led recorded product sales`,
      body: `${categories[0].label} contributed ${share.toFixed(0)}% of item-snapshot gross across ${categories[0].unitsSold} sold item(s). This describes recorded sales, not category sell-through or profit.`,
      action: 'inventory',
    };
  }
  const ranked = events.map(event => ({ event, gross: sumRevenue(eventSales(event.id, sales)) }))
    .filter(row => row.gross !== null)
    .sort((a, b) => (b.gross ?? 0) - (a.gross ?? 0));
  if (ranked.length > 0 && (ranked[0].gross ?? 0) > 0) {
    return {
      title: `${ranked[0].event.name} has the highest recorded gross`,
      body: `${money(ranked[0].gross ?? 0)} in confirmed sales${ranked.length > 1 ? `, compared with ${money(ranked[1].gross ?? 0)} for the next event` : ''}. This compares gross sales only, not overall event performance.`,
      action: 'event',
      eventId: ranked[0].event.id,
    };
  }
  return {
    title: 'More confirmed sales will make comparisons useful',
    body: 'This view only draws conclusions from recorded, confirmed sales and the product metadata available for those items.',
    action: null,
  };
}

function getEventTakeaway(event: BazaarlyEvent, sales: IntelligenceSale[], products: ProductPerformance[]): { title: string; body: string; productId?: string } | null {
  const ranked = [...products].sort((a, b) => b.grossRevenue - a.grossRevenue);
  const total = products.reduce((sum, product) => sum + product.grossRevenue, 0);
  const gross = sumRevenue(sales);
  const productSnapshotsReconcile = saleIntegrityIssues(sales) === 0
    && gross !== null
    && Math.abs(gross - total) < 0.01;
  if (productSnapshotsReconcile && ranked.length >= 3 && total > 0) {
    const topThree = ranked.slice(0, 3);
    const share = topThree.reduce((sum, product) => sum + product.grossRevenue, 0) / total * 100;
    return {
      title: `Three products generated ${share.toFixed(0)}% of item-snapshot gross`,
      body: `${topThree.map(product => product.title).join(', ')} are the three highest item-snapshot gross contributors. This is sales concentration, not profitability.`,
      productId: topThree[0].inventoryItemId,
    };
  }
  if (gross !== null && gross > 0 && isValidFee(event.vendorFee) && event.vendorFee > 0) {
    return {
      title: 'Gross sales covered the vendor fee',
      body: `Recorded gross sales were ${(gross / event.vendorFee).toFixed(2)}× the vendor fee (${money(gross)} gross vs. ${money(event.vendorFee)} fee). This does not account for product cost or other expenses.`,
    };
  }
  if (ranked.length > 0) {
    return {
      title: `${ranked[0].title} was the highest-revenue recorded product`,
      body: `${money(ranked[0].grossRevenue)} in item-snapshot gross from ${ranked[0].unitsSold} recorded sale unit(s).`,
      productId: ranked[0].inventoryItemId,
    };
  }
  return null;
}

function getDateRange(preset: DatePreset, customFrom: string, customTo: string): DateRange | null {
  if (preset === 'all') return null;
  if (preset === 'custom') return { from: customFrom, to: customTo };
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - Number(preset));
  return { from: localDateKey(from), to: localDateKey(to) };
}

function isInDateRange(value: string, range: DateRange | null): boolean {
  if (!range) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const dateString = localDateKey(date);
  if (range.from && dateString < range.from) return false;
  if (range.to && dateString > range.to) return false;
  return true;
}

function compareEventMetric(
  a: { gross: number | null; units: number; aov: number | null; afterFee: number | null },
  b: { gross: number | null; units: number; aov: number | null; afterFee: number | null },
  sort: EventSort,
): number {
  const av = sort === 'gross' ? a.gross : sort === 'units' ? a.units : sort === 'aov' ? a.aov : a.afterFee;
  const bv = sort === 'gross' ? b.gross : sort === 'units' ? b.units : sort === 'aov' ? b.aov : b.afterFee;
  if (av === null) return bv === null ? 0 : 1;
  if (bv === null) return -1;
  return bv - av;
}

function metricNumber(
  row: { gross: number | null; units: number; aov: number | null; afterFee: number | null },
  sort: EventSort,
): number {
  const value = sort === 'gross' ? row.gross : sort === 'units' ? row.units : sort === 'aov' ? row.aov : row.afterFee;
  return value ?? 0;
}

function formatMetric(
  row: { gross: number | null; units: number; aov: number | null; afterFee: number | null },
  sort: EventSort,
): string {
  const value = sort === 'gross' ? row.gross : sort === 'units' ? row.units : sort === 'aov' ? row.aov : row.afterFee;
  if (value === null) return '—';
  return sort === 'units' ? `${value} items` : money(value);
}

function uniqueLabels(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function downloadSalesCsv(sales: IntelligenceSale[], eventById: Map<string, BazaarlyEvent>): void {
  const rows = [
    ['sale_id', 'timestamp', 'event', 'item_count', 'gross_usd', 'network', 'payment_status'],
    ...sales.map(sale => [
      sale.id,
      sale.timestamp?.toISOString() ?? '',
      eventById.get(sale.eventId)?.name ?? '',
      String(sale.itemCount),
      sale.grossRevenue === null ? '' : sale.grossRevenue.toFixed(2),
      String(sale.payment.network ?? ''),
      String(sale.payment.status ?? ''),
    ]),
  ];
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bazaarly-confirmed-sales.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function dateValue(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateObject(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function money(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function moneyOrDash(value: unknown): string {
  return isFiniteNumber(value) ? money(value) : '—';
}

function moneyOrUnavailableFee(value: unknown): string {
  return isValidFee(value) ? money(value) : 'Unavailable';
}

function isValidFee(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
