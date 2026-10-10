import type { GarmentItem } from './types';

const BASE_URL = 'http://152.23.49.69:8000';
// const BASE_URL = '/vision-api';


export async function uploadFrame(file: File): Promise<GarmentItem> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/scan/frame`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function resolvePending(pendingId: string): Promise<GarmentItem> {
  const res = await fetch(`${BASE_URL}/scan/pending/${pendingId}/resolve`, { method: 'POST' });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
  return res.json();
}

export async function listItems(): Promise<GarmentItem[]> {
  const res = await fetch(`${BASE_URL}/items`);
  if (!res.ok) throw new Error(`Failed to list items: ${res.status}`);
  return res.json();
}

export async function getItem(itemId: string): Promise<GarmentItem> {
  const res = await fetch(`${BASE_URL}/items/${itemId}`);
  if (!res.ok) throw new Error(`Failed to get item: ${res.status}`);
  return res.json();
}

export async function patchItem(itemId: string, data: Partial<GarmentItem>): Promise<GarmentItem> {
  const res = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to patch item: ${res.status}`);
  return res.json();
}

export async function approveItem(itemId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/items/${itemId}/approve`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to approve: ${res.status}`);
}

export async function discardItem(itemId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/items/${itemId}/discard`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to discard: ${res.status}`);
}

export async function retryItem(itemId: string): Promise<GarmentItem> {
  const res = await fetch(`${BASE_URL}/items/${itemId}/retry`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to retry: ${res.status}`);
  return res.json();
}

export function getItemImageUrl(itemId: string, viewIndex = 0): string {
  return `${BASE_URL}/items/${itemId}/image/${viewIndex}`;
}
