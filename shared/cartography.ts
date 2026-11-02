import type { Territory } from './types';
type Point = [number, number];
/** Voronoi ownership cells in the same coordinate system as the settlement markers. */
export function territoryCells(territories: Territory[]) {
  return territories.map((t) => {
    let polygon: Point[] = [
      [0, 0],
      [1000, 0],
      [1000, 360],
      [0, 360],
    ];
    const x = t.x * 10,
      y = t.y * 3.6;
    for (const other of territories) {
      if (other.id === t.id) continue;
      const ox = other.x * 10,
        oy = other.y * 3.6,
        a = ox - x,
        b = oy - y,
        c = (ox * ox + oy * oy - x * x - y * y) / 2;
      if (Math.abs(a) + Math.abs(b) < 1e-8) continue;
      const clipped: Point[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i],
          q = polygon[(i + 1) % polygon.length],
          dp = a * p[0] + b * p[1] - c,
          dq = a * q[0] + b * q[1] - c;
        if (dp <= 1e-7) clipped.push(p);
        if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
          const f = dp / (dp - dq);
          clipped.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
        }
      }
      polygon = clipped;
    }
    return {
      territory: t,
      points: polygon,
      svg: polygon.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' '),
    };
  });
}
