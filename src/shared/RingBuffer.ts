/** Fixed-capacity log; oldest entries are dropped. Used for debug views. */
export class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }

  /** Newest first. */
  toArray(): T[] {
    return this.items.slice().reverse();
  }

  get size(): number {
    return this.items.length;
  }
}
