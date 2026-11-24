import type { BBox, LatLng } from "./types";

export interface Cell extends BBox { id: string; depth: number }

export const cellCenter = (c: BBox): LatLng => ({ lat: (c.latMin + c.latMax) / 2, lng: (c.lngMin + c.lngMax) / 2 });

export function bboxFromCircle(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));
  return { latMin: center.lat - dLat, latMax: center.lat + dLat, lngMin: center.lng - dLng, lngMax: center.lng + dLng };
}

export function bboxFromPolygon(poly: LatLng[]): BBox {
  const lats = poly.map((p) => p.lat), lngs = poly.map((p) => p.lng);
  return { latMin: Math.min(...lats), latMax: Math.max(...lats), lngMin: Math.min(...lngs), lngMax: Math.max(...lngs) };
}

export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.lng > p.lng !== b.lng > p.lng && p.lat < ((b.lat - a.lat) * (p.lng - a.lng)) / (b.lng - a.lng) + a.lat) inside = !inside;
  }
  return inside;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Divide uma célula em 4 quadrantes iguais. */
export function subdivide(c: Cell): Cell[] {
  const m = cellCenter(c);
  const d = c.depth + 1;
  return [
    { id: `${c.id}0`, depth: d, latMin: m.lat, latMax: c.latMax, lngMin: c.lngMin, lngMax: m.lng },
    { id: `${c.id}1`, depth: d, latMin: m.lat, latMax: c.latMax, lngMin: m.lng, lngMax: c.lngMax },
    { id: `${c.id}2`, depth: d, latMin: c.latMin, latMax: m.lat, lngMin: c.lngMin, lngMax: m.lng },
    { id: `${c.id}3`, depth: d, latMin: c.latMin, latMax: m.lat, lngMin: m.lng, lngMax: c.lngMax },
  ];
}

/** Grade inicial n x n sobre a área. */
export function initialCells(b: BBox, grid = 1): Cell[] {
  const n = Math.max(1, Math.floor(grid));
  const out: Cell[] = [];
  const dLat = (b.latMax - b.latMin) / n, dLng = (b.lngMax - b.lngMin) / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out.push({ id: `r${i}c${j}`, depth: 0, latMin: b.latMin + i * dLat, latMax: b.latMin + (i + 1) * dLat, lngMin: b.lngMin + j * dLng, lngMax: b.lngMin + (j + 1) * dLng });
  return out;
}

export interface CellResult<T> { count: number; items: T[]; fromCache?: boolean }
export interface QuadtreeOptions {
  /** nº de resultados a partir do qual a célula é considerada saturada */
  saturation: number;
  maxDepth: number;
  maxCells: number;
  concurrency?: number;
  initialGrid?: number;
  initialQueue?: Cell[];
  completedCellIds?: string[];
  maxTimeMs?: number;
  onProgress?: (p: { done: number; queued: number; saturated: number; found: number }) => void;
  signal?: AbortSignal;
}
export interface QuadtreeStats {
  cellsSearched: number;
  cellsSaturatedAtMaxDepth: number;
  truncated: boolean;
  totalFound?: number;
}

export interface QuadtreeResult<T> {
  items: T[];
  stats: QuadtreeStats;
  pendingCells: Cell[];
  completedCellIds: string[];
}

/**
 * Cobertura máxima com controle de continuidade e saturação:
 * Busca cada célula; se saturada (count >= saturation) e ainda houver profundidade,
 * divide recursivamente em 4 quadrantes. Suporta cursor (initialQueue) e limite de tempo seguro.
 */
export async function runQuadtree<T>(
  bbox: BBox,
  search: (cell: Cell) => Promise<CellResult<T>>,
  keyOf: (item: T) => string,
  opts: QuadtreeOptions,
): Promise<QuadtreeResult<T>> {
  const queue: Cell[] = opts.initialQueue?.length
    ? [...opts.initialQueue]
    : initialCells(bbox, opts.initialGrid ?? 1);

  const completedSet = new Set<string>(opts.completedCellIds ?? []);
  const found = new Map<string, T>();
  const stats: QuadtreeStats = { cellsSearched: 0, cellsSaturatedAtMaxDepth: 0, truncated: false };
  let saturated = 0, active = 0, done = 0;
  const conc = Math.max(1, opts.concurrency ?? 2);
  const startTime = Date.now();

  await new Promise<void>((resolve) => {
    const pump = () => {
      const isTimeOut = opts.maxTimeMs ? (Date.now() - startTime) >= opts.maxTimeMs : false;
      if (opts.signal?.aborted || isTimeOut) {
        stats.truncated = true;
        if (opts.signal?.aborted) queue.length = 0;
        if (active === 0) return resolve();
      }

      while (active < conc && queue.length && stats.cellsSearched < opts.maxCells && !isTimeOut) {
        const cell = queue.shift()!;
        if (completedSet.has(cell.id)) {
          continue;
        }

        stats.cellsSearched++;
        active++;
        search(cell)
          .then((res) => {
            completedSet.add(cell.id);
            for (const it of res.items) found.set(keyOf(it), found.get(keyOf(it)) ?? it);
            if (res.count >= opts.saturation) {
              saturated++;
              if (cell.depth < opts.maxDepth) {
                queue.push(...subdivide(cell));
              } else {
                stats.cellsSaturatedAtMaxDepth++;
              }
            }
          })
          .catch(() => {
            /* célula falhou: segue com as demais */
          })
          .finally(() => {
            active--; done++;
            opts.onProgress?.({ done, queued: queue.length, saturated, found: found.size });
            pump();
          });
      }

      if (active === 0 && (queue.length === 0 || stats.cellsSearched >= opts.maxCells || isTimeOut)) {
        if (queue.length > 0) stats.truncated = true;
        resolve();
      }
    };
    pump();
  });

  stats.totalFound = found.size;
  return {
    items: [...found.values()],
    stats,
    pendingCells: queue,
    completedCellIds: Array.from(completedSet),
  };
}
