export class QuadtreeNode<T> {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  items: { id: T; minX: number; minY: number; maxX: number; maxY: number }[];
  children: QuadtreeNode<T>[] | null;
  maxItems = 10;
  maxDepth = 5;
  depth: number;

  constructor(bounds: { minX: number; minY: number; maxX: number; maxY: number }, depth = 0) {
    this.bounds = bounds;
    this.items = [];
    this.children = null;
    this.depth = depth;
  }

  insert(item: { id: T; minX: number; minY: number; maxX: number; maxY: number }) {
    if (this.children) {
      for (const child of this.children) {
        if (
          item.minX < child.bounds.maxX &&
          item.maxX > child.bounds.minX &&
          item.minY < child.bounds.maxY &&
          item.maxY > child.bounds.minY
        ) {
          child.insert(item);
        }
      }
      return;
    }

    this.items.push(item);
    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.split();
    }
  }

  split() {
    const midX = (this.bounds.minX + this.bounds.maxX) / 2;
    const midY = (this.bounds.minY + this.bounds.maxY) / 2;
    this.children = [
      new QuadtreeNode({ minX: this.bounds.minX, minY: this.bounds.minY, maxX: midX, maxY: midY }, this.depth + 1),
      new QuadtreeNode({ minX: midX, minY: this.bounds.minY, maxX: this.bounds.maxX, maxY: midY }, this.depth + 1),
      new QuadtreeNode({ minX: this.bounds.minX, minY: midY, maxX: midX, maxY: this.bounds.maxY }, this.depth + 1),
      new QuadtreeNode({ minX: midX, minY: midY, maxX: this.bounds.maxX, maxY: this.bounds.maxY }, this.depth + 1),
    ];

    for (const item of this.items) {
      for (const child of this.children) {
        if (
          item.minX < child.bounds.maxX &&
          item.maxX > child.bounds.minX &&
          item.minY < child.bounds.maxY &&
          item.maxY > child.bounds.minY
        ) {
          child.insert(item);
        }
      }
    }
    this.items = [];
  }

  query(bounds: { minX: number; minY: number; maxX: number; maxY: number }, result: Set<T>) {
    if (this.children) {
      for (const child of this.children) {
        if (
          bounds.minX < child.bounds.maxX &&
          bounds.maxX > child.bounds.minX &&
          bounds.minY < child.bounds.maxY &&
          bounds.maxY > child.bounds.minY
        ) {
          child.query(bounds, result);
        }
      }
    } else {
      for (const item of this.items) {
        if (
          bounds.minX < item.maxX &&
          bounds.maxX > item.minX &&
          bounds.minY < item.maxY &&
          bounds.maxY > item.minY
        ) {
          result.add(item.id);
        }
      }
    }
  }
}

export class SpatialIndex<T> {
  root: QuadtreeNode<T>;

  constructor(bounds = { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 }) {
    this.root = new QuadtreeNode<T>(bounds);
  }

  insert(id: T, minX: number, minY: number, maxX: number, maxY: number) {
    this.root.insert({ id, minX, minY, maxX, maxY });
  }

  queryWindow(minX: number, minY: number, maxX: number, maxY: number): Set<T> {
    const result = new Set<T>();
    this.root.query({ minX, minY, maxX, maxY }, result);
    return result;
  }
}
