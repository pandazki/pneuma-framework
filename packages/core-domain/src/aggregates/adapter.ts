// Adapter — 外部系统集成的声明式 aggregate (ADR-0004 / 0005 / 0011 / 0021).
// 本模块只定义契约与不变量, 实际调外部系统由 AdapterInvoker service 负责.

import type { CellType } from "../value-objects/cell-type.js";
import type {
  ComparisonOp,
  DateSubOp,
} from "../value-objects/where-clause.js";

// ---------- external schema ----------

export interface ExternalColumn {
  readonly name: string;
  readonly type: CellType;
  readonly nullable?: boolean;
}

export interface ExternalTypeDef {
  readonly name: string;
  readonly columns: readonly ExternalColumn[];
}

// ---------- auth ----------

export type AuthStrategy =
  | { readonly kind: "none" }
  | { readonly kind: "api-key"; readonly header?: string }
  | { readonly kind: "oauth2"; readonly scopes?: readonly string[] }
  | { readonly kind: "service-account" };

// ---------- capabilities (ADR-0005) ----------

export interface FilterPushdown {
  readonly supported_ops: Readonly<Record<string, readonly ComparisonOp[]>>;
  readonly supported_sub_ops?: Readonly<Record<string, readonly DateSubOp[]>>;
  readonly sortable_columns?: readonly string[];
  readonly supports_field_projection?: boolean;
  readonly required_for_admin_delegated?: ReadonlyArray<{
    readonly column: string;
    readonly required_ops: readonly ComparisonOp[];
  }>;
}

export interface Capabilities {
  readonly list: boolean;
  readonly read: boolean;
  readonly insert: boolean;
  readonly update: boolean;
  readonly delete: boolean;
  readonly updatableColumns?: readonly string[];
  readonly filter_pushdown?: FilterPushdown;
}

// ---------- credential mode (ADR-0011 + ADR-0021) ----------

export type CredentialMode = "shared" | "per-user" | "admin_delegated";

export type IdentityBindingStrategy =
  | "email_match"
  | "admin_assigns"
  | "oauth_prove"
  | "sso_derived";

export interface IdentityBinding {
  readonly strategy: IdentityBindingStrategy;
  /** 'user.attrs.linear_user_id' 等路径 — AdapterInvoker 用来从 ctx 读绑定值 */
  readonly store_at: string;
  readonly verify_on_bind?: boolean;
  readonly discovery?: {
    readonly endpoint: string;
    readonly identity_field: string;
    readonly result_id_field: string;
  };
}

// ---------- attribution (write-back) ----------

export interface AttributionConfig {
  readonly comment_injection?: {
    readonly template: string;
    readonly field: string;
  };
  readonly audit_authoritative: "pneuma" | "external";
}

// ---------- aggregate ----------

export interface AdapterInit {
  id: string;
  app_id: string;
  schemaVersion?: 1;
  externalTypes: ExternalTypeDef[];
  auth: AuthStrategy;
  capabilities: Capabilities;
  credential_mode: CredentialMode;
  identity_binding?: IdentityBinding;
  attribution?: AttributionConfig;
  /** adapter 支持的 credential_mode 集合 (Builder 可从中选一个) */
  supported_credential_modes?: CredentialMode[];
}

export class AdapterInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "AdapterInvariantViolation";
  }
}

export class Adapter {
  readonly id: string;
  readonly app_id: string;
  readonly schemaVersion: 1 = 1;
  readonly externalTypes: readonly ExternalTypeDef[];
  readonly auth: AuthStrategy;
  readonly capabilities: Capabilities;
  readonly credential_mode: CredentialMode;
  readonly identity_binding?: IdentityBinding;
  readonly attribution?: AttributionConfig;
  readonly supported_credential_modes: readonly CredentialMode[];

