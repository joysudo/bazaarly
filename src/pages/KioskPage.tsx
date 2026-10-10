import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BazaarlyEvent, CartItem, InventoryItem } from '../lib/types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const KIOSK_PASSWORD = 'bazaarly';

interface KioskPageProps {
  onExit: () => void;
}

type Step = 'select-event' | 'enter-password' | 'active';

export function KioskPage({ onExit }: KioskPageProps) {
  const [step, setStep] = useState<Step>('select-event');
  const [events, setEvents] = useState<BazaarlyEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<BazaarlyEvent | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [exitPassword, setExitPassword] = useState('');
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      const snap = await getDocs(query(collection(db, 'events'), where('status', '==', 'upcoming')));
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as BazaarlyEvent)));
    }
    loadEvents();
  }, []);

  async function loadEventItems(eventId: string) {
    const snap = await getDocs(
      query(collection(db, 'inventory'), where('eventId', '==', eventId), where('status', '==', 'approved'))
    );
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
  }

  function handleSelectEvent(event: BazaarlyEvent) {
    setSelectedEvent(event);
    setPassword('');
    setPasswordError('');
    setStep('enter-password');
  }

  function handleEnterKiosk() {
    if (password !== KIOSK_PASSWORD) {
      setPasswordError('Incorrect password');
      return;
    }
    loadEventItems(selectedEvent!.id);
    setStep('active');
  }

  function addToCart(item: InventoryItem) {
    if (cart.some(c => c.itemId === item.id)) return;
    setCart(prev => [...prev, { itemId: item.id, price: item.price, title: item.title, imageUrl: item.imageUrl }]);
  }

  function removeFromCart(itemId: string) {
    setCart(prev => prev.filter(c => c.itemId !== itemId));
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      const batch = writeBatch(db);
      let totalRevenue = selectedEvent!.grossRevenue ?? 0;
      for (const cartItem of cart) {
        batch.update(doc(db, 'inventory', cartItem.itemId), { status: 'sold' });
        totalRevenue += cartItem.price;
      }
      batch.update(doc(db, 'events', selectedEvent!.id), { grossRevenue: totalRevenue });
      await batch.commit();
      const soldIds = new Set(cart.map(c => c.itemId));
      setItems(prev => prev.filter(item => !soldIds.has(item.id)));
      setCart([]);
    } finally {
      setCheckingOut(false);
    }
  }

  function handleConfirmExit() {
    if (exitPassword !== KIOSK_PASSWORD) {
      setPasswordError('Incorrect password');
      return;
    }
    setShowExitPrompt(false);
    setStep('select-event');
    setCart([]);
    setSearch('');
    setItems([]);
    onExit();
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const cartItemIds = new Set(cart.map(c => c.itemId));
  const filteredItems = items.filter(item =>
    !cartItemIds.has(item.id) &&
    (!search || item.title?.toLowerCase().includes(search.toLowerCase()) || item.overview?.toLowerCase().includes(search.toLowerCase()))
  );

  if (step === 'select-event') {
    return (
      <CenteredFrame bg="var(--color-block-cream)">
        <div className="eyebrow" style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>Customer Display</div>
        <h2 style={{ margin: '0 0 var(--space-lg)', textAlign: 'center', fontSize: 'var(--text-headline)', fontWeight: 540 }}>
          Select an event
        </h2>
        {events.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.55, fontSize: 'var(--text-body-sm)' }}>
            No upcoming events found.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginBottom: 'var(--space-lg)' }}>
            {events.map(event => (
              <button
                key={event.id}
                onClick={() => handleSelectEvent(event)}
                style={{
                  background: 'var(--color-surface-soft)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-md)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--font-sans)',
                  width: '100%',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-block-lime)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-soft)')}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)' }}>{event.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 4 }}>
                  {new Date(event.date).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
        <Button variant="tertiary" onClick={onExit} style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-body-sm)' }}>
          ← Back to dashboard
        </Button>
      </CenteredFrame>
    );
  }

  if (step === 'enter-password') {
    return (
      <CenteredFrame bg="var(--color-block-cream)" maxWidth={360}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-eyebrow)', fontWeight: 400, letterSpacing: '0.54px', textTransform: 'uppercase', textAlign: 'center', marginBottom: 'var(--space-sm)' }}>
          Access Required
        </div>
        <h2 style={{ margin: '0 0 var(--space-xs)', textAlign: 'center', fontSize: 'var(--text-headline)', fontWeight: 540 }}>
          {selectedEvent?.name}
        </h2>
        <p style={{ margin: '0 0 var(--space-lg)', textAlign: 'center', opacity: 0.55, fontSize: 'var(--text-body-sm)' }}>
          Enter the access password to launch kiosk mode
        </p>
        <Input
          label="Password"
          id="kiosk-pw"
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handleEnterKiosk(); }}
          placeholder="••••••••"
        />
        {passwordError && (
          <p style={{ margin: 'var(--space-xs) 0 0', color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
            {passwordError}
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
          <Button variant="secondary" onClick={() => setStep('select-event')} style={{ flex: 1, justifyContent: 'center' }}>
            Back
          </Button>
          <Button variant="primary" onClick={handleEnterKiosk} style={{ flex: 1, justifyContent: 'center' }}>
            Enter
          </Button>
        </div>
      </CenteredFrame>
    );
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--color-canvas)' }}>
      {/* Kiosk nav */}
      <div
        style={{
          background: 'var(--color-block-navy)',
          padding: '12px var(--space-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-inverse-ink)', opacity: 0.5 }}>
            Now browsing
          </div>
          <div style={{ color: 'var(--color-inverse-ink)', fontWeight: 700, fontSize: 'var(--text-body-lg)', letterSpacing: '-0.14px' }}>
            {selectedEvent?.name}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => { setShowExitPrompt(true); setPasswordError(''); setExitPassword(''); }}
          style={{ fontSize: 'var(--text-body-sm)', padding: '6px 14px' }}
        >
          Exit
        </Button>
      </div>

      {/* Split layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Cart panel */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid var(--color-hairline)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-hairline)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 4 }}>
              Cart — {cart.length} item{cart.length !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 'var(--text-display-lg)', fontWeight: 700, letterSpacing: '-0.96px', lineHeight: 1 }}>
              ${cartTotal.toFixed(2)}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md)' }}>
            {cart.length === 0 ? (
              <p style={{ opacity: 0.4, textAlign: 'center', paddingTop: 'var(--space-xl)', fontSize: 'var(--text-body-sm)' }}>
                Cart is empty
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {cart.map(item => (
                  <div
                    key={item.itemId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-sm)',
                      background: 'var(--color-surface-soft)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-sm)',
                    }}
                  >
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 480, fontSize: 'var(--text-body-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)' }}>${item.price.toFixed(2)}</div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.itemId)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: 0.4, fontSize: 18, padding: 4, lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--color-hairline)' }}>
              <Button
                variant="primary"
                onClick={handleCheckout}
                disabled={checkingOut}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {checkingOut ? 'Processing…' : `Checkout — $${cartTotal.toFixed(2)}`}
              </Button>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'center', opacity: 0.35, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Solana Pay — coming soon
              </p>
            </div>
          )}
        </div>

        {/* Inventory panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-hairline)' }}>
            <input
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-body-sm)',
                background: 'var(--color-canvas)',
                color: 'var(--color-ink)',
                border: '1.5px solid var(--color-hairline)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                width: '100%',
                maxWidth: 360,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)' }}>
            {filteredItems.length === 0 ? (
              <p style={{ opacity: 0.4, textAlign: 'center', paddingTop: 'var(--space-xl)', fontSize: 'var(--text-body-sm)' }}>
                {items.length === 0 ? 'No approved items assigned to this event.' : 'All matching items are in your cart.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      background: 'var(--color-surface-soft)',
                      transition: 'box-shadow 0.15s, transform 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ aspectRatio: '1 / 1', overflow: 'hidden', background: 'var(--color-hairline-soft)' }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2, fontSize: 32 }}>📷</div>
                      )}
                    </div>
                    <div style={{ padding: 'var(--space-sm)' }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', marginBottom: 2 }}>${item.price.toFixed(2)}</div>
                      <div style={{ fontSize: 13, opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exit password overlay */}
      {showExitPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 24,
          }}
        >
          <div
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-xl)',
              maxWidth: 360,
              width: '100%',
            }}
          >
            <h3 style={{ margin: '0 0 var(--space-xs)', fontSize: 'var(--text-headline)', fontWeight: 540 }}>
              Exit kiosk mode?
            </h3>
            <p style={{ margin: '0 0 var(--space-lg)', opacity: 0.6, fontSize: 'var(--text-body-sm)', lineHeight: 1.5 }}>
              Enter the access password to return to the vendor dashboard.
            </p>
            <Input
              label="Password"
              id="exit-pw"
              type="password"
              value={exitPassword}
              onChange={e => { setExitPassword(e.target.value); setPasswordError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmExit(); }}
            />
            {passwordError && (
              <p style={{ margin: 'var(--space-xs) 0 0', color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
                {passwordError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
              <Button
                variant="secondary"
                onClick={() => { setShowExitPrompt(false); setExitPassword(''); setPasswordError(''); }}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmExit} style={{ flex: 1, justifyContent: 'center' }}>
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredFrame({ children, bg, maxWidth = 480 }: { children: React.ReactNode; bg: string; maxWidth?: number }) {
  return (
    <div
      style={{
        minHeight: '100svh',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl)',
      }}
    >
      <div
        style={{
          background: 'var(--color-canvas)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-xl)',
          width: '100%',
          maxWidth,
        }}
      >
        {children}
      </div>
    </div>
  );
}
