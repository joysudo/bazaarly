import type { GarmentItem, Highlight } from './types';
import type { ScanResult, ResolveResult, EchoResult } from './types';


// const BASE_URL = 'http://152.23.49.69:8000';
// const BASE_URL = 'http://0.0.0.0:8000';
const BASE_URL = '/vision-api';

export function getSessionId(): string {
  let id = localStorage.getItem('garmentSessionId');
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('garmentSessionId', id);
  }
  return id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export function buildScanForm(file: Blob, sessionId = getSessionId()): FormData {
  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('image', file, file instanceof File ? file.name : 'frame.jpg');
  return form;
}

export const uploadFrame = (file: Blob) =>
  request<ScanResult>('/scan/frame', { method: 'POST', body: buildScanForm(file) });

export const listItems = () => request<GarmentItem[]>('/items');

export const getItem = (id: string) => request<GarmentItem>(`/items/${id}`);

export const patchItem = (id: string, data: Partial<GarmentItem>) =>
  request<GarmentItem>(`/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const approveItem = (id: string) =>
  request<GarmentItem>(`/items/${id}/approve`, { method: 'POST' });

export const discardItem = (id: string) =>
  request<GarmentItem>(`/items/${id}/discard`, { method: 'POST' });

export const retryItem = (id: string) =>
  request<GarmentItem>(`/items/${id}/retry`, { method: 'POST' });

export const resolvePending = (pendingId: string, action: 'add' | 'dismiss') =>
  request<ResolveResult>(`/scan/pending/${pendingId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });

export function getItemImageUrl(itemId: string, viewIndex = 0): string {
  return `${BASE_URL}/items/${itemId}/image/${viewIndex}`;
}

// Returns the server's garment outline for a low-res preview frame.
export async function fetchHighlight(blob: Blob): Promise<{ highlight: Highlight | null } | null> {
  const form = new FormData();
  form.append('image', blob, 'f.jpg');
  const res = await fetch(`${BASE_URL}/scan/highlight`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /scan/highlight -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<{ highlight: Highlight | null }>;
}

// Diagnostics
export const echoTest = (file: Blob) =>
  request<EchoResult>('/debug/echo', { method: 'POST', body: buildScanForm(file) });

export const getServerStatus = () => request<unknown>('/debug/status');