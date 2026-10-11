import { useState, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
// import bazaarlylogo from '../../assets/bazaarlylogo.png';

type Tab = 'events' | 'inventory' | 'kiosk';

interface TopNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  user: User;
}

export function TopNav({ activeTab, onTabChange, user }: TopNavProps) {
  const { signOut, deleteAccount } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
        setDeleteError('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
    } catch {
      setDeleteError('Delete failed. Please sign out and sign back in, then try again.');
      setDeleting(false);
    }
  }

  const initials = user.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (user.email?.[0] ?? '?').toUpperCase();

  return (
    <nav
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
        {/* Left: logo + tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <img src='https://ibb.co/s9j224Zx' style={{ height: '1em', fontSize: 'var(--text-body-lg)' }} alt="Bazaarly" />
          <div style={{ display: 'flex', gap: 'var(--space-xxs)', flexWrap: 'wrap' }}>
            {([['events', 'Events'], ['inventory', 'Inventory']] as const).map(([tab, label]) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    background: 'transparent',
                    color: 'var(--color-ink)',
                    opacity: isActive ? 0.8 : 0.6,
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
                    transition: 'opacity 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Customer Display + user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Button
            variant="primary"
            onClick={() => onTabChange('kiosk')}
            style={{ fontSize: 'var(--text-body)', padding: '7px 16px', flexShrink: 0 }}
          >
            Customer Display
          </Button>

          {/* User menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false); setDeleteError(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--color-surface-soft)',
                border: '1.5px solid var(--color-hairline)',
                borderRadius: 'var(--radius-pill)',
                padding: '5px 12px 5px 6px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 480,
                color: 'var(--color-ink)',
              }}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? ''}
                  style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-block-lilac)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
              )}
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.displayName ?? user.email}
              </span>
              <span style={{ fontSize: 9, opacity: 0.5 }}>{menuOpen ? '▴' : '▾'}</span>
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                background: 'var(--color-canvas)',
                border: '1.5px solid var(--color-hairline)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                minWidth: 200,
                overflow: 'hidden',
              }}>
                {/* User info */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--color-hairline-soft)' }}>
                  <div style={{ fontSize: 13, fontWeight: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {user.email}
                  </div>
                </div>

                {/* Log out */}
                <button
                  onClick={() => signOut()}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 480, color: 'var(--color-ink)', textAlign: 'left' }}
                >
                  Log out
                </button>

                {/* Delete account */}
                <div style={{ borderTop: '1px solid var(--color-hairline-soft)' }}>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-accent-magenta)', textAlign: 'left' }}
                    >
                      Delete account…
                    </button>
                  ) : (
                    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, opacity: 0.7 }}>
                        Permanently delete your account? Your data stays in the database unless removed separately.
                      </p>
                      {deleteError && (
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-accent-magenta)', lineHeight: 1.4 }}>
                          {deleteError}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setConfirmDelete(false); setDeleteError(''); }}
                          disabled={deleting}
                          style={{ flex: 1, padding: '6px 0', background: 'var(--color-surface-soft)', border: '1.5px solid var(--color-hairline)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 480 }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          style={{ flex: 1, padding: '6px 0', background: 'var(--color-accent-magenta)', border: 'none', borderRadius: 6, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 480, color: 'white', opacity: deleting ? 0.6 : 1 }}
                        >
                          {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
