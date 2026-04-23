// Transform — 任意输入 → typed output 的 first-class primitive (ADR-0003).
// impl 可以是 code 或 prompt; 两者在不变量与执行语义上有差别.

import { isCellType, type CellType } from "../value-objects/cell-type.js";

// ---------- input shape ----------

export type TransformInputShape =
  | { readonly kind: "cell"; readonly type: CellType }
  | { readonly kind: "row"; readonly table: string }
  | { readonly kind: "row-list"; readonly table: string }
  | { readonly kind: "record"; readonly fields: Readonly<Record<string, CellType>> };

// ---------- impl ----------

export interface CodeImpl {
  readonly kind: "code";
  readonly ref: string; // 解析走 TransformRegistry
}

export interface PromptImpl {
  readonly kind: "prompt";
  readonly model: string;
  readonly system: string;
  /** 可选: 对 LLM 结构化输出的 schema. PromptImpl 对应结构化 output 推荐都填. */
  readonly outputSchema?: unknown;
}

export type TransformImpl = CodeImpl | PromptImpl;

// ---------- purity ----------

export type Purity = "pure" | "pure-with-ttl" | "impure";

// ---------- aggregate ----------

export interface TransformInit {
  id: string;
  app_id: string;
  in: TransformInputShape;
  out: CellType;
  impl: TransformImpl;
  purity: Purity;
  ttl_seconds?: number;
}

export class TransformInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "TransformInvariantViolation";
  }
}

export class Transform {
  readonly id: string;
  readonly app_id: string;
  readonly in: TransformInputShape;
  readonly out: CellType;
  readonly impl: TransformImpl;
  readonly purity: Purity;
  readonly ttl_seconds?: number;

  constructor(init: TransformInit) {
    if (!init.id) throw new TransformInvariantViolation("id required", "empty_id");
    if (!init.app_id)
      throw new TransformInvariantViolation("app_id required", "empty_app_id");

    if (!isCellType(init.out)) {
      throw new TransformInvariantViolation(
        `transform "${init.id}": out is not a valid CellType`,
        "invalid_out_type"
      );
    }

    validateInputShape(init.id, init.in);

    if (init.impl.kind === "code" && !init.impl.ref) {
      throw new TransformInvariantViolation(
        `transform "${init.id}": code impl requires non-empty ref`,
        "empty_code_ref"
      );
    }
    if (init.impl.kind === "prompt") {
      if (!init.impl.model) {
        throw new TransformInvariantViolation(
          `transform "${init.id}": prompt impl requires model`,
          "empty_prompt_model"
        );
      }
      if (!init.impl.system) {
        throw new TransformInvariantViolation(
          `transform "${init.id}": prompt impl requires system prompt`,
          "empty_prompt_system"
        );
      }
    }

    if (init.purity === "pure-with-ttl") {
      if (init.ttl_seconds === undefined || init.ttl_seconds <= 0) {
        throw new TransformInvariantViolation(
          `transform "${init.id}": purity=pure-with-ttl requires ttl_seconds > 0`,
          "missing_ttl"
        );
      }
    }
    if (init.purity !== "pure-with-ttl" && init.ttl_seconds !== undefined) {
      throw new TransformInvariantViolation(
        `transform "${init.id}": ttl_seconds only valid when purity=pure-with-ttl`,
        "ttl_without_pure_ttl"
      );
    }

    this.id = init.id;
    this.app_id = init.app_id;
    this.in = init.in;
    this.out = init.out;
    this.impl = init.impl;
    this.purity = init.purity;
    this.ttl_seconds = init.ttl_seconds;
  }

  isPure(): boolean {
    return this.purity === "pure" || this.purity === "pure-with-ttl";
  }

  isCacheable(): boolean {
    return this.isPure();
  }
}

function validateInputShape(id: string, shape: TransformInputShape): void {
  switch (shape.kind) {
    case "cell":
      if (!isCellType(shape.type)) {
        throw new TransformInvariantViolation(
          `transform "${id}": in.type is not a valid CellType`,
          "invalid_input_cell_type"
        );
      }
      return;
    case "row":
    case "row-list":
      if (!shape.table) {
        throw new TransformInvariantViolation(
          `transform "${id}": in.table required for ${shape.kind}`,
          "empty_input_table"
        );
      }
      return;
    case "record":
      for (const [k, t] of Object.entries(shape.fields)) {
        if (!isCellType(t)) {
          throw new TransformInvariantViolation(
            `transform "${id}": record field "${k}" not a valid CellType`,
            "invalid_input_record_field"
          );
        }
      }
      return;
  }
}
