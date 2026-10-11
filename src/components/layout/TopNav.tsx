import { Button } from '../ui/Button';

type Tab = 'events' | 'inventory' | 'kiosk';

interface TopNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <nav
      className="top-nav"
      style={{
        background: 'var(--color-canvas)',
        borderBottom: '1px solid var(--color-hairline)',
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '8px clamp(14px, 4vw, 48px)',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 'var(--text-body-lg)',
              letterSpacing: '-0.5px',
              color: 'var(--color-ink)',
            }}
          >
            Bazaarly
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-xxs)', flexWrap: 'wrap' }}>
            {([
              ['events', 'Events'],
              ['inventory', 'Inventory'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                style={{
                  background: activeTab === tab ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === tab ? 'var(--color-on-primary)' : 'var(--color-ink)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 16px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 480,
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => onTabChange('kiosk')}
          style={{ fontSize: 'var(--text-body-sm)', padding: '7px 16px', flexShrink: 0 }}
        >
          Customer Display
        </Button>
      </div>
    </nav>
  );
}
