// @pneuma-framework/core-domain
// Pure domain primitives per docs/architecture/spec/domain-model.md.
// In-memory + local-fs only — no IO, no LLM, no adapter side-effects.

// Value Objects
export * from "./value-objects/cell-type.js";
export * from "./value-objects/ref.js";
export * from "./value-objects/cell.js";
export * from "./value-objects/permission-context.js";
export * from "./value-objects/where-clause.js";

// Aggregates
export * from "./aggregates/event-stream.js";
export * from "./aggregates/table.js";
export * from "./aggregates/row.js";
export * from "./aggregates/operation.js";
export * from "./aggregates/policy-set.js";
export * from "./aggregates/adapter.js";

// Repositories
export * from "./repositories/types.js";

// Services
export * from "./services/storage-service.js";
export * from "./services/policy-evaluator.js";
export * from "./services/operation-executor.js";
export * from "./services/adapter-invoker.js";
