export interface RuntimeHandle {
  readonly runtime_generation_id: string;
  readonly url: string;
  readonly pid?: number;
}

export interface RuntimeReadyResult {
  readonly ok: boolean;
  readonly checks: readonly {
    readonly name: string;
    readonly status: "passed" | "failed";
    readonly message?: string;
    readonly at_ms: number;
  }[];
}

export interface HostRuntimeAdapter {
  startPreview(input: {
    readonly app_id: string;
    readonly version_id: string;
    readonly workspace: string;
  }): Promise<RuntimeHandle>;
  stopPreview(input: { readonly runtime_generation_id: string }): Promise<void>;
  startPublished(input: {
    readonly app_id: string;
    readonly version_id: string;
    readonly data_dir: string;
  }): Promise<RuntimeHandle>;
  stopPublished(input: { readonly runtime_generation_id: string }): Promise<void>;
  waitUntilReady(input: { readonly url: string; readonly timeout_ms?: number }): Promise<RuntimeReadyResult>;
}
