import type {
  BuildChangeAssuranceCase,
  BuildChangeEvidenceRef,
  BuildChangeReadiness,
} from "./build-assurance.js";

export type BuildChangeEvidenceKind = BuildChangeEvidenceRef["kind"];

export type BuildChangeRecoveryDrillFailureStage =
  | "pre_proposal"
  | "pre_apply"
  | "apply"
  | "post_apply"
  | "release"
  | "rollback";

export interface BuildChangeRecoveryDrillScenario {
  readonly id: string;
  readonly title: string;
  readonly build_change_id: string;
  readonly failure_stage: BuildChangeRecoveryDrillFailureStage;
  readonly simulated_failure: string;
  readonly expected_readiness: BuildChangeReadiness;
  readonly required_evidence_kinds: readonly BuildChangeEvidenceKind[];
}

export interface BuildChangeRecoveryDrillResult {
  readonly scenario_id: string;
  readonly title: string;
  readonly build_change_id: string;
  readonly status: "passed" | "failed";
  readonly readiness?: BuildChangeReadiness;
  readonly missing_evidence_kinds: readonly BuildChangeEvidenceKind[];
  readonly issues: readonly string[];
}

export interface BuildChangeRecoveryDrillMatrixResult {
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
  };
  readonly results: readonly BuildChangeRecoveryDrillResult[];
}

export function evaluateBuildChangeRecoveryDrill(
  scenario: BuildChangeRecoveryDrillScenario,
  assuranceCase: BuildChangeAssuranceCase | undefined,
): BuildChangeRecoveryDrillResult {
  if (!assuranceCase) {
    return failedResult(scenario, undefined, [], [
      `missing assurance case for build_change_id ${scenario.build_change_id}`,
    ]);
  }

  const issues: string[] = [];
  if (assuranceCase.readiness !== scenario.expected_readiness) {
    issues.push(
      `expected readiness ${scenario.expected_readiness}, got ${assuranceCase.readiness}`,
    );
  }

  const presentKinds = new Set(assuranceCase.evidence_refs.map((ref) => ref.kind));
  const missingEvidence = uniqueEvidenceKinds(scenario.required_evidence_kinds)
    .filter((kind) => !presentKinds.has(kind));
  for (const kind of missingEvidence) {
    issues.push(`missing evidence kind: ${kind}`);
  }

  return {
    scenario_id: scenario.id,
    title: scenario.title,
    build_change_id: scenario.build_change_id,
    status: issues.length === 0 ? "passed" : "failed",
    readiness: assuranceCase.readiness,
    missing_evidence_kinds: missingEvidence,
    issues,
  };
}

export function evaluateBuildChangeRecoveryDrillMatrix(
  scenarios: readonly BuildChangeRecoveryDrillScenario[],
  assuranceCases: readonly BuildChangeAssuranceCase[],
): BuildChangeRecoveryDrillMatrixResult {
  const casesByChangeId = new Map(
    assuranceCases.map((assuranceCase) => [assuranceCase.build_change_id, assuranceCase]),
  );
  const results = scenarios.map((scenario) =>
    evaluateBuildChangeRecoveryDrill(scenario, casesByChangeId.get(scenario.build_change_id)),
  );
  const passed = results.filter((result) => result.status === "passed").length;
  return {
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
    },
    results,
  };
}

function failedResult(
  scenario: BuildChangeRecoveryDrillScenario,
  readiness: BuildChangeReadiness | undefined,
  missingEvidence: readonly BuildChangeEvidenceKind[],
  issues: readonly string[],
): BuildChangeRecoveryDrillResult {
  return {
    scenario_id: scenario.id,
    title: scenario.title,
    build_change_id: scenario.build_change_id,
    status: "failed",
    readiness,
    missing_evidence_kinds: missingEvidence,
    issues,
  };
}

function uniqueEvidenceKinds(
  kinds: readonly BuildChangeEvidenceKind[],
): readonly BuildChangeEvidenceKind[] {
  return [...new Set(kinds)];
}

