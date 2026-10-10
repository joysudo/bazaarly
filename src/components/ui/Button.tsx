import React from 'react';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'magenta' | 'icon' | 'icon-inverse';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    borderRadius: 'var(--radius-pill)',
    padding: '10px 20px',
    border: 'none',
  },
  secondary: {
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    borderRadius: 'var(--radius-pill)',
    padding: '8px 18px 10px',
    border: '1.5px solid var(--color-hairline)',
  },
  tertiary: {
    background: 'transparent',
    color: 'var(--color-ink)',
    borderRadius: 'var(--radius-full)',
    padding: '8px 12px',
    border: 'none',
  },
  magenta: {
    background: 'var(--color-accent-magenta)',
    color: 'var(--color-on-primary)',
    borderRadius: 'var(--radius-pill)',
    padding: '10px 18px',
    border: 'none',
  },
  icon: {
    background: 'var(--color-surface-soft)',
    color: 'var(--color-ink)',
    borderRadius: 'var(--radius-full)',
    width: 40,
    height: 40,
    padding: 0,
    border: 'none',
  },
  'icon-inverse': {
    background: 'rgba(255,255,255,0.16)',
    color: 'var(--color-inverse-ink)',
    borderRadius: 'var(--radius-full)',
    width: 40,
    height: 40,
    padding: 0,
    border: 'none',
  },
};

export function Button({ variant = 'primary', style, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-lg)',
        fontWeight: 480,
        lineHeight: 1.4,
        letterSpacing: '-0.10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        transition: 'opacity 0.15s',
        ...variantStyles[variant],
        ...style,
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
