import React from 'react';

type BadgeVariant = 'pending' | 'approved' | 'sold' | 'discarded' | 'upcoming' | 'past';

interface BadgeProps {
  variant: BadgeVariant;
  children?: React.ReactNode;
}

const variantColors: Record<BadgeVariant, { bg: string; color: string }> = {
  pending:   { bg: 'var(--color-block-cream)', color: 'var(--color-ink)' },
  approved:  { bg: 'var(--color-block-mint)',  color: 'var(--color-ink)' },
  sold:      { bg: 'var(--color-block-navy)',  color: 'var(--color-inverse-ink)' },
  discarded: { bg: 'var(--color-block-pink)',  color: 'var(--color-ink)' },
  upcoming:  { bg: 'var(--color-block-lilac)', color: 'var(--color-ink)' },
  past:      { bg: 'var(--color-surface-soft)',color: 'var(--color-ink)' },
};

const labels: Record<BadgeVariant, string> = {
  pending: 'Pending', approved: 'Approved', sold: 'Sold',
  discarded: 'Discarded', upcoming: 'Upcoming', past: 'Past',
};

export function Badge({ variant, children }: BadgeProps) {
  const { bg, color } = variantColors[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 400,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        background: bg,
        color,
      }}
    >
      {children ?? labels[variant]}
    </span>
  );
}
