import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export function Modal({ open, onClose, title, children, maxWidth = 560 }: ModalProps) {
  const [isExiting, setIsExiting] = useState(false);

  const triggerClose = useCallback(() => {
    if (isExiting) return;

    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsExiting(false);
    }, 200);
  }, [isExiting, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') triggerClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, triggerClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes modalOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalOverlayFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalSlideDown {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(16px); }
        }
      `}</style>
      <div
        onClick={triggerClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 24,
          animation: isExiting 
            ? 'modalOverlayFadeOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards' 
            : 'modalOverlayFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          style={{
            background: 'var(--color-canvas)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-xl)',
            maxWidth,
            width: '100%',
            boxSizing: 'border-box',
            maxHeight: '90vh',
            overflowY: 'auto',
            animation: isExiting 
              ? 'modalSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards' 
              : 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {title && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-headline)', fontWeight: 540, letterSpacing: '-0.26px' }}>
                {title}
              </h2>
              <Button variant="icon" onClick={triggerClose} style={{ flexShrink: 0, fontSize: 16 }}>✕</Button>
            </div>
          )}
          {children}
        </div>
      </div>
    </>
  );
}