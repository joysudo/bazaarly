import React from 'react';

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-body)',
  fontWeight: 320,
  lineHeight: 1.45,
  background: 'var(--color-canvas)',
  color: 'var(--color-ink)',
  border: '1.5px solid var(--color-hairline)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 'var(--text-body-sm)', fontWeight: 480, letterSpacing: '-0.14px' }}>
          {label}
        </label>
      )}
      <input
        id={id}
        style={{ ...inputStyle, ...style }}
        onFocus={e => { e.target.style.borderColor = 'var(--color-ink)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.08)'; }}
        onBlur={e => { e.target.style.borderColor = 'var(--color-hairline)'; e.target.style.boxShadow = 'none'; }}
        {...props}
      />
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextArea({ label, id, style, ...props }: TextAreaProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 'var(--text-body-sm)', fontWeight: 480, letterSpacing: '-0.14px' }}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 80, ...style }}
        onFocus={e => { e.target.style.borderColor = 'var(--color-ink)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.08)'; }}
        onBlur={e => { e.target.style.borderColor = 'var(--color-hairline)'; e.target.style.boxShadow = 'none'; }}
        {...props}
      />
    </div>
  );
}
