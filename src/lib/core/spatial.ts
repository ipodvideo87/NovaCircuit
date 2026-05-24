export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialItem<T> {
  id: string;
  bbox: BBox;
  data: T;
}

export class QuadtreeNode<T> {
  private items: SpatialItem<T>[] = [];
  private children: QuadtreeNode<T>[] | null = null;

  constructor(
    public boundary: BBox,
    private capacity: number = 16,
    private maxDepth: number = 8,
    private depth: number = 0
  ) {}

  public insert(item: SpatialItem<T>): boolean {
    if (!this.intersects(this.boundary, item.bbox)) {
      return false;
    }

    if (this.children) {
      for (const child of this.children) {
        if (child.insert(item)) {
          return true;
        }
      }
    }

    this.items.push(item);

    if (this.items.length > this.capacity && this.depth < this.maxDepth) {
      if (!this.children) {
        this.subdivide();
      }

      const remainingItems: SpatialItem<T>[] = [];
      for (const currentItem of this.items) {
        let placed = false;
        for (const child of this.children!) {
          if (child.insert(currentItem)) {
            placed = true;
            break;
          }
        }
        if (!placed) {
          remainingItems.push(currentItem);
        }
      }
      this.items = remainingItems;
    }

    return true;
  }

  public query(range: BBox, results: SpatialItem<T>[] = []): SpatialItem<T>[] {
    if (!this.intersects(this.boundary, range)) {
      return results;
    }

    for (const item of this.items) {
      if (this.intersects(item.bbox, range)) {
        results.push(item);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.query(range, results);
      }
    }

    return results;
  }

  private subdivide() {
    const minX = this.boundary.minX;
    const minY = this.boundary.minY;
    const maxX = this.boundary.maxX;
    const maxY = this.boundary.maxY;
    const midX = minX + (maxX - minX) / 2;
    const midY = minY + (maxY - minY) / 2;

    this.children = [
      new QuadtreeNode<T>({ minX, minY, maxX: midX, maxY: midY }, this.capacity, this.maxDepth, this.depth + 1), // NW
      new QuadtreeNode<T>({ minX: midX, minY, maxX, maxY: midY }, this.capacity, this.maxDepth, this.depth + 1), // NE
      new QuadtreeNode<T>({ minX, minY: midY, maxX: midX, maxY }, this.capacity, this.maxDepth, this.depth + 1), // SW
      new QuadtreeNode<T>({ minX: midX, minY: midY, maxX, maxY }, this.capacity, this.maxDepth, this.depth + 1)  // SE
    ];
  }

  private intersects(a: BBox, b: BBox): boolean {
    return !(
      b.minX > a.maxX ||
      b.maxX < a.minX ||
      b.minY > a.maxY ||
      b.maxY < a.minY
    );
  }
}

export class SpatialIndex<T> {
  private root: QuadtreeNode<T>;

  constructor(private globalBoundary: BBox = { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 }) {
    this.root = new QuadtreeNode<T>(this.globalBoundary);
  }

  public clear() {
    this.root = new QuadtreeNode<T>(this.globalBoundary);
  }

  public insert(id: string, minX: number, minY: number, maxX: number, maxY: number, data: T) {
    const bbox: BBox = { minX, minY, maxX, maxY };
    this.root.insert({ id, bbox, data });
  }

  public query(minX: number, minY: number, maxX: number, maxY: number): T[] {
    const range: BBox = { minX, minY, maxX, maxY };
    const results: SpatialItem<T>[] = [];
    this.root.query(range, results);
    // Return uniquely matched data items
    const seen = new Set<string>();
    const uniques: T[] = [];
    for (const res of results) {
      if (!seen.has(res.id)) {
        seen.add(res.id);
        uniques.push(res.data);
      }
    }
    return uniques;
  }
}
