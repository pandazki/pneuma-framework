// Repository<T> — 通用 aggregate 仓库接口.
// step 5 MVP 只需 InMemory 实现；后续可切 SQLite / Postgres / 其他.
// 抽象让 domain service 测试能用 mock repo，跨 aggregate 协调不依赖具体存储.

export interface Repository<T, Id extends string = string> {
  get(id: Id): Promise<T | undefined>;
  list(): Promise<T[]>;
  save(entity: T): Promise<void>;
  delete(id: Id): Promise<boolean>;
}

/** 从一个聚合实例里取它的 id（每种 aggregate 自定义） */
export type IdOf<T> = (entity: T) => string;

export class InMemoryRepository<T, Id extends string = string>
  implements Repository<T, Id>
{
  private readonly store = new Map<string, T>();

  constructor(private readonly idOf: IdOf<T>) {}

  async get(id: Id): Promise<T | undefined> {
    return this.store.get(id);
  }

  async list(): Promise<T[]> {
    return Array.from(this.store.values());
  }

  async save(entity: T): Promise<void> {
    this.store.set(this.idOf(entity), entity);
  }

  async delete(id: Id): Promise<boolean> {
    return this.store.delete(id);
  }

  /** 测试辅助：直接清空 */
  clear(): void {
    this.store.clear();
  }

  /** 测试辅助：当前大小 */
  size(): number {
    return this.store.size;
  }
}
