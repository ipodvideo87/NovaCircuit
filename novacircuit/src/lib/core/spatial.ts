/**
 * Quadtree-based Spatial Index
 *
 * Provides fast O(log n) insert and O(k + log n) range query for 2D bounding boxes.
 * Used for viewport culling in PCBCanvas and SchematicCanvas.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Entry<T> {
  id: T;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ─── QuadtreeNode ─────────────────────────────────────────────────────────────

export class QuadtreeNode<T> {
  private items: Entry<T>[] = [];
  private children: QuadtreeNode<T>[] | null = null;

  constructor(
    private readonly bounds: BoundingBox,
    private readonly depth: number = 0,
    private readonly maxItems: number = 10,
    private readonly maxDepth: number = 5,
  ) {}

  private get midX(): number {
    return (this.bounds.minX + this.bounds.maxX) / 2;
  }

  private get midY(): number {
    return (this.bounds.minY + this.bounds.maxY) / 2;
  }

  private split(): void {
    const { minX, minY, maxX, maxY } = this.bounds;
    const mx = this.midX;
    const my = this.midY;
    const nextDepth = this.depth + 1;

    this.children = [
      new QuadtreeNode<T>({ minX, minY, maxX: mx, maxY: my }, nextDepth, this.maxItems, this.maxDepth),       // NW
      new QuadtreeNode<T>({ minX: mx, minY, maxX, maxY: my }, nextDepth, this.maxItems, this.maxDepth),       // NE
      new QuadtreeNode<T>({ minX, minY: my, maxX: mx, maxY }, nextDepth, this.maxItems, this.maxDepth),       // SW
      new QuadtreeNode<T>({ minX: mx, minY: my, maxX, maxY }, nextDepth, this.maxItems, this.maxDepth),       // SE
    ];

    // Re-insert existing items into children
    const existing = this.items.splice(0);
    for (const entry of existing) {
      this.insertIntoChildren(entry);
    }
  }

  private overlaps(a: BoundingBox, b: BoundingBox): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX &&
           a.minY <= b.maxY && a.maxY >= b.minY;
  }

  private insertIntoChildren(entry: Entry<T>): void {
    if (!this.children) return;
    const entryBounds: BoundingBox = {
      minX: entry.minX, minY: entry.minY,
      maxX: entry.maxX, maxY: entry.maxY,
    };
    for (const child of this.children) {
      if (this.overlaps(child.bounds, entryBounds)) {
        child.insert(entry.id, entry.minX, entry.minY, entry.maxX, entry.maxY);
      }
    }
  }

  insert(id: T, minX: number, minY: number, maxX: number, maxY: number): void {
    // Check bounds overlap
    if (!this.overlaps(this.bounds, { minX, minY, maxX, maxY })) return;

    if (this.children) {
      this.insertIntoChildren({ id, minX, minY, maxX, maxY });
      return;
    }

    this.items.push({ id, minX, minY, maxX, maxY });

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.split();
    }
  }

  query(range: BoundingBox, result: Set<T>): void {
    if (!this.overlaps(this.bounds, range)) return;

    if (this.children) {
      for (const child of this.children) {
        child.query(range, result);
      }
      return;
    }

    for (const entry of this.items) {
      if (this.overlaps({ minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY }, range)) {
        result.add(entry.id);
      }
    }
  }

  clear(): void {
    this.items = [];
    this.children = null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * SpatialIndex<T> — High-level wrapper around QuadtreeNode.
 *
 * Default bounds: (-10000, -10000) to (10000, 10000) — covers typical PCB canvas.
 */
export class SpatialIndex<T> {
  private root: QuadtreeNode<T>;

  constructor(
    bounds: BoundingBox = { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 },
    maxItems = 10,
    maxDepth = 5,
  ) {
    this.root = new QuadtreeNode<T>(bounds, 0, maxItems, maxDepth);
  }

  insert(id: T, minX: number, minY: number, maxX: number, maxY: number): void {
    this.root.insert(id, minX, minY, maxX, maxY);
  }

  query(range: BoundingBox, result: Set<T>): void {
    this.root.query(range, result);
  }

  clear(): void {
    this.root.clear();
  }
}
