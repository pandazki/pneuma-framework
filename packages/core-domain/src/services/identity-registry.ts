// IdentityRegistry — 不是独立 aggregate, 而是 "3 个 system-owned Tables + domain view helpers".
// 见 domain-model.md §2.8 (决策 3 = Option A).
//
// Schema 约定 (由 createIdentitySystemTables 建):
//   users                   : id, email, attrs (JSON)
//   roles                   : id, name
//   user_role_memberships   : user_id (ref-row→users), role_id (ref-row→roles)

import { Table } from "../aggregates/table.js";
import { Row } from "../aggregates/row.js";
import type { StorageService } from "./storage-service.js";
import type { PermissionContext } from "../value-objects/permission-context.js";
import type { CellType } from "../value-objects/cell-type.js";
import type { Ref } from "../value-objects/ref.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
// 用 JSON blob; 这里 MVP 用 RichText (任意字符串). attrs 的 JSON 结构化读写走 helper.
const ATTRS_CELL: CellType = { kind: "primitive", of: "RichText" };

export interface IdentityTables {
  readonly users: Table;
  readonly roles: Table;
  readonly memberships: Table;
}

/**
 * 构造 identity 三张 system-owned Tables.
 * `email` / `name` / `attrs` 列 system_owned + schema 锁(由 Table 的 system_owned flag 强制).
 */
export function createIdentitySystemTables(app_id: string): IdentityTables {
  const users = new Table({
    id: "users",
    app_id,
    system_owned: true,
    columns: [
      { name: "email", type: TEXT },
      { name: "attrs", type: ATTRS_CELL, nullable: true },
    ],
    source: { kind: "stored" },
  });

  const roles = new Table({
    id: "roles",
    app_id,
    system_owned: true,
    columns: [{ name: "name", type: TEXT }],
    source: { kind: "stored" },
  });

  const memberships = new Table({
    id: "user_role_memberships",
    app_id,
    system_owned: true,
    columns: [
      {
        name: "user_id",
        type: { kind: "ref-row", table: "users" },
        cascade_on_target_delete: true,
      },
      {
        name: "role_id",
        type: { kind: "ref-row", table: "roles" },
        cascade_on_target_delete: true,
      },
    ],
    source: { kind: "stored" },
  });

  return { users, roles, memberships };
}

// ---------- helper API ----------

export class IdentityRegistry {
  constructor(private readonly storage: StorageService) {}

  /**
   * 依 ctx.user.id 拿 User Row. 若找不到返回 undefined.
   * 不做 side-effect (不自动创建).
   */
  async resolveUser(ctx: PermissionContext): Promise<Row | undefined> {
    if (!ctx.user) return undefined;
    return this.storage.getRow(ctx.user.id);
  }

  async findUserByEmail(email: string): Promise<Row | undefined> {
    const users = await this.storage.listRowsByTable("users");
    return users.find((u) => u.getCell("email") === email);
  }

  /** 读 user 的 roles (通过 memberships 表反查) */
  async rolesOf(user_id: string): Promise<string[]> {
    const memberships = await this.storage.listRowsByTable("user_role_memberships");
    const roleIds: string[] = [];
    for (const m of memberships) {
      const userRef = m.getCell("user_id");
      if (
        userRef &&
        typeof userRef === "object" &&
        "id" in userRef &&
        (userRef as { id?: string }).id === user_id
      ) {
        const roleRef = m.getCell("role_id");
        if (
          roleRef &&
          typeof roleRef === "object" &&
          "id" in roleRef &&
          typeof (roleRef as { id?: unknown }).id === "string"
        ) {
          roleIds.push((roleRef as { id: string }).id);
        }
      }
    }
    // resolve role name from roles table
    const names: string[] = [];
    for (const rid of roleIds) {
      const roleRow = await this.storage.getRow(rid);
      const n = roleRow?.getCell("name");
      if (typeof n === "string") names.push(n);
    }
    return names;
  }

  /**
   * 给 user 绑定一个 attribute (key→value), 写入 users.attrs.
   * MVP: attrs 是 JSON-string, 此 helper 负责 parse/stringify.
   * 常见用法: bindAttribute("alice", "linear_user_id", "LIN-alice")
   */
  async bindAttribute(user_id: string, key: string, value: unknown): Promise<void> {
    const user = await this.storage.getRow(user_id);
    if (!user) {
      throw new Error(`user "${user_id}" not found`);
    }
    const raw = user.getCell("attrs");
    const attrs =
      typeof raw === "string" && raw
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
    attrs[key] = value;
    user.setCell("attrs", JSON.stringify(attrs));
    await this.storage.saveRow(user, { checkRefIntegrity: false });
  }

  /** 读 attrs 映射 (解析 JSON). Users 表中某 row 的 attrs 字段. */
  async readAttrs(user_id: string): Promise<Readonly<Record<string, unknown>>> {
    const user = await this.storage.getRow(user_id);
    if (!user) return {};
    const raw = user.getCell("attrs");
    if (typeof raw !== "string" || !raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

/**
 * 把 IdentityRegistry 读到的 attrs / roles 注入到 PermissionContext.user.
 * 用法: HTTP handler 从 session 拿 user.id 后, 调此函数构造完整 ctx.user.
 */
export async function hydrateUserContext(
  registry: IdentityRegistry,
  user_id: string
): Promise<{ id: string; attrs: Record<string, unknown>; roles: string[] } | undefined> {
  const attrs = await registry.readAttrs(user_id);
  const roles = await registry.rolesOf(user_id);
  return { id: user_id, attrs: { ...attrs }, roles };
}

// 为 index barrel 方便导出
export function userRef(id: string): Ref {
  return { kind: "row", table: "users", id };
}
export function roleRef(id: string): Ref {
  return { kind: "row", table: "roles", id };
}
