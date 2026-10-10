import React, { useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
  fullscreen?: boolean;
}

export function Modal({ open, onClose, title, children, maxWidth = 560, fullscreen = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={fullscreen ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: fullscreen ? '56px 0 0' : 0,
        background: fullscreen ? 'var(--color-canvas)' : 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: fullscreen ? 'stretch' : 'center',
        justifyContent: fullscreen ? 'stretch' : 'center',
        zIndex: fullscreen ? 99 : 200,
        padding: fullscreen ? 0 : 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal={!fullscreen}
        aria-label={title}
        style={{
          background: 'var(--color-canvas)',
          borderRadius: fullscreen ? 0 : 'var(--radius-xl)',
          padding: fullscreen ? 'var(--space-xl) var(--space-xxl)' : 'var(--space-xl)',
          maxWidth: fullscreen ? 'none' : maxWidth,
          width: '100%',
          boxSizing: 'border-box',
          height: fullscreen ? '100%' : undefined,
          maxHeight: fullscreen ? '100%' : '90vh',
          overflowY: 'auto',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-headline)', fontWeight: 540, letterSpacing: '-0.26px' }}>
              {title}
            </h2>
            <Button variant="icon" onClick={onClose} style={{ flexShrink: 0, fontSize: 16 }}>✕</Button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
