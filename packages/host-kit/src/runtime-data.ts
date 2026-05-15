import {
  dataEvolutionReceiptRequiredForPolicy,
  validateDataEvolutionReceipt,
  type DataEvolutionPolicyKind,
  type DataEvolutionReceipt,
} from "@pneuma-framework/core";

export interface PreviewDataTarget {
  readonly target_id: string;
  readonly source_version_id?: string;
  readonly target_version_id: string;
  readonly provider_profile_id: string;
}

export interface DataEvolutionAdapter {
  cloneForPreview(input: {
    readonly app_id: string;
    readonly source_version_id?: string;
    readonly target_version_id: string;
    readonly provider_profile_id: string;
  }): Promise<PreviewDataTarget>;
  rehearse(input: {
    readonly app_id: string;
    readonly preview_target: PreviewDataTarget;
    readonly policy: DataEvolutionPolicyKind;
  }): Promise<DataEvolutionReceipt>;
  applyForPublish(input: {
    readonly app_id: string;
    readonly source_version_id?: string;
    readonly target_version_id: string;
    readonly provider_profile_id: string;
    readonly policy: DataEvolutionPolicyKind;
  }): Promise<DataEvolutionReceipt>;
}

export type PreviewDataRehearsalResult =
  | {
      readonly ok: true;
      readonly preview_target: PreviewDataTarget;
      readonly receipt: DataEvolutionReceipt;
    }
  | {
      readonly ok: false;
      readonly reason: "preview_data_rehearsal_failed" | "invalid_data_evolution_receipt";
      readonly preview_target?: PreviewDataTarget;
      readonly receipt?: DataEvolutionReceipt;
      readonly issues?: readonly string[];
    };

export async function runPreviewDataRehearsal(input: {
  readonly app_id: string;
  readonly source_version_id?: string;
  readonly target_version_id: string;
  readonly provider_profile_id: string;
  readonly policy: DataEvolutionPolicyKind;
  readonly adapter: DataEvolutionAdapter;
}): Promise<PreviewDataRehearsalResult> {
  const previewTarget = await input.adapter.cloneForPreview(input);
  const receipt = await input.adapter.rehearse({
    app_id: input.app_id,
    preview_target: previewTarget,
    policy: input.policy,
  });
  const validation = validateDataEvolutionReceipt(receipt);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "invalid_data_evolution_receipt",
      preview_target: previewTarget,
      receipt,
      issues: validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    };
  }
  if (receipt.status !== "completed") {
    return {
      ok: false,
      reason: "preview_data_rehearsal_failed",
      preview_target: previewTarget,
      receipt,
    };
  }
  return { ok: true, preview_target: previewTarget, receipt };
}

export function dataEvolutionReceiptAllowsPublish(
  receipt: DataEvolutionReceipt | undefined,
): boolean {
  if (!receipt) return false;
  const validation = validateDataEvolutionReceipt(receipt);
  if (!validation.ok) return false;
  if (dataEvolutionReceiptRequiredForPolicy(receipt.policy)) {
    return receipt.status === "completed";
  }
  return receipt.status !== "failed";
}
