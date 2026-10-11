import { useState } from 'react';
import { averageOrderValue, eventRevenueMismatch, groupBreakdown, normalizeConfirmedSale, productPerformance, saleIntegrityIssues, sumRevenue, sumUnits } from '../../lib/sellerAnalytics';
import type { BazaarlyEvent, EventSale, InventoryItem } from '../../lib/types';
import type { IntelligenceSale, ProductPerformance } from '../../lib/sellerAnalytics';
import '../analytics/Analytics.css';

interface EventAnalyticsProps {
  event: BazaarlyEvent;
  sales: EventSale[];
  inventory: InventoryItem[];
}

export function EventAnalytics({ event, sales: eventSales, inventory }: EventAnalyticsProps) {
  const sales = eventSales.flatMap(sale => {
    const normalized = normalizeConfirmedSale(sale.id, {
      eventId: sale.eventId,
      items: sale.items,
      itemCount: sale.itemCount,
      grossRevenue: sale.grossRevenue,
      createdAt: sale.createdAt,
      payment: sale.payment,
    });
    return normalized ? [normalized] : [];
  });
  const gross = sumRevenue(sales);
  const units = sumUnits(sales);
  const average = averageOrderValue(sales);
  const products = productPerformance(sales, inventory).sort((a, b) => b.grossRevenue - a.grossRevenue);
  const categories = groupBreakdown(products, 'garmentType');
  const categoryRevenue = products.reduce((total, product) => total + product.grossRevenue, 0);
  const inventoryTypes = countLabels(inventory.map(item => item.garmentType || 'Type unavailable'));
  const inventoryColors = countLabels(inventory.flatMap(item => (
    item.mainColors?.length ? item.mainColors : ['Color unavailable']
  )));
  const inventoryStatuses = countLabels(inventory.map(item => item.status));
  const priceRanges = getPriceRanges(inventory);
  const visualItems = inventory.filter(hasVisualMetadata);
  const mismatch = eventRevenueMismatch(event, sales);
  const integrityIssues = saleIntegrityIssues(sales);
  const takeaway = getEventTakeaway(event, sales, products);
  const afterFee = gross !== null && isValidFee(event.vendorFee) ? gross - event.vendorFee : null;

  return (
    <div className="analytics-content">
      <div className="analytics-stats">
        <StatCard label="Gross revenue" value={gross === null ? 'Incomplete' : money(gross)} detail="Sum of confirmed sale records" />
        <StatCard label="Orders" value={sales.length.toLocaleString()} detail="One record per confirmed checkout" />
        <StatCard label="Items sold" value={units.toLocaleString()} detail="Units recorded on sale records" />
        <StatCard label="Average order" value={average === null ? '—' : money(average)} detail="Gross revenue ÷ confirmed orders" />
      </div>

      {sales.length === 0 && (
        <p className="analytics-note">No confirmed sales are recorded for this event. Current assignments do not represent opening inventory, so sell-through is unavailable.</p>
      )}

      <details className="analytics-disclosure" open>
        <summary>
          <span>Sales charts</span>
          <small>Confirmed USD transactions</small>
        </summary>
        <div className="analytics-disclosure-body">
          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <h2>Revenue over time</h2>
              <p>Cumulative confirmed USD sales by transaction timestamp. This is not a measure of attendance.</p>
            </div>
            <RevenueTimeline sales={sales} />
          </section>
          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <h2>Revenue per order</h2>
              <p>Each bar is one confirmed checkout; available timestamps determine the order. Hover or focus for the timestamp and amount.</p>
            </div>
            <SalesByOrderChart sales={sales} />
          </section>
        </div>
      </details>

      <details className="analytics-disclosure" open>
        <summary>
          <span>Sales breakdown</span>
          <small>Product and category performance</small>
        </summary>
        <div className="analytics-disclosure-body analytics-columns">
          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <h2>What sold?</h2>
              <p>Prices use confirmed-sale item snapshots; product images and categories use current metadata.</p>
            </div>
            {products.length === 0 ? (
              <p className="analytics-empty-inline">Product sales will appear here after confirmed sales include item snapshots.</p>
            ) : (
              <div className="analytics-product-list">
                {products.slice(0, 8).map(product => <ProductRow key={product.inventoryItemId} product={product} />)}
              </div>
            )}
          </section>
          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <h2>Category mix</h2>
              <p>Garment type · share of item-snapshot gross sales</p>
            </div>
            <BreakdownList
              items={categories.map(group => ({
                label: group.label,
                value: group.grossRevenue,
                detail: `${money(group.grossRevenue)} · ${categoryRevenue > 0 ? (group.grossRevenue / categoryRevenue * 100).toFixed(0) : 0}%`,
              }))}
              emptyText="No category metadata is available for these sold items."
            />
          </section>
        </div>
      </details>

      <details className="analytics-disclosure">
        <summary>
          <span>Computer vision &amp; inventory profile</span>
          <small>{inventory.length} items · {visualItems.length} with saved descriptions or tags</small>
        </summary>
        <div className="analytics-disclosure-body">
          <p className="analytics-note">
            These charts describe the items currently linked to this event, not a snapshot of opening stock or historical sell-through. Garment type, colors, keywords, and descriptions are saved item metadata and may have been edited.
          </p>
          {inventory.length === 0 ? (
            <p className="analytics-empty-inline">Assign inventory to this event to see its item profile.</p>
          ) : (
            <>
              <div className="analytics-profile-charts">
                <ProfileChart title="Garment types" note="Items by saved type" items={inventoryTypes} suffix="items" />
                <ProfileChart title="Colors" note="An item may have multiple colors" items={inventoryColors} suffix="tags" />
                <ProfileChart title="Current status" note="Current inventory records" items={inventoryStatuses} suffix="items" />
                <ProfileChart title="Price ranges" note="Current listed price per item" items={priceRanges} suffix="items" />
              </div>
              <section className="analytics-vision-section">
                <div className="analytics-section-heading">
                  <h2>Visual descriptions &amp; keywords</h2>
                  <p>Saved overviews, artwork notes, colors, and searchable tags for event-linked items.</p>
                </div>
                {inventory.length === 0 ? (
                  <p className="analytics-empty-inline">No inventory is assigned to this event.</p>
                ) : (
                  <div className="analytics-vision-list">
                    {inventory.map(item => <VisionItemCard key={item.id} item={item} />)}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </details>

      <section className="analytics-financial">
        <p className="analytics-eyebrow">EVENT FINANCIAL SUMMARY</p>
        <h2>Revenue after vendor fee</h2>
        <p className="analytics-copy">This is gross recorded sales minus the vendor fee, not profit or ROI.</p>
        <div className="analytics-financial-values">
          <div><small>Gross revenue</small><strong>{gross === null ? 'Incomplete' : money(gross)}</strong></div>
          <span aria-hidden="true">−</span>
          <div><small>Vendor fee</small><strong>{isValidFee(event.vendorFee) ? money(event.vendorFee) : 'Unavailable'}</strong></div>
          <span aria-hidden="true">=</span>
          <div><small>After vendor fee</small><strong>{afterFee === null ? 'Unavailable' : money(afterFee)}</strong></div>
        </div>
        {gross !== null && gross > 0 && isValidFee(event.vendorFee) && event.vendorFee > 0 && (
          <p className="analytics-copy analytics-coverage">
            Gross sales were {(gross / event.vendorFee).toFixed(2)}× the vendor fee. This measures fee coverage, not profit margin.
          </p>
        )}
        {isValidFee(event.vendorFee) && event.vendorFee === 0 && (
          <p className="analytics-copy analytics-coverage">Fee coverage is unavailable because the recorded vendor fee is $0.00.</p>
        )}
      </section>

      {takeaway && (
        <section className="analytics-panel analytics-takeaway">
          <p className="analytics-eyebrow">WHAT THIS EVENT TELLS YOU</p>
          <h2>{takeaway.title}</h2>
          <p>{takeaway.body}</p>
        </section>
      )}

      {(mismatch !== null && Math.abs(mismatch) >= 0.01 || integrityIssues > 0) && (
        <section className="analytics-integrity" role="status">
          <strong>Some records need reconciliation.</strong>
          {mismatch !== null && Math.abs(mismatch) >= 0.01 && (
            <span> Event running revenue differs from the confirmed sales sum by {money(mismatch)}; analytics use the confirmed sales records.</span>
          )}
          {integrityIssues > 0 && <span> {integrityIssues} sale record(s) do not reconcile to their item snapshots.</span>}
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="analytics-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function RevenueTimeline({ sales }: { sales: IntelligenceSale[] }) {
  const points = sales.filter(sale => sale.timestamp && sale.grossRevenue !== null)
    .sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));
  if (points.length === 0) {
    return <p className="analytics-empty-inline">No usable sale timestamps and USD totals are available. No artificial points are shown.</p>;
  }
  const omittedCount = sales.length - points.length;
  if (points.length < 2 || points[0].timestamp!.getTime() === points[points.length - 1].timestamp!.getTime()) {
    return (
      <div className="analytics-empty-inline">
        <p>{points.length} transaction(s) with usable timestamps are not enough for a meaningful timeline. Recorded gross is {money(sumRevenue(points) ?? 0)}.</p>
        {omittedCount > 0 && <p>{omittedCount} sale record(s) are omitted because timestamp or USD total is unavailable.</p>}
      </div>
    );
  }

  const totals = points.reduce<Array<{ sale: IntelligenceSale; total: number }>>((result, sale) => {
    const previousTotal = result[result.length - 1]?.total ?? 0;
    result.push({ sale, total: previousTotal + (sale.grossRevenue ?? 0) });
    return result;
  }, []);
  const chart = { width: 760, height: 290, left: 72, right: 20, top: 18, bottom: 48 };
  const max = Math.max(1, ...totals.map(point => point.total));
  const firstTime = points[0].timestamp!.getTime();
  const lastTime = points[points.length - 1].timestamp!.getTime();
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const coordinates = totals.map(point => ({
    ...point,
    x: chart.left + ((point.sale.timestamp!.getTime() - firstTime) / (lastTime - firstTime)) * plotWidth,
    y: chart.top + plotHeight - (point.total / max) * plotHeight,
  }));

  return (
    <div className="analytics-chart-scroll">
      <svg className="analytics-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Cumulative recorded gross sales from ${formatDateTime(points[0].timestamp!)} to ${formatDateTime(points[points.length - 1].timestamp!)}. Y-axis is USD.`}>
        <text x="12" y="17" className="analytics-chart-title">USD</text>
        {[0, 0.5, 1].map(fraction => {
          const y = chart.top + plotHeight * (1 - fraction);
          return <g key={fraction}><line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="analytics-chart-grid" /><text x={chart.left - 10} y={y + 4} textAnchor="end" className="analytics-chart-label">{money(max * fraction)}</text></g>;
        })}
        <polyline points={coordinates.map(point => `${point.x},${point.y}`).join(' ')} className="analytics-chart-line" fill="none" />
        {coordinates.map(point => (
          <circle key={point.sale.id} cx={point.x} cy={point.y} r="4.5" className="analytics-chart-point" tabIndex={0}>
            <title>{`${formatDateTime(point.sale.timestamp!)} · ${money(point.sale.grossRevenue!)} sale · ${money(point.total)} cumulative`}</title>
          </circle>
        ))}
        <text x={chart.left} y={chart.height - 12} className="analytics-chart-label">{formatDate(points[0].timestamp!)}</text>
        <text x={chart.width - chart.right} y={chart.height - 12} textAnchor="end" className="analytics-chart-label">{formatDate(points[points.length - 1].timestamp!)}</text>
        <text x={chart.width / 2} y={chart.height - 12} textAnchor="middle" className="analytics-chart-title">Sale confirmation time</text>
      </svg>
      {omittedCount > 0 && <p className="analytics-integrity">{omittedCount} sale record(s) omitted because timestamp or USD total is unavailable.</p>}
    </div>
  );
}

function SalesByOrderChart({ sales }: { sales: IntelligenceSale[] }) {
  const orders = sales
    .filter(sale => sale.grossRevenue !== null)
    .sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));
  if (orders.length === 0) {
    return <p className="analytics-empty-inline">No confirmed order totals are available to chart.</p>;
  }

  const chart = { width: Math.max(760, orders.length * 44 + 100), height: 250, left: 64, right: 20, top: 20, bottom: 42 };
  const values = orders.map(order => order.grossRevenue ?? 0);
  const max = Math.max(1, ...values);
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const step = plotWidth / orders.length;
  const barWidth = Math.min(24, step * 0.68);
  const omittedCount = sales.length - orders.length;

  return (
    <div className="analytics-chart-scroll">
      <svg
        className="analytics-chart analytics-order-chart"
        style={{ width: chart.width }}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={`${orders.length} confirmed orders charted by gross USD amount`}
      >
        <text x="12" y="17" className="analytics-chart-title">USD</text>
        {[0, 0.5, 1].map(fraction => {
          const y = chart.top + plotHeight * (1 - fraction);
          return (
            <g key={fraction}>
              <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="analytics-chart-grid" />
              <text x={chart.left - 10} y={y + 4} textAnchor="end" className="analytics-chart-label">{money(max * fraction)}</text>
            </g>
          );
        })}
        {orders.map((order, index) => {
          const value = order.grossRevenue ?? 0;
          const barHeight = value / max * plotHeight;
          const x = chart.left + index * step + (step - barWidth) / 2;
          const y = chart.top + plotHeight - barHeight;
          return (
            <rect
              key={order.id}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx="3"
              className="analytics-chart-bar"
              tabIndex={0}
            >
              <title>{`Order ${index + 1} · ${order.timestamp ? formatDateTime(order.timestamp) : 'Timestamp unavailable'} · ${money(value)}`}</title>
            </rect>
          );
        })}
        <text x={chart.left} y={chart.height - 12} className="analytics-chart-label">Order 1</text>
        <text x={chart.width - chart.right} y={chart.height - 12} textAnchor="end" className="analytics-chart-label">Order {orders.length}</text>
        <text x={chart.width / 2} y={chart.height - 12} textAnchor="middle" className="analytics-chart-title">Order sequence · time when available</text>
      </svg>
      {omittedCount > 0 && <p className="analytics-integrity">{omittedCount} sale record(s) omitted because the confirmed USD total is unavailable.</p>}
    </div>
  );
}

function ProductRow({ product }: { product: ProductPerformance }) {
  return (
    <article className="analytics-product-row">
      <ProductImage src={product.imageUrl} alt="" />
      <span className="analytics-product-copy">
        <strong>{product.title}</strong>
        <small>{product.garmentType || 'Category unavailable'} · {product.unitsSold} unit{product.unitsSold === 1 ? '' : 's'}</small>
      </span>
      <span className="analytics-product-price">{money(product.grossRevenue)}<small>item gross</small></span>
    </article>
  );
}

function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="analytics-product-image analytics-image-fallback">No image</span>;
  return <img className="analytics-product-image" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

interface BreakdownItem {
  label: string;
  value: number;
  detail: string;
}

function BreakdownList({
  items,
  emptyText,
  denominator,
}: {
  items: BreakdownItem[];
  emptyText: string;
  denominator?: number;
}) {
  if (items.length === 0) return <p className="analytics-empty-inline">{emptyText}</p>;
  const scale = denominator ?? items.reduce((total, item) => total + item.value, 0);
  return (
    <div className="analytics-breakdown">
      {items.slice(0, 7).map(item => {
        const percentage = scale > 0 ? Math.min(100, item.value / scale * 100) : 0;
        return (
          <div className="analytics-breakdown-row" key={item.label}>
            <div><strong>{item.label}</strong><span>{item.detail}</span></div>
            <div className="analytics-bar-track"><span style={{ width: `${percentage}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileChart({
  title,
  note,
  items,
  suffix,
}: {
  title: string;
  note: string;
  items: Array<{ label: string; value: number }>;
  suffix: string;
}) {
  return (
    <section className="analytics-panel analytics-profile-panel">
      <div className="analytics-section-heading">
        <h3>{title}</h3>
        <p>{note}</p>
      </div>
      <BreakdownList
        items={items.map(item => ({
          ...item,
          detail: `${item.value} ${suffix}`,
        }))}
        emptyText="No data available."
      />
    </section>
  );
}

function VisionItemCard({ item }: { item: InventoryItem }) {
  const vision = item.visionDetails;
  const sections = Object.entries(vision?.sections ?? {}).filter(([, value]) => value.trim());
  const fullDescription = vision?.fullDescription?.trim();
  const hasDetailedNotes = Boolean(
    fullDescription
    || sections.length > 0
    || vision?.notVisible?.length
    || vision?.model,
  );

  return (
    <article className="analytics-vision-card">
      <ProductImage src={item.imageUrl} alt={item.title} />
      <div className="analytics-vision-copy">
        <div className="analytics-vision-title">
          <strong>{item.title || 'Untitled item'}</strong>
          <span>{money(item.price)}</span>
        </div>
        <p className="analytics-vision-meta">{item.garmentType || 'Garment type unavailable'} · {item.status}</p>
        {item.overview && <p>{item.overview}</p>}
        {item.artwork && <p><strong>Artwork:</strong> {item.artwork}</p>}
        {fullDescription && fullDescription !== item.overview && (
          <p><strong>Full visual description:</strong> {fullDescription}</p>
        )}
        {item.mainColors && item.mainColors.length > 0 && (
          <div className="analytics-vision-tags" aria-label="Saved colors">
            {item.mainColors.map(color => <span key={color}>{color}</span>)}
          </div>
        )}
        {item.searchText && item.searchText.length > 0 && (
          <div className="analytics-vision-tags" aria-label="Saved search keywords">
            {item.searchText.map(keyword => <span key={keyword}>{keyword}</span>)}
          </div>
        )}
        {!hasVisualMetadata(item) && (
          <p className="analytics-vision-unavailable">No saved visual description or tags for this item.</p>
        )}
        {hasDetailedNotes && (
          <details className="analytics-vision-notes">
            <summary>Detailed vision notes</summary>
            {sections.length > 0 && (
              <dl>
                {sections.map(([label, value]) => (
                  <div key={label}><dt>{formatVisionLabel(label)}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            )}
            {vision?.notVisible && vision.notVisible.length > 0 && (
              <div>
                <strong>Not visible in scan</strong>
                <div className="analytics-vision-tags">
                  {vision.notVisible.map(detail => <span key={detail}>{detail}</span>)}
                </div>
              </div>
            )}
            {vision?.model && (
              <p className="analytics-vision-model">
                {vision.model.name} · prompt {vision.model.promptVersion} · {vision.model.latencySeconds.toFixed(1)}s
              </p>
            )}
          </details>
        )}
      </div>
    </article>
  );
}

function countLabels(values: string[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, { label: string; value: number }>();
  for (const value of values) {
    const label = value.trim() || 'Unknown';
    const key = label.toLocaleLowerCase();
    const current = counts.get(key) ?? { label, value: 0 };
    current.value += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getPriceRanges(inventory: InventoryItem[]): Array<{ label: string; value: number }> {
  const ranges = [
    { label: 'Under $10', value: 0 },
    { label: '$10-$24', value: 0 },
    { label: '$25-$49', value: 0 },
    { label: '$50+', value: 0 },
  ];
  for (const item of inventory) {
    if (!Number.isFinite(item.price) || item.price < 0) continue;
    const index = item.price < 10 ? 0 : item.price < 25 ? 1 : item.price < 50 ? 2 : 3;
    ranges[index].value += 1;
  }
  return ranges.filter(range => range.value > 0);
}

function hasVisualMetadata(item: InventoryItem): boolean {
  return Boolean(
    item.overview?.trim()
    || item.garmentType?.trim()
    || item.artwork?.trim()
    || item.mainColors?.some(color => color.trim())
    || item.searchText?.some(keyword => keyword.trim())
    || item.visionDetails?.fullDescription?.trim()
    || Object.values(item.visionDetails?.sections ?? {}).some(value => value.trim())
    || item.visionDetails?.notVisible?.length,
  );
}

function formatVisionLabel(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function getEventTakeaway(event: BazaarlyEvent, sales: IntelligenceSale[], products: ProductPerformance[]): { title: string; body: string } | null {
  const ranked = [...products].sort((a, b) => b.grossRevenue - a.grossRevenue);
  const productGross = products.reduce((total, product) => total + product.grossRevenue, 0);
  const gross = sumRevenue(sales);
  const snapshotsReconcile = saleIntegrityIssues(sales) === 0 && gross !== null && Math.abs(gross - productGross) < 0.01;

  if (snapshotsReconcile && ranked.length >= 3 && productGross > 0) {
    const topThree = ranked.slice(0, 3);
    const share = topThree.reduce((total, product) => total + product.grossRevenue, 0) / productGross * 100;
    return {
      title: `Three products generated ${share.toFixed(0)}% of item-snapshot gross`,
      body: `${topThree.map(product => product.title).join(', ')} were the largest recorded product contributors. This is sales concentration, not profitability.`,
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
      title: `${ranked[0].title} had the highest recorded product sales`,
      body: `${money(ranked[0].grossRevenue)} in item-snapshot gross from ${ranked[0].unitsSold} recorded sale unit(s).`,
    };
  }
  return null;
}

function isValidFee(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function money(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