  constructor(init: AdapterInit) {
    if (!init.id) throw new AdapterInvariantViolation("id required", "empty_id");
    if (!init.app_id)
      throw new AdapterInvariantViolation("app_id required", "empty_app_id");
    if (init.externalTypes.length === 0) {
      throw new AdapterInvariantViolation(
        `adapter "${init.id}": externalTypes must not be empty`,
        "empty_external_types"
      );
    }

    // capabilities.update ⟹ updatableColumns 非空
    if (init.capabilities.update) {
      const uc = init.capabilities.updatableColumns;
      if (!uc || uc.length === 0) {
        throw new AdapterInvariantViolation(
          `adapter "${init.id}": update=true requires non-empty updatableColumns`,
          "update_without_columns"
        );
      }
    }

    // filter_pushdown.supported_ops 的 column 名都必须在某个 externalType 的 columns 里
    const knownColumns = new Set<string>();
    for (const et of init.externalTypes) {
      for (const c of et.columns) knownColumns.add(c.name);
    }

    const fp = init.capabilities.filter_pushdown;
    if (fp) {
      for (const col of Object.keys(fp.supported_ops)) {
        if (!knownColumns.has(col)) {
          throw new AdapterInvariantViolation(
            `adapter "${init.id}": filter_pushdown.supported_ops references unknown column "${col}"`,
            "pushdown_unknown_column"
          );
        }
      }
      if (fp.sortable_columns) {
        for (const col of fp.sortable_columns) {
          if (!knownColumns.has(col)) {
            throw new AdapterInvariantViolation(
              `adapter "${init.id}": sortable_columns references unknown column "${col}"`,
              "sortable_unknown_column"
            );
          }
        }
      }
    }

    // updatableColumns 的 column 必须在某个 externalType 里
    if (init.capabilities.updatableColumns) {
      for (const col of init.capabilities.updatableColumns) {
        if (!knownColumns.has(col)) {
          throw new AdapterInvariantViolation(
            `adapter "${init.id}": updatableColumns references unknown column "${col}"`,
            "updatable_unknown_column"
          );
        }
      }
    }

    // admin_delegated 模式要求: identity_binding + filter_pushdown.required_for_admin_delegated 都必填 (ADR-0021)
    if (init.credential_mode === "admin_delegated") {
      if (!init.identity_binding) {
        throw new AdapterInvariantViolation(
          `adapter "${init.id}": admin_delegated mode requires identity_binding`,
          "admin_delegated_missing_binding"
        );
      }
      if (!fp || !fp.required_for_admin_delegated || fp.required_for_admin_delegated.length === 0) {
        throw new AdapterInvariantViolation(
          `adapter "${init.id}": admin_delegated mode requires filter_pushdown.required_for_admin_delegated (non-empty)`,
          "admin_delegated_missing_pushdown"
        );
      }
      for (const req of fp.required_for_admin_delegated) {
        if (!knownColumns.has(req.column)) {
          throw new AdapterInvariantViolation(
            `adapter "${init.id}": required_for_admin_delegated references unknown column "${req.column}"`,
            "admin_delegated_unknown_column"
          );
        }
        // 每个 required 列必须在 supported_ops 里、且 required_ops 是 supported_ops[column] 的子集
        const supported = fp.supported_ops[req.column];
        if (!supported) {
          throw new AdapterInvariantViolation(
            `adapter "${init.id}": required_for_admin_delegated column "${req.column}" not in supported_ops`,
            "admin_delegated_column_not_pushdown"
          );
        }
        for (const op of req.required_ops) {
          if (!supported.includes(op)) {
            throw new AdapterInvariantViolation(
              `adapter "${init.id}": required_for_admin_delegated op "${op}" not in supported_ops["${req.column}"]`,
              "admin_delegated_op_not_pushdown"
            );
          }
        }
      }
    }

    // supported_credential_modes 一致性
    const supported = init.supported_credential_modes ?? [init.credential_mode];
    if (!supported.includes(init.credential_mode)) {
      throw new AdapterInvariantViolation(
        `adapter "${init.id}": chosen credential_mode "${init.credential_mode}" not in supported_credential_modes`,
        "credential_mode_not_supported"
      );
    }

    this.id = init.id;
    this.app_id = init.app_id;
    this.externalTypes = init.externalTypes.map((et) => ({
      name: et.name,
      columns: et.columns,
    }));
    this.auth = init.auth;
    this.capabilities = init.capabilities;
    this.credential_mode = init.credential_mode;
    this.identity_binding = init.identity_binding;
    this.attribution = init.attribution;
    this.supported_credential_modes = supported;
  }

  canWrite(column: string): boolean {
    if (!this.capabilities.update) return false;
    return this.capabilities.updatableColumns?.includes(column) ?? false;
  }

  canPushdownFilter(column: string, op: ComparisonOp): boolean {
    const fp = this.capabilities.filter_pushdown;
    if (!fp) return false;
    const ops = fp.supported_ops[column];
    return ops !== undefined && ops.includes(op);
  }

  requiresAdminDelegatedFilter(): ReadonlyArray<{
    column: string;
    required_ops: readonly ComparisonOp[];
  }> {
    if (this.credential_mode !== "admin_delegated") return [];
    return this.capabilities.filter_pushdown?.required_for_admin_delegated ?? [];
  }

  externalTypeByName(name: string): ExternalTypeDef | undefined {
    return this.externalTypes.find((t) => t.name === name);
  }
}
