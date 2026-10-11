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
            ] as const).map(([tab, label]) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  className="nav-tab-button"
                  style={{
                    background: 'transparent',
                    color: isActive ? 'var(--color-ink)' : 'var(--color-ink)',
                    opacity: isActive ? 0.8 : 0.6,
                    // Wavy underline effect when active
                    textDecoration: isActive ? 'underline wavy' : 'none',
                    textUnderlineOffset: '3px', 
                    borderRadius: 0,
                    padding: '6px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-body-lg)',
                    fontWeight: isActive ? 600 : 480,
                    whiteSpace: 'nowrap',
                    transition: 'opacity 0.15s, text-decoration 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => onTabChange('kiosk')}
          style={{ fontSize: 'var(--text-body)', padding: '7px 16px', flexShrink: 0 }}
        >
          Customer Display
        </Button>
      </div>
    </nav>
  );
}