import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { collection, addDoc, doc, deleteDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { mirrorItemImage } from '../../lib/imageUtils';
import {
  uploadFrame, getItem, approveItem, discardItem, retryItem, resolvePending,
  getItemImageUrl, fetchHighlight,
} from '../../lib/garmentVision';
import type { BazaarlyEvent, GarmentItem, Highlight, ScanResult } from '../../lib/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

// ── Expert scanner constants ──────────────────────────────────────────────────
const SCAN_INTERVAL_MS = 1500;  // min gap between scan attempts once still
const STILL_MS         = 1000;  // garment must hold this long before a photo is taken
const STILL_BOX        = 0.1;  // max outline edge drift (fraction of frame) that counts as still
const STILL_DIFF       = 12;     // max mean pixel change inside garment that counts as still
const HL_INTERVAL_MS   = 150;   // how often to poll /scan/highlight
const FILL_ALPHA       = 0.05;  // mask fill opacity
const STALE_MS         = 1500;  // hide overlay if server stops responding
const TW               = 160;   // tracking canvas width
const SEARCH           = 8;     // max motion per frame (tracking pixels)
const STRIDE           = 2;     // sample every Nth pixel inside garment
const MAX_ERR          = 25;    // mean pixel error above which track is lost

// ── Pure math helpers (module-level, no React) ────────────────────────────────

function bboxOf(outline: [number, number][]): [number, number, number, number] {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y] of outline) {
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function regionDiff(a: Uint8Array, b: Uint8Array, pts: Int32Array): number {
  let sum = 0, n = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const k = pts[i + 1] * TW + pts[i];
    const d = a[k] - b[k];
    sum += d < 0 ? -d : d;
    n++;
  }
  return n ? sum / n : 0;
}

function estimateShift(
  prev: Uint8Array, cur: Uint8Array, pts: Int32Array,
  offX: number, offY: number,
  th: number, sad: Float64Array,
): { dx: number; dy: number; err: number } | null {
  const n = 2 * SEARCH + 1;
  const ox = Math.round(offX), oy = Math.round(offY);
  sad.fill(0);
  let used = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i] + ox, py = pts[i + 1] + oy;
    if (px < SEARCH || py < SEARCH || px >= TW - SEARCH || py >= th - SEARCH) continue;
    const pv = prev[py * TW + px];
    used++;
    for (let dy = -SEARCH; dy <= SEARCH; dy++) {
      const row = (py + dy) * TW + px;
      const base = (dy + SEARCH) * n + SEARCH;
      for (let dx = -SEARCH; dx <= SEARCH; dx++) {
        const d = cur[row + dx] - pv;
        sad[base + dx] += d < 0 ? -d : d;
      }
    }
  }
  if (used < 40) return null;

  let best = Infinity, bx = 0, by = 0;
  for (let y = -SEARCH; y <= SEARCH; y++) {
    for (let x = -SEARCH; x <= SEARCH; x++) {
      const k = (y + SEARCH) * n + x + SEARCH;
      sad[k] += used * 0.02 * (x * x + y * y);
      if (sad[k] < best) { best = sad[k]; bx = x; by = y; }
    }
  }
  const at = (x: number, y: number) => sad[(y + SEARCH) * n + x + SEARCH];
  let sx = 0, sy = 0;
  if (bx > -SEARCH && bx < SEARCH) {
    const a = at(bx - 1, by), c = at(bx + 1, by), den = a - 2 * best + c;
    if (den > 0) sx = (a - c) / (2 * den);
  }
  if (by > -SEARCH && by < SEARCH) {
    const a = at(bx, by - 1), c = at(bx, by + 1), den = a - 2 * best + c;
    if (den > 0) sy = (a - c) / (2 * den);
  }
  const err = (best - used * 0.02 * (bx * bx + by * by)) / used;
  return { dx: bx + sx, dy: by + sy, err };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanSessionModalProps {
  open: boolean;
  onClose: () => void;
  events: BazaarlyEvent[];
  onSessionComplete: () => void;
}

type Phase     = 'confirm' | 'scanning' | 'wrapup';
type ScanState = 'idle' | 'scanning' | 'duplicate' | 'processing' | 'review';

interface SessionItem {
  firestoreId: string;
  garmentItemId: string;
  title: string;
  imageUrl: string;
  price: number;
  garmentType: string;
}

interface DuplicateInfo {
  pendingId: string;
  existing: { item_id: string; image_url: string; overview: string | null } | null;
}

interface DraftFields {
  title: string;
  price: string;
  garmentType: string;
  colors: string[];
  keywords: string[];
  overview: string;
  artwork: string;
}

interface TrackingState {
  prev: Uint8Array | null;
  pts: Int32Array | null;
  hl: { outline: [number, number][]; img: HTMLImageElement; at: number } | null;
  cumX: number; cumY: number;
  anchorX: number; anchorY: number;
}

