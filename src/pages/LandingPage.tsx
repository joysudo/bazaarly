import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
// import bazaarlylogo from '../assets/bazaarlylogo.png';
// import bubblelarge from '../assets/bubblelarge.png';
// import bubblemedium from '../assets/bubblemedium.png';
// import bubblesmall from '../assets/bubblesmall.png';

export function LandingPage() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--color-canvas)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative color strip at top */}
      <div style={{ height: 6, background: 'var(--color-block-lilac)', flexShrink: 0 }} />

      {/* Bubble decorations */}
      <img
        src='https://ibb.co/mVzh18YQ' alt=""
        style={{ position: 'absolute', top: -120, right: -100, width: 480, opacity: 0.35, pointerEvents: 'none', userSelect: 'none' }}
      />
      <img
        src='https://ibb.co/nNzQHgFP' alt=""
        style={{ position: 'absolute', bottom: -60, left: -60, width: 300, opacity: 0.3, pointerEvents: 'none', userSelect: 'none' }}
      />
      <img
        src='https://ibb.co/8DF3hCYW' alt=""
        style={{ position: 'absolute', top: '55%', left: '5%', width: 100, opacity: 0.25, pointerEvents: 'none', userSelect: 'none' }}
      />
      <img
        src='https://ibb.co/8DF3hCYW' alt=""
        style={{ position: 'absolute', bottom: '20%', right: '8%', width: 64, opacity: 0.2, pointerEvents: 'none', userSelect: 'none' }}
      />

      {/* Centered content */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xxl) var(--space-xl)',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>

          {/* Logo */}
          <div style={{ marginBottom: 'var(--space-xxl)' }}>
            <img
              src='https://ibb.co/s9j224Zx'
              alt="Bazaarly"
              style={{ height: 36, display: 'inline-block' }}
            />
          </div>

          {/* Headline */}
          <h1 style={{
            margin: '0 0 var(--space-md)',
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 340,
            lineHeight: 1.08,
            letterSpacing: '-1px',
            color: 'var(--color-ink)',
          }}>
            Your pop-up shop,<br />
            <span style={{ color: 'var(--color-block-navy)', opacity: 0.7 }}>
              beautifully organised
            </span>
          </h1>

          {/* Subheading */}
          <p style={{
            margin: '0 0 var(--space-xxl)',
            fontSize: 'var(--text-body)',
            lineHeight: 1.6,
            opacity: 0.5,
            fontWeight: 300,
          }}>
            Scan garments, manage inventory, and run your bazaar booth — all in one place.
          </p>

          {/* Sign-in card */}
          <div style={{
            background: 'var(--color-surface-soft)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl) var(--space-xxl)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-md)',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              opacity: 0.35,
            }}>
              Sign in to continue
            </div>

            <button
              onClick={handleSignIn}
              disabled={busy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 24px',
                background: busy ? 'var(--color-hairline)' : 'var(--color-ink)',
                color: 'var(--color-inverse-ink)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 500,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, opacity 0.15s',
                opacity: busy ? 0.6 : 1,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              {/* Google G icon */}
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
              </svg>
              {busy ? 'Signing in…' : 'Continue with Google'}
            </button>

            {error && (
              <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', color: 'var(--color-accent-magenta)' }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{
        textAlign: 'center',
        padding: 'var(--space-lg)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        opacity: 0.3,
        letterSpacing: '0.4px',
        position: 'relative',
        zIndex: 1,
      }}>
        BAZAARLY
      </div>
    </div>
  );
}
