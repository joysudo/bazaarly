import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface ScanPlaceholderProps {
  open: boolean;
  onClose: () => void;
}

export function ScanPlaceholder({ open, onClose }: ScanPlaceholderProps) {
  return (
    <Modal open={open} onClose={onClose} title="Begin Scan Session">
      <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0' }}>
        <div style={{ fontSize: 56, marginBottom: 'var(--space-lg)' }}>🚧</div>
        <h3 style={{ margin: '0 0 var(--space-sm)', fontSize: 'var(--text-headline)', fontWeight: 540 }}>
          Camera scan coming soon
        </h3>
        <p style={{ margin: '0 0 var(--space-xl)', fontSize: 'var(--text-body-sm)', opacity: 0.6, lineHeight: 1.6 }}>
          The live scan session requires the backend camera script to be running.
          Use <strong>Upload Images</strong> to process items in the meantime.
        </p>
        <Button variant="primary" onClick={onClose}>Got it</Button>
      </div>
    </Modal>
  );
}
