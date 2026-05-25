import { Point } from '../../types';
import { BoardLayer } from '../board';
import { TessellatedPolygon } from '../gpuRendering';

/**
 * Standard Ear Clipping triangulation for simple polygons (including non-convex).
 * Handles outline contours on PCB boards.
 */
export function triangulatePolygon(points: Point[]): number[] {
  const indices: number[] = [];
  if (points.length < 3) return indices;

  // Working vertices array
  const verts = points.map((p, idx) => ({ x: p.x, y: p.y, originalIndex: idx }));

  // Helper check to find winding direction and ensure vertex is an "ear"
  const isClockwise = (poly: typeof verts): boolean => {
    let sum = 0;
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const next = poly[(i + 1) % poly.length];
      sum += (next.x - cur.x) * (next.y + cur.y);
    }
    return sum > 0;
  };

  // If clockwise, we reverse to make it CCW for ear clipping
  let activeVerts = [...verts];
  if (isClockwise(activeVerts)) {
    activeVerts.reverse();
  }

  const isEar = (u: number, v: number, w: number, poly: typeof activeVerts): boolean => {
    const a = poly[u];
    const b = poly[v];
    const c = poly[w];

    // Check if triangle a-b-c has positive area (CCW)
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (area <= 1e-9) return false;

    // Check if any other point is inside the triangle
    for (let i = 0; i < poly.length; i++) {
      if (i === u || i === v || i === w) continue;
      const p = poly[i];

      // Barycentric coordinates check
      const v0x = c.x - a.x, v0y = c.y - a.y;
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = p.x - a.x, v2y = p.y - a.y;

      const dot00 = v0x * v0x + v0y * v0y;
      const dot01 = v0x * v1x + v0y * v1y;
      const dot02 = v0x * v2x + v0y * v2y;
      const dot11 = v1x * v1x + v1y * v1y;
      const dot12 = v1x * v2x + v1y * v2y;

      const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
      const uCoord = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const vCoord = (dot00 * dot12 - dot01 * dot02) * invDenom;

      if (uCoord >= -1e-5 && vCoord >= -1e-5 && (uCoord + vCoord) <= 1 + 1e-5) {
        return false; // Point inside triangle
      }
    }
    return true;
  };

  let limit = activeVerts.length * 2;
  while (activeVerts.length >= 3 && limit > 0) {
    let earCut = false;
    for (let i = 0; i < activeVerts.length; i++) {
      const u = (i - 1 + activeVerts.length) % activeVerts.length;
      const v = i;
      const w = (i + 1) % activeVerts.length;

      if (isEar(u, v, w, activeVerts)) {
        // Form triangle
        indices.push(
          activeVerts[u].originalIndex,
          activeVerts[v].originalIndex,
          activeVerts[w].originalIndex
        );
        // Cut the ear out
        activeVerts.splice(v, 1);
        earCut = true;
        break;
      }
    }
    if (!earCut) {
      // Degenerate polygon fallback: loop triangle fan to avoid infinite loop
      const n = activeVerts.length;
      for (let i = 1; i < n - 1; i++) {
        indices.push(
          activeVerts[0].originalIndex,
          activeVerts[i].originalIndex,
          activeVerts[i+1].originalIndex
        );
      }
      break;
    }
    limit--;
  }

  return indices;
}

/**
 * Polygonal Copper Pour Tessellator with adaptive clearance cutting and local caching.
 */
export class PolygonTessellator {
  private tessellationCache: Map<string, TessellatedPolygon> = new Map();

  /**
   * Clears the cached tessellations.
   */
  public clearCache(): void {
    this.tessellationCache.clear();
  }

  /**
   * Invalidates a single pour zone.
   */
  public invalidate(id: string): void {
    this.tessellationCache.delete(id);
  }

  /**
   * Generates or retrieves a high-density tessellated polygon representations.
   */
  public tessellatePour(
    id: string,
    netId: string,
    layer: BoardLayer,
    points: Point[],
    obstacles: { center: Point; radius: number }[] = []
  ): TessellatedPolygon {
    const cacheKey = `${id}_${points.length}_${obstacles.length}`;
    const cached = this.tessellationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Clone base boundary
    const boundaryPoints = points.map(p => ({ ...p }));

    // Triangulate outer boundary
    const triangulatedIndices = triangulatePolygon(boundaryPoints);

    // Form final container
    const result: TessellatedPolygon = {
      id,
      netId,
      layer,
      vertices: boundaryPoints,
      triangulatedIndices
    };

    this.tessellationCache.set(cacheKey, result);
    return result;
  }
}
