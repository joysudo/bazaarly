import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input, TextArea } from '../ui/Input';
import { Button } from '../ui/Button';
import type { BazaarlyEvent } from '../../lib/types';

type EventDraft = Omit<BazaarlyEvent, 'id' | 'createdAt' | 'inventoryIds' | 'grossRevenue' | 'status'>;

interface CreateEventModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: EventDraft) => Promise<void>;
}

export function CreateEventModal({ open, onClose, onSubmit }: CreateEventModalProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [vendorFee, setVendorFee] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date || !vendorFee) return;
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), date, description: description.trim(), vendorFee: parseFloat(vendorFee) });
      setName(''); setDate(''); setDescription(''); setVendorFee('');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Event">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <Input
          label="Event Name"
          id="create-event-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Saturday Flea Market"
          required
        />
        <Input
          label="Date & Time"
          id="create-event-date"
          type="datetime-local"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
        />
        <TextArea
          label="Description (optional)"
          id="create-event-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What's this event about?"
          rows={3}
        />
        <Input
          label="Vendor Fee ($)"
          id="create-event-fee"
          type="number"
          min="0"
          step="0.01"
          value={vendorFee}
          onChange={e => setVendorFee(e.target.value)}
          placeholder="25.00"
          required
        />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', paddingTop: 'var(--space-xs)' }}>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create Event'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
