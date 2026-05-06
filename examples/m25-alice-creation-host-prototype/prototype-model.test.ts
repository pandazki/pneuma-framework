import { describe, expect, test } from "bun:test";
import {
  M25_STAGE_IDS,
  buildM25PrototypeModel,
  runM25PrototypeStage,
} from "./prototype-model.js";

describe("M25 Alice Creation Host prototype model", () => {
  test("starts from a Developer cognitive path, not from a generated app", () => {
    const model = buildM25PrototypeModel();

    expect(model.rc_ready).toBe(false);
    expect(model.stages.map((stage) => stage.id)).toEqual([...M25_STAGE_IDS]);
    expect(model.stages[0]).toMatchObject({
      id: "name-the-product-layer",
      developer_question: "我到底是在写一个 app，还是在写一个 app builder？",
    });
    expect(model.inspector.artifact_model).toMatchObject({
      product_layers: [
        "pneuma-framework",
        "Creation Host",
        "Generated Application",
        "Published Application",
      ],
    });
  });

  test("connects Alice's Host contracts to M24 RC pressure evidence", () => {
    const model = buildM25PrototypeModel();
    const evidenceIds = model.evidence.map((entry) => entry.id);

    expect(model.rc_pressure_report.ok).toBe(true);
    expect(evidenceIds).toContain("agent-provider-branching-forbidden");
    expect(evidenceIds).toContain("share-artifact-no-source-db");
    expect(evidenceIds).toContain("charlie-install-allowed");
    expect(evidenceIds).toContain("dave-fork-allowed");
    expect(model.generated_app.modules.find((module) => module.id === "apple-notes")).toMatchObject({
      local_profile: "supported",
      remote_profile: "unsupported",
    });
  });

  test("reaches rc_ready only after Alice walks the whole path", () => {
    let model = buildM25PrototypeModel();
    for (const stageId of M25_STAGE_IDS) {
      model = runM25PrototypeStage(model.completed_stage_ids, stageId);
    }

    expect(model.completed_stage_ids).toEqual([...M25_STAGE_IDS]);
    expect(model.rc_ready).toBe(true);
    expect(model.stages.every((stage) => stage.status === "completed")).toBe(true);
  });

  test("rejects unknown stages", () => {
    expect(() => runM25PrototypeStage([], "unknown")).toThrow("unknown M25 stage");
  });
});
