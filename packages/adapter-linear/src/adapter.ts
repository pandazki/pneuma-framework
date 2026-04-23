// createLinearAdapter — 构造 Linear 的 Adapter aggregate (声明层).
// 真正的 IO 在 impl.ts 的 LinearAdapterImpl.
//
// Capability + admin_delegated 契约按 ADR-0021:
//   - credential_mode = admin_delegated
//   - identity_binding: email_match, store_at = user.attrs.linear_user_id
//   - required_for_admin_delegated: creator_id (eq) — 任何 query 必须带
//     "creator_id == bound linear_user_id", 否则 AdapterInvoker fail-closed

import { Adapter, type CellType } from "@pneuma-framework/core-domain";

export function createLinearAdapter(init: {
  id?: string;
  app_id: string;
}): Adapter {
  const TEXT: CellType = { kind: "primitive", of: "Text" };
  const NUM: CellType = { kind: "primitive", of: "Number" };
  const DATE_T: CellType = { kind: "primitive", of: "Date" };

  return new Adapter({
    id: init.id ?? "linear",
    app_id: init.app_id,
    externalTypes: [
      {
        name: "Issue",
        columns: [
          { name: "id", type: TEXT }, // Linear UUID
          { name: "identifier", type: TEXT }, // MEM-42
          { name: "title", type: TEXT },
          { name: "description", type: TEXT, nullable: true },
          { name: "priority", type: NUM },
          { name: "state_name", type: TEXT },
          { name: "state_type", type: TEXT },
          { name: "assignee_id", type: TEXT, nullable: true },
          { name: "assignee_email", type: TEXT, nullable: true },
          { name: "creator_id", type: TEXT },
          { name: "creator_email", type: TEXT, nullable: true },
          { name: "team_id", type: TEXT },
          { name: "team_key", type: TEXT },
          { name: "created_at", type: DATE_T },
          { name: "updated_at", type: DATE_T },
          { name: "completed_at", type: DATE_T, nullable: true },
        ],
      },
    ],
    auth: { kind: "api-key", header: "Authorization" },
    credential_mode: "admin_delegated",
    supported_credential_modes: ["admin_delegated"],
    identity_binding: {
      strategy: "email_match",
      store_at: "user.attrs.linear_user_id",
    },
    capabilities: {
      list: true,
      read: true,
      insert: false,
      update: false,
      delete: false,
      filter_pushdown: {
        supported_ops: {
          creator_id: ["eq", "in"],
          assignee_id: ["eq", "in"],
          state_type: ["eq", "in"],
          priority: ["eq", "gt", "gte", "lt", "lte"],
          created_at: ["gte", "lte", "date"],
          updated_at: ["gte", "lte", "date"],
          completed_at: ["gte", "lte", "date"],
          team_id: ["eq", "in"],
          team_key: ["eq", "in"],
        },
        supported_sub_ops: {
          created_at: ["today", "yesterday", "this_week", "last_week", "last_n_days", "before", "after", "on"],
          updated_at: ["today", "yesterday", "this_week", "last_week", "last_n_days", "before", "after", "on"],
          completed_at: ["today", "yesterday", "this_week", "last_week", "last_n_days", "before", "after", "on"],
        },
        sortable_columns: ["created_at", "updated_at", "priority"],
        supports_field_projection: false, // MVP: adapter 总返回全字段
        required_for_admin_delegated: [
          { column: "creator_id", required_ops: ["eq"] },
        ],
      },
    },
  });
}
