import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/discovery/types";

/**
 * Mapa leve sobre tiles do OpenStreetMap (sem dependência extra) com desenho de círculo/polígono.
 * Troca por Leaflet é simples: mesma interface de props.
 */
export type DrawMode = "pan" | "circle" | "polygon";
export type AreaShape =
  | { type: "circle"; center: LatLng; radiusKm: number }
  | { type: "polygon"; points: LatLng[] }
  | null;

const TILE = 256;
const project = (p: LatLng, z: number) => {
  const s = TILE * 2 ** z, sin = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
};
const unproject = (x: number, y: number, z: number): LatLng => {
  const s = TILE * 2 ** z, n = Math.PI - (2 * Math.PI * y) / s;
  return { lng: (x / s) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
};
const kmBetween = (a: LatLng, b: LatLng) => {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

interface Props {
  center: LatLng; zoom?: number; mode: DrawMode; shape: AreaShape;
  onShape: (s: AreaShape) => void; markers?: { lat: number; lng: number; label?: string }[];
  height?: number; onMove?: (c: LatLng) => void;
}

export function AreaMap({ center, zoom = 13, mode, shape, onShape, markers = [], height = 380, onMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: height });
  const [view, setView] = useState({ c: center, z: zoom });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);

  useEffect(() => { setView((v) => ({ ...v, c: center })); }, [center.lat, center.lng]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: height }));
    ro.observe(el); setSize({ w: el.clientWidth, h: height });
    return () => ro.disconnect();
  }, [height]);

  const origin = project(view.c, view.z);
  const left = origin.x - size.w / 2, top = origin.y - size.h / 2;
  const toScreen = useCallback((p: LatLng) => { const q = project(p, view.z); return { x: q.x - left, y: q.y - top }; }, [view.z, left, top]);
  const fromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return unproject(left + e.clientX - r.left, top + e.clientY - r.top, view.z);
  };

  const tiles: { key: string; x: number; y: number; url: string }[] = [];
  const n = 2 ** view.z;
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${view.z}/${tx}/${ty}`, x: tx * TILE - left, y: ty * TILE - top, url: `https://tile.openstreetmap.org/${view.z}/${wx}/${ty}.png` });
    }

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    if (mode === "circle") { const c = fromEvent(e); onShape({ type: "circle", center: c, radiusKm: 0.2 }); }
  };
  const onMoveEv = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (mode === "circle" && shape?.type === "circle") {
      onShape({ ...shape, radiusKm: Math.min(50, Math.max(0.2, kmBetween(shape.center, fromEvent(e)))) });
    } else if (mode === "pan" || mode === "polygon") {
      d.x = e.clientX; d.y = e.clientY;
      if (d.moved) { const c = unproject(origin.x - dx, origin.y - dy, view.z); setView((v) => ({ ...v, c })); onMove?.(c); }
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (mode === "polygon" && d && !d.moved) setDraft((p) => (p.length >= 200 ? p : [...p, fromEvent(e)]));
  };
  const finish = () => { if (draft.length >= 3) onShape({ type: "polygon", points: draft }); setDraft([]); };
  const clear = () => { setDraft([]); onShape(null); };

  const pts = (shape?.type === "polygon" ? shape.points : draft).map(toScreen);
  const circle = shape?.type === "circle" ? (() => {
    const c = toScreen(shape.center), edge = toScreen({ lat: shape.center.lat, lng: shape.center.lng + shape.radiusKm / (111.32 * Math.cos((shape.center.lat * Math.PI) / 180)) });
    return { ...c, r: Math.abs(edge.x - c.x) };
  })() : null;

  return (
    <div className="space-y-2">
      <div ref={ref} className="relative overflow-hidden rounded-xl border border-border bg-muted select-none touch-none"
        style={{ height, cursor: mode === "pan" ? "grab" : "crosshair" }}
        onPointerDown={onDown} onPointerMove={onMoveEv} onPointerUp={onUp}
        onWheel={(e) => setView((v) => ({ ...v, z: Math.min(18, Math.max(4, v.z + (e.deltaY < 0 ? 1 : -1))) }))}>
        {tiles.map((t) => (
          <img key={t.key} src={t.url} alt="" draggable={false} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            className="absolute" style={{ left: t.x, top: t.y, width: TILE, height: TILE }} />
        ))}
        <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h}>
          {circle && <circle cx={circle.x} cy={circle.y} r={circle.r} fill="rgba(99,102,241,.18)" stroke="#6366f1" strokeWidth={2} />}
          {pts.length > 1 && (shape?.type === "polygon"
            ? <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(99,102,241,.18)" stroke="#6366f1" strokeWidth={2} />
            : <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" />)}
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#6366f1" strokeWidth={2} />)}
          {markers.map((m, i) => { const p = toScreen(m); return <circle key={i} cx={p.x} cy={p.y} r={5} fill="#10b981" stroke="#fff" strokeWidth={1.5}><title>{m.label}</title></circle>; })}
        </svg>
        <div className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">© OpenStreetMap</div>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button type="button" className="h-7 w-7 rounded bg-background/90 shadow text-sm" onPointerDown={(e) => e.stopPropagation()} onClick={() => setView((v) => ({ ...v, z: Math.min(18, v.z + 1) }))}>+</button>
          <button type="button" className="h-7 w-7 rounded bg-background/90 shadow text-sm" onPointerDown={(e) => e.stopPropagation()} onClick={() => setView((v) => ({ ...v, z: Math.max(4, v.z - 1) }))}>−</button>
        </div>
      </div>
      {mode === "polygon" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{draft.length} ponto(s). Clique no mapa para adicionar.</span>
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={draft.length < 3} onClick={finish}>Fechar polígono</button>
          <button type="button" className="rounded border px-2 py-1" onClick={clear}>Limpar</button>
        </div>
      )}
      {mode === "circle" && <p className="text-xs text-muted-foreground">Clique no centro e arraste para definir o raio{shape?.type === "circle" ? ` (${shape.radiusKm.toFixed(1)} km)` : ""}.</p>}
    </div>
  );
}