interface StillState {
  bbox: [number, number, number, number] | null;
  ref: Uint8Array | null;
  since: number;
}

function parsePriceStr(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/[^0-9.]/g, '') || '';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScanSessionModal({ open, onClose, events, onSessionComplete }: ScanSessionModalProps) {
  // ─ Phase & scan state ─────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('confirm');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const scanStateRef = useRef<ScanState>('idle');
  const busyRef      = useRef(false);
  const currentItemIdRef = useRef<string | null>(null);
  const pendingIdRef     = useRef<string | null>(null);
  const pollTimerRef     = useRef<number | null>(null);

  // ─ UI state ───────────────────────────────────────────────────────────────
  const [statusMsg, setStatusMsg] = useState('');
  const statusMsgRef = useRef('');   // dedup: only call setStatusMsg when text actually changes
  const [currentGarment, setCurrentGarment] = useState<GarmentItem | null>(null);
  const [duplicateInfo, setDuplicateInfo]   = useState<DuplicateInfo | null>(null);
  const [sessionItems, setSessionItems]     = useState<SessionItem[]>([]);
  const [assignEventId, setAssignEventId]   = useState('');
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectBusy, setRejectBusy]   = useState(false);
  const [wrapping, setWrapping]       = useState(false);

  // ─ Draft form ─────────────────────────────────────────────────────────────
  const [draft, setDraft]           = useState<DraftFields | null>(null);
  const [colorInput, setColorInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  // ─ Video / canvas refs ────────────────────────────────────────────────────
  const videoRef         = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);  // hidden, for full-res captures
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);  // visible overlay, drawn imperatively

  // Off-screen canvases (created once, never in DOM)
  const hlCanvasRef = useRef<HTMLCanvasElement | null>(null);  // low-res frames for /scan/highlight
  const tCanvasRef  = useRef<HTMLCanvasElement | null>(null);  // tracking resolution grayscale
  const rCanvasRef  = useRef<HTMLCanvasElement | null>(null);  // outline rasterization

  // ─ Tracking refs (mutated directly — never trigger re-renders) ────────────
  const trkRef  = useRef<TrackingState>({ prev: null, pts: null, hl: null, cumX: 0, cumY: 0, anchorX: 0, anchorY: 0 });
  const stillRef = useRef<StillState>({ bbox: null, ref: null, since: 0 });
  const stillReadyRef  = useRef(false);
  const lastAttemptRef = useRef(0);
  const hlBusyRef      = useRef(false);
  const thRef          = useRef(120);  // tracking canvas height (recalculated from video aspect)
  const sadRef         = useRef<Float64Array | null>(null);

  // ─ Loop control ───────────────────────────────────────────────────────────
  const trackActiveRef = useRef(false);
  const hlIntervalRef  = useRef<number | null>(null);
  const scanTickRef    = useRef<(() => Promise<void>) | undefined>(undefined);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setScanStateSync(s: ScanState) {
    scanStateRef.current = s;
    setScanState(s);
  }

  function setStatus(msg: string) {
    if (statusMsgRef.current === msg) return;
    statusMsgRef.current = msg;
    setStatusMsg(msg);
  }

  function resumeScanning(msg?: string) {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    currentItemIdRef.current = null;
    pendingIdRef.current = null;
    setCurrentGarment(null);
    setDuplicateInfo(null);
    setDraft(null);
    setScanStateSync('scanning');
    setStatus(msg ?? 'Show an item to the camera');
    lastAttemptRef.current = performance.now(); // keep message visible briefly
  }

  function stopCamera() {
    trackActiveRef.current = false;
    if (hlIntervalRef.current) { 
      clearInterval(hlIntervalRef.current); 
      hlIntervalRef.current = null; 
    }
    hlBusyRef.current = false;
    clearHighlightTracking();

    const v = videoRef.current;
    if (v?.srcObject) {
      (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      v.srcObject = null;
    }
  }

  // ── Scan state machine ─────────────────────────────────────────────────────

  function handleScanResult(result: ScanResult) {
    // Overlay is managed by the tracking loop — scan results don't touch it
    // console.log('Scan response:', result);
    switch (result.result) {
      case 'new_item':
      case 'awaiting_approval':
        startProcessing(result.item_id);
        break;
      case 'duplicate_pending':
        setScanStateSync('duplicate');
        pendingIdRef.current = result.pending_id;
        setDuplicateInfo({ pendingId: result.pending_id, existing: result.existing_item });
        setStatus('Possible duplicate — confirm below');
        break;
      case 'awaiting_user':
        setScanStateSync('duplicate');
        pendingIdRef.current = result.pending_id;
        setDuplicateInfo({ pendingId: result.pending_id, existing: null });
        setStatus('Pending duplicate — confirm below');
        break;
      case 'rejected':
        setStatus('Too blurry. Hold the item steady or wipe the camera lens');
        break;
      case 'no_garment':
        setStatus('No garment detected. Hold one up');
        break;
      case 'suppressed':
        setStatus('Same item still in view');
        break;
      case 'cooldown':
        setStatus('Taking a breath… cooldown active');
        break;
      default:
        setStatus('Hold still…');
    }
  }

  function startProcessing(itemId: string) {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    currentItemIdRef.current = itemId;
    setScanStateSync('processing');
    setCurrentGarment(null);
    setDraft(null);
    setStatus('Analysing item…');

    const poll = async () => {
      if (scanStateRef.current !== 'processing' || currentItemIdRef.current !== itemId) return;
      try {
        const item = await getItem(itemId);
        if (scanStateRef.current !== 'processing' || currentItemIdRef.current !== itemId) return;
        if (item.status === 'ready') {
          setScanStateSync('review');
          setCurrentGarment(item);
          setStatus('Review the item, then approve or reject');
        } else if (item.status === 'error') {
          setScanStateSync('review');
          setCurrentGarment(item);
          setStatus('Analysis failed');
        } else {
          pollTimerRef.current = window.setTimeout(poll, 1500);
        }
      } catch {
        pollTimerRef.current = window.setTimeout(poll, 2000);
      }
    };
    pollTimerRef.current = window.setTimeout(poll, 1000);
  }

  // ── Expert scanner: scan tick (called by stillness gate, NOT on a timer) ───

  const scanTickFn = async () => {
    if (scanStateRef.current !== 'scanning' || busyRef.current) return;
    const video  = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !video.videoWidth || !canvas) return;

    busyRef.current = true;
    setStatus('Taking photo…');
    try {
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width  = video.videoWidth  * scale;
      canvas.height = video.videoHeight * scale;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Capture failed')), 'image/jpeg', 0.9)
      );
      
      setStatus('Uploading & analyzing…');
      const result = await uploadFrame(blob);
      if (scanStateRef.current === 'scanning') handleScanResult(result);
    } catch (e) {
      setStatus('Scan error: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      busyRef.current = false;
      lastAttemptRef.current = performance.now();
    }
  };
  scanTickRef.current = scanTickFn; // always fresh — called from trackLoop via ref
  
  // ── Expert scanner: tracking helpers ──────────────────────────────────────

  function syncTH() {
    const v = videoRef.current;
    if (v && v.videoWidth) thRef.current = Math.max(1, Math.round(TW * v.videoHeight / v.videoWidth));
  }

  function clearHighlightTracking() {
    trkRef.current  = { prev: null, pts: null, hl: null, cumX: 0, cumY: 0, anchorX: 0, anchorY: 0 };
    stillRef.current = { bbox: null, ref: null, since: 0 };
    stillReadyRef.current  = false;
    const oc = overlayCanvasRef.current;
    if (oc) oc.getContext('2d')?.clearRect(0, 0, oc.width, oc.height);
  }

  function noteStill(outline: [number, number][]) {
    const bb  = bboxOf(outline);
    const now = performance.now();
    const s   = stillRef.current;
    if (!s.bbox) { s.bbox = bb; s.ref = null; s.since = now; return; }
    let moved = 0;
    for (let i = 0; i < 4; i++) moved = Math.max(moved, Math.abs(bb[i] - (s.bbox as number[])[i]));
    if (moved > STILL_BOX) { s.bbox = bb; s.ref = null; s.since = now; }
  }

  function setKeyframe(hl: Highlight | null, sentX: number, sentY: number) {
    if (!hl) { clearHighlightTracking(); return; }
    syncTH();
    const img = new Image();
    if (hl.mask_png) img.src = `data:image/png;base64,${hl.mask_png}`;
    trkRef.current.hl      = { outline: hl.outline as [number, number][], img, at: performance.now() };
    trkRef.current.anchorX = sentX;
    trkRef.current.anchorY = sentY;
    trkRef.current.pts     = rasterize(hl.outline as [number, number][]);
    noteStill(hl.outline as [number, number][]);
  }

  function grabGray(): Uint8Array {
    syncTH();
    const tc  = tCanvasRef.current!;
    const th  = thRef.current;
    const v   = videoRef.current!;
    if (tc.width !== TW || tc.height !== th) {
      tc.width = TW; tc.height = th;
      trkRef.current.prev = null;
      stillRef.current.ref = null;
    }
    const ctx = tc.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, TW, th);
    const d = ctx.getImageData(0, 0, TW, th).data;
    const g = new Uint8Array(TW * th);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    }
    return g;
  }

  function rasterize(outline: [number, number][]): Int32Array {
    const rc  = rCanvasRef.current!;
    const th  = thRef.current;
    rc.width  = TW; rc.height = th;
    const ctx = rc.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, TW, th);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    outline.forEach(([x, y], i) => i ? ctx.lineTo(x * TW, y * th) : ctx.moveTo(x * TW, y * th));
    ctx.closePath();
    ctx.fill();
    const a   = ctx.getImageData(0, 0, TW, th).data;
    const pts: number[] = [];
    for (let y = 0; y < th; y += STRIDE)
      for (let x = 0; x < TW; x += STRIDE)
        if (a[(y * TW + x) * 4 + 3] > 128) pts.push(x, y);
    return Int32Array.from(pts);
  }

  function renderHighlightCanvas() {
    const oc  = overlayCanvasRef.current;
    const v   = videoRef.current;
    if (!oc || !v) return;
    if (oc.width !== v.videoWidth || oc.height !== v.videoHeight) {
      oc.width = v.videoWidth; oc.height = v.videoHeight;
    }
    const ctx = oc.getContext('2d')!;
    ctx.clearRect(0, 0, oc.width, oc.height);
    const trk = trkRef.current;
    const k   = trk.hl;
    if (!k || performance.now() - k.at > STALE_MS) return;

    const sx = (trk.cumX - trk.anchorX) / TW     * oc.width;
    const sy = (trk.cumY - trk.anchorY) / thRef.current * oc.height;
    if (k.img.complete && k.img.naturalWidth) {
      ctx.globalAlpha = FILL_ALPHA;
      ctx.drawImage(k.img, sx, sy, oc.width, oc.height);
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    k.outline.forEach(([x, y], i) => {
      const px = x * oc.width + sx, py = y * oc.height + sy;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = stillReadyRef.current ? 'rgb(0, 200, 120)' : 'rgb(255, 170, 0)';
    ctx.lineWidth   = Math.max(3, oc.width / 200);
    ctx.stroke();
  }

  // Stillness gate: decides when to fire scanTick and updates the status message
  function updateGate(now: number) {
    const trk   = trkRef.current;
    const still = stillRef.current;
    const fresh = !!(trk.hl && now - trk.hl.at < STALE_MS);
    if (!fresh) { still.bbox = null; still.ref = null; still.since = 0; stillReadyRef.current = false; }
    else stillReadyRef.current = !!(still.bbox && now - still.since >= STILL_MS);

    if (stillReadyRef.current && !busyRef.current && now - lastAttemptRef.current >= SCAN_INTERVAL_MS) {
      lastAttemptRef.current = now;
      scanTickRef.current?.();
      return;
    }
    // Only update status when result message has had time to be seen (2.5s)
    if (!busyRef.current && now - lastAttemptRef.current > 2500) {
      const msg = !fresh ? 'Show an item to the camera'
        : stillReadyRef.current ? 'Hold still…'
        : `Hold still for ${(Math.floor(Math.max(0, STILL_MS - (now - still.since)) / 100) / 10).toFixed(1)}s`;
      setStatus(msg);
    }
  }

  // Per-frame tracking loop (requestVideoFrameCallback or rAF)
  function startTrackLoop() {
    if (!hlCanvasRef.current) hlCanvasRef.current = document.createElement('canvas');
    if (!tCanvasRef.current)  tCanvasRef.current  = document.createElement('canvas');
    if (!rCanvasRef.current)  rCanvasRef.current  = document.createElement('canvas');
    if (!sadRef.current)      sadRef.current       = new Float64Array((2 * SEARCH + 1) ** 2);

    clearHighlightTracking();
    trackActiveRef.current = true;
    const video = videoRef.current!;

    const step = () => {
      if (!trackActiveRef.current) return;
      const now = performance.now();
      if (scanStateRef.current !== 'scanning') {
        if (trkRef.current.hl) clearHighlightTracking();
      } else if (video.videoWidth) {
        const trk = trkRef.current;
        if (trk.pts) {
          const cur = grabGray();
          if (trk.prev) {
            const m = estimateShift(trk.prev, cur, trk.pts, trk.cumX - trk.anchorX, trk.cumY - trk.anchorY, thRef.current, sadRef.current!);
            if (m && m.err < MAX_ERR) { trk.cumX += m.dx; trk.cumY += m.dy; }
          }
          trk.prev = cur;
          const still = stillRef.current;
          if (still.bbox && trk.hl && now - trk.hl.at < STALE_MS) {
            if (!still.ref) still.ref = cur;
            else if (regionDiff(still.ref, cur, trk.pts) > STILL_DIFF) { still.ref = cur; still.since = now; }
          }
          renderHighlightCanvas();
        }
        updateGate(now);
      }
      if ((video as unknown as { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback) {
        (video as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(step);
      } else {
        requestAnimationFrame(step);
      }
    };

    if ((video as unknown as { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback) {
      (video as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(step);
    } else {
      requestAnimationFrame(step);
    }
  }

  // Low-res polling loop for server outline keyframes (runs every HL_INTERVAL_MS)
  async function highlightTickFn() {
    const video = videoRef.current;
    if (scanStateRef.current !== 'scanning' || hlBusyRef.current || !video?.videoWidth) return;
    hlBusyRef.current = true;
    try {
      const hc = hlCanvasRef.current!;
      const w  = 320, h = Math.round(w * video.videoHeight / video.videoWidth);
      hc.width = w; hc.height = h;
      hc.getContext('2d')!.drawImage(video, 0, 0, w, h);
      const sentX = trkRef.current.cumX, sentY = trkRef.current.cumY;
      const blob = await new Promise<Blob | null>(r => hc.toBlob(r, 'image/jpeg', 0.6));
      if (!blob) return;
      const data = await fetchHighlight(blob);
      if (data && scanStateRef.current === 'scanning') setKeyframe(data.highlight, sentX, sentY);
    } catch { /* next tick retries */ }
    finally { hlBusyRef.current = false; }
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  // Camera + track loop + highlight polling
  useEffect(() => {
    if (!open || phase !== 'scanning') return;
    let cameraActive = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        if (!cameraActive) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = stream;
        v.addEventListener('loadedmetadata', () => {
          if (!cameraActive) return;
          startTrackLoop();
          hlIntervalRef.current = window.setInterval(() => { highlightTickFn(); }, HL_INTERVAL_MS);
          setScanStateSync('scanning');
          setStatus('Show an item to the camera');
        }, { once: true });
      })
      .catch(e => {
        if (!cameraActive) return;
        setStatus('Camera error: ' + (e.message || 'Permission denied'));
        setPhase('confirm');
      });

    return () => {
      cameraActive = false;
      trackActiveRef.current = false;
      if (hlIntervalRef.current) { clearInterval(hlIntervalRef.current); hlIntervalRef.current = null; }
      hlBusyRef.current = false;
      clearHighlightTracking();
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        v.srcObject = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  // Full reset when modal closes
  useEffect(() => {
    if (!open) {
      if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
      busyRef.current = false;
      currentItemIdRef.current = null;
      pendingIdRef.current = null;
      trackActiveRef.current = false;
      hlBusyRef.current = false;
      clearHighlightTracking();
      setScanStateSync('idle');
      setPhase('confirm');
      setCurrentGarment(null);
      setDuplicateInfo(null);
      setDraft(null);
      setSessionItems([]);
      statusMsgRef.current = '';
      setStatusMsg('');
      setAssignEventId('');
      setApproveBusy(false);
      setRejectBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Populate draft when item is ready for review
  useEffect(() => {
    if (!currentGarment || scanState !== 'review' || currentGarment.status !== 'ready') return;
    const desc = currentGarment.descriptions;
    setDraft({
      title: desc?.short_title ?? desc?.overview?.slice(0, 60) ?? '',
      price: parsePriceStr(desc?.price),
      garmentType: desc?.garment_type ?? '',
      colors: desc?.main_colors ?? [],
      keywords: desc?.search_text ?? [],
      overview: desc?.overview ?? '',
      artwork: desc?.sections?.prints_graphics_text ?? '',
    });
    setColorInput('');
    setKeywordInput('');
  }, [currentGarment, scanState]);

  // ── Draft helpers ──────────────────────────────────────────────────────────

  function addColor() {
    const v = colorInput.trim().toLowerCase();
    if (v && draft && !draft.colors.includes(v)) setDraft(d => d ? { ...d, colors: [...d.colors, v] } : d);
    setColorInput('');
  }

  function addKeyword() {
    const v = keywordInput.trim().toLowerCase();
    if (v && draft && !draft.keywords.includes(v)) setDraft(d => d ? { ...d, keywords: [...d.keywords, v] } : d);
    setKeywordInput('');
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!currentGarment || !draft || approveBusy) return;
    setApproveBusy(true);
    try {
      await approveItem(currentGarment.item_id);
      const imageUrl = await mirrorItemImage(currentGarment.item_id);
      const price    = parseFloat(draft.price) || 0;
      const title    = draft.title.trim() || draft.overview.slice(0, 60) || 'Untitled';
      const docRef   = await addDoc(collection(db, 'inventory'), {
        serviceItemId: currentGarment.item_id,
        price, title,
        status: 'approved',
        imageUrl,
        overview:    currentGarment.descriptions?.overview ?? '',
        garmentType: draft.garmentType.trim(),
        mainColors:  draft.colors,
        searchText:  draft.keywords,
        artwork:     draft.artwork,
        eventId:     null,
        createdAt:   new Date().toISOString(),
      });
      setSessionItems(prev => [...prev, {
        firestoreId: docRef.id,
        garmentItemId: currentGarment.item_id,
        title, imageUrl, price,
        garmentType: draft.garmentType.trim(),
      }]);
      resumeScanning('Approved! Show the next item');
    } catch (e) {
      setStatus('Approve failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setApproveBusy(false);
    }
  }

  async function handleReject() {
    if (!currentGarment || rejectBusy) return;
    setRejectBusy(true);
    try { await discardItem(currentGarment.item_id); } catch { /* best-effort */ }
    setRejectBusy(false);
    resumeScanning('Rejected. Show the next item');
  }

  async function handleRetry() {
    if (!currentGarment) return;
    try {
      await retryItem(currentGarment.item_id);
      startProcessing(currentGarment.item_id);
    } catch (e) {
      setStatus('Retry failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    }
  }

  async function resolveDuplicate(action: 'add' | 'dismiss') {
    if (!duplicateInfo) return;
    try {
      const result = await resolvePending(duplicateInfo.pendingId, action);
      if (result.result === 'new_item') startProcessing(result.item_id);
      else resumeScanning();
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : 'Unknown'));
    }
  }

  async function deleteSessionItem(item: SessionItem) {
    try { await deleteDoc(doc(db, 'inventory', item.firestoreId)); } catch { /* ignore */ }
    discardItem(item.garmentItemId).catch(() => {});
    setSessionItems(prev => prev.filter(i => i.firestoreId !== item.firestoreId));
  }

  async function handleWrapup() {
    if (wrapping) return;
    setWrapping(true);
    try {
      if (assignEventId && sessionItems.length > 0) {
        const batch = writeBatch(db);
        for (const item of sessionItems)
          batch.update(doc(db, 'inventory', item.firestoreId), { eventId: assignEventId });
        batch.update(doc(db, 'events', assignEventId), {
          inventoryIds: arrayUnion(...sessionItems.map(i => i.firestoreId)),
        });
        await batch.commit();
      }
      onSessionComplete();
    } catch (e) {
      setStatus('Save failed: ' + (e instanceof Error ? e.message : 'Unknown'));
      setWrapping(false);
    }
  }

  function handleClose() {
    const v = videoRef.current;
    if (v?.srcObject) {
      (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      v.srcObject = null;
    }
    onClose();
    stopCamera();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--color-canvas)', display: 'flex', flexDirection: 'column' }}>
      {phase === 'confirm' && renderConfirm()}
      {phase === 'scanning' && renderScanning()}
      {phase === 'wrapup'   && renderWrapup()}
      {/* Hidden canvas for full-res captures sent to /scan/frame */}
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
    </div>
  );

  // ── Phase renders ──────────────────────────────────────────────────────────

function renderConfirm() {
    return (
      <>
        <style>{`
          @keyframes stepFadeIn {
            from {
              opacity: 0;
              transform: translateY(12px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
        <div 
          style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: 'var(--space-xl)',
            animation: 'stepFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.4, marginBottom: 'var(--space-md)' }}>
              Scan Session
            </div>
            <h2 style={{ margin: '0 0 var(--space-md)', fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 340, letterSpacing: '-0.8px', lineHeight: 1.1 }}>
              Ready to scan?
            </h2>
            <p style={{ margin: '0 0 var(--space-xl)', fontSize: 'var(--text-body)', opacity: 0.6, lineHeight: 1.65 }}>
              Hold items up to your camera one at a time. The AI detects garments automatically — it waits until the item is held still before photographing, so no button-pressing required.
            </p>
            {statusMsg && (
              <p style={{ color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)', marginBottom: 'var(--space-md)' }}>
                {statusMsg}
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center' }}>
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button variant="primary" onClick={() => setPhase('scanning')}>Start Scanning</Button>
            </div>
          </div>
        </div>
      </>
    );
  }
  
  function renderScanning() {
    return (
      <>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '0 var(--space-lg)', height: 56, borderBottom: '1px solid var(--color-hairline)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.45 }}>
            Scan Session
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', background: 'var(--color-block-lime)', padding: '2px 10px', borderRadius: 'var(--radius-pill)' }}>
            {sessionItems.length} approved
          </span>
          <div style={{ flex: 1 }} />
          
          <Button variant="secondary" onClick={() => {stopCamera(); setPhase('wrapup');}} style={{ fontSize: 'var(--text-body-sm)' }}>
            End Session →
          </Button>
          <Button variant="icon" onClick={handleClose}>✕</Button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left panel */}
          <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--color-hairline)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, overflowY: 'auto', maxHeight: '62%', padding: 'var(--space-lg)' }}>
              {renderLeftPanelContent()}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--color-hairline-soft)' }}>
              <div style={{ padding: 'var(--space-md) var(--space-lg) var(--space-xs)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.4 }}>This Session</span>
              </div>
              {sessionItems.length === 0 ? (
                <div style={{ padding: '0 var(--space-lg) var(--space-md)', fontSize: 'var(--text-body-sm)', opacity: 0.3 }}>
                  Approved items appear here
                </div>
              ) : (
                <div style={{ padding: '0 var(--space-md) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sessionItems.map(item => (
                    <SessionItemRow key={item.firestoreId} item={item} onDelete={() => deleteSessionItem(item)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: live video + overlay */}
          <div style={{ flex: 1, background: '#111', position: 'relative', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
            {/* Overlay canvas drawn imperatively by the tracking loop */}
            <canvas
              ref={overlayCanvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 'var(--space-lg) var(--space-lg) var(--space-md)', background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', color: 'rgba(255,255,255,0.88)', fontSize: 'var(--text-body-sm)', fontWeight: 480, pointerEvents: 'none' }}>
              {statusMsg}
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderLeftPanelContent() {
    switch (scanState) {
      case 'processing':
        return (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.45, marginBottom: 8 }}>Analysing</div>
            <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.5 }}>AI is describing the garment…</p>
          </div>
        );

      case 'review':
        if (!currentGarment) return null;
        if (currentGarment.status === 'error') {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.45 }}>Analysis Failed</div>
              <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.6 }}>{currentGarment.error ?? 'Unknown error'}</p>
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <Button variant="secondary" style={{ fontSize: 'var(--text-body-sm)' }} onClick={handleRetry}>Retry AI</Button>
                <Button variant="tertiary" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--color-accent-magenta)' }} onClick={handleReject}>Skip</Button>
              </div>
            </div>
          );
        }
        if (!draft) return null;
        return renderDraftForm();

      case 'duplicate':
        return renderDuplicatePanel();

      default:
        return (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgb(0, 200, 120)', margin: '0 auto var(--space-md)', boxShadow: '0 0 0 6px rgba(0,200,120,0.15)' }} />
            <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.4 }}>
              Hold a garment up to the camera
            </p>
          </div>
        );
    }
  }

  function renderDraftForm() {
    if (!draft || !currentGarment) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface-soft)', marginBottom: 2 }}>
          <img src={getItemImageUrl(currentGarment.item_id)} alt="Item" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        </div>
        <input value={draft.title} onChange={e => setDraft(d => d ? { ...d, title: e.target.value } : d)} placeholder="Item name…" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-card-title)', fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-ink)', width: '100%', padding: 0, lineHeight: 1.3 }} />
        {draft.overview && (
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.5, fontStyle: 'italic', lineHeight: 1.45 }}>
            {draft.overview.slice(0, 120)}{draft.overview.length > 120 ? '…' : ''}
          </p>
        )}
        <div style={{ height: 1, background: 'var(--color-hairline-soft)' }} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <div style={{ flex: '0 0 90px' }}>
            <Input label="Price ($)" id="scan-price" type="number" min="0" step="0.50" value={draft.price} onChange={e => setDraft(d => d ? { ...d, price: e.target.value } : d)} />
          </div>
          <div style={{ flex: 1 }}>
            <Input label="Type" id="scan-type" value={draft.garmentType} onChange={e => setDraft(d => d ? { ...d, garmentType: e.target.value } : d)} placeholder="T-shirt, jacket…" />
          </div>
        </div>
        <TagField label="Colors" tags={draft.colors} input={colorInput} onInputChange={setColorInput} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addColor(); } }} onAdd={addColor} onRemove={c => setDraft(d => d ? { ...d, colors: d.colors.filter(x => x !== c) } : d)} colorDot />
        <TagField label="Keywords" tags={draft.keywords} input={keywordInput} onInputChange={setKeywordInput} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); } }} onAdd={addKeyword} onRemove={k => setDraft(d => d ? { ...d, keywords: d.keywords.filter(x => x !== k) } : d)} />
        <div style={{ display: 'flex', gap: 'var(--space-xs)', paddingTop: 4 }}>
          <Button variant="primary" onClick={handleApprove} disabled={approveBusy || rejectBusy} style={{ flex: 1, fontSize: 'var(--text-body-sm)' }}>
            {approveBusy ? 'Saving…' : 'Approve'}
          </Button>
          <Button variant="tertiary" onClick={handleReject} disabled={approveBusy || rejectBusy} style={{ color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
            {rejectBusy ? '…' : 'Reject'}
          </Button>
        </div>
      </div>
    );
  }

  function renderDuplicatePanel() {
    if (!duplicateInfo) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.45 }}>Possible Duplicate</div>
        {duplicateInfo.existing && (
          <>
            <div style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface-soft)' }}>
              <img src={duplicateInfo.existing.image_url} alt="Existing" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
            </div>
            {duplicateInfo.existing.overview && (
              <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.6, fontStyle: 'italic', lineHeight: 1.45 }}>
                {duplicateInfo.existing.overview.slice(0, 100)}
              </p>
            )}
          </>
        )}
        <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.7 }}>
          {duplicateInfo.existing ? 'This looks like an item already scanned.' : 'A pending scan exists for this item.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <Button variant="secondary" onClick={() => resolveDuplicate('add')} style={{ flex: 1, fontSize: 'var(--text-body-sm)' }}>Different item</Button>
          <Button variant="tertiary" onClick={() => resolveDuplicate('dismiss')} style={{ fontSize: 'var(--text-body-sm)' }}>Same, ignore</Button>
        </div>
      </div>
    );
  }

  function renderWrapup() {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '0 var(--space-xl)', height: 56, borderBottom: '1px solid var(--color-hairline)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.45 }}>Session Summary</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', background: 'var(--color-block-lime)', padding: '2px 10px', borderRadius: 'var(--radius-pill)' }}>
            {sessionItems.length} item{sessionItems.length !== 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" onClick={() => setPhase('scanning')} style={{ fontSize: 'var(--text-body-sm)' }}>← Back to scanning</Button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)' }}>
          {sessionItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-section)', opacity: 0.4 }}>
              <p style={{ fontSize: 'var(--text-body-sm)', margin: 0 }}>No items approved in this session.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
              {sessionItems.map(item => (
                <WrapupCard key={item.firestoreId} item={item} onDelete={() => deleteSessionItem(item)} />
              ))}
            </div>
          )}
          <div style={{ maxWidth: 480, borderTop: '1px solid var(--color-hairline-soft)', paddingTop: 'var(--space-lg)' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-body-sm)', fontWeight: 480, letterSpacing: '-0.14px', marginBottom: 6 }}>Assign to event (optional)</label>
            <select value={assignEventId} onChange={e => setAssignEventId(e.target.value)} style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', background: 'var(--color-canvas)', color: 'var(--color-ink)', border: '1.5px solid var(--color-hairline)', borderRadius: 'var(--radius-md)', padding: '10px 12px', width: '100%', outline: 'none', cursor: 'pointer' }}>
              <option value="">No event</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}{ev.status === 'past' ? ' (past)' : ''}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
              <Button variant="secondary" onClick={handleClose} style={{ fontSize: 'var(--text-body-sm)' }}>Discard session</Button>
              <Button variant="primary" onClick={handleWrapup} disabled={wrapping} style={{ fontSize: 'var(--text-body-sm)' }}>
                {wrapping ? 'Saving…' : assignEventId ? 'Save & assign to event' : 'Save & close'}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SessionItemRow({ item, onDelete }: { item: SessionItem; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
      <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--color-hairline-soft)' }}>
        <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 480, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.4 }}>
          {[item.garmentType, item.price > 0 ? `$${item.price.toFixed(2)}` : ''].filter(Boolean).join(' · ')}
        </div>
      </div>
      <button onClick={onDelete} title="Remove from session" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, opacity: 0.3, fontSize: 15, display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--color-ink)', lineHeight: 1 }}>🗑</button>
    </div>
  );
}

function WrapupCard({ item, onDelete }: { item: SessionItem; onDelete: () => void }) {
  return (
    <div style={{ background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative' }}>
      <div style={{ aspectRatio: '1', overflow: 'hidden', background: 'var(--color-hairline-soft)' }}>
        <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
      </div>
      <button onClick={onDelete} title="Remove" style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-full)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, opacity: 0.85 }}>🗑</button>
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{ fontWeight: 480, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
        {item.price > 0 && <div style={{ fontWeight: 700, fontSize: 12, marginTop: 2 }}>${item.price.toFixed(2)}</div>}
        {item.garmentType && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.4, marginTop: 2 }}>{item.garmentType}</div>}
      </div>
    </div>
  );
}

interface TagFieldProps {
  label: string; tags: string[]; input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onAdd: () => void; onRemove: (tag: string) => void; colorDot?: boolean;
}

function TagField({ label, tags, input, onInputChange, onKeyDown, onAdd, onRemove, colorDot }: TagFieldProps) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {tags.map(tag => (
          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-pill)', padding: '2px 8px 2px 6px', fontSize: 12, fontWeight: 480 }}>
            {colorDot && <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: tag.replace(/\s+/g, ''), border: '1px solid rgba(0,0,0,0.1)' }} />}
            {tag}
            <button onClick={() => onRemove(tag)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.4, fontSize: 12, display: 'flex' }}>×</button>
          </span>
        ))}
        <input value={input} onChange={e => onInputChange(e.target.value)} onKeyDown={onKeyDown} onBlur={onAdd} placeholder="Add…" style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-ink)', minWidth: 50, flex: 1 }} />
      </div>
    </div>
  );
}
