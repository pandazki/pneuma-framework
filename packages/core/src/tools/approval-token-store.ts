import { randomUUID } from "node:crypto";
import type {
  ApprovalToken,
  AuthorizationTarget,
  Capability,
  Principal,
} from "@pneuma-framework/core-domain";
import { targetFingerprint } from "./authorization-context.js";

const DEFAULT_APPROVAL_TOKEN_TTL_MS = 5 * 60_000;

export interface ApprovalTokenMintInput {
  readonly app_id: string;
  readonly workspace_id: string;
  readonly capability: Capability;
  readonly target: AuthorizationTarget;
  readonly approved_by: Extract<Principal, { kind: "builder" }>;
  readonly now_ms?: number;
  readonly expires_at_ms?: number;
}

export interface ApprovalTokenStore {
  mint(input: ApprovalTokenMintInput): ApprovalToken;
  consume(id: string): ApprovalToken | undefined;
  peek(id: string): ApprovalToken | undefined;
}

export class InMemoryApprovalTokenStore implements ApprovalTokenStore {
  private readonly tokens = new Map<string, ApprovalToken>();

  mint(input: ApprovalTokenMintInput): ApprovalToken {
    const now = input.now_ms ?? Date.now();
    const token: ApprovalToken = {
      token_id: `approval-${randomUUID()}`,
      approved_capability: input.capability,
      app_id: input.app_id,
      workspace_id: input.workspace_id,
      target_fingerprint: targetFingerprint(input.target),
      approved_by: input.approved_by,
      issued_at_ms: now,
      expires_at_ms: input.expires_at_ms ?? now + DEFAULT_APPROVAL_TOKEN_TTL_MS,
      single_use: true,
    };
    this.tokens.set(token.token_id, token);
    return token;
  }

  consume(id: string): ApprovalToken | undefined {
    const token = this.tokens.get(id);
    if (!token) return undefined;
    this.tokens.delete(id);
    return token;
  }

  peek(id: string): ApprovalToken | undefined {
    return this.tokens.get(id);
  }
}
