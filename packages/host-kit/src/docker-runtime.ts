import type { HostRuntimeAdapter, RuntimeHandle, RuntimeReadyResult } from "./local-runtime.js";

export interface DockerCommandResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number;
}

export interface DockerCommandRunner {
  run(args: readonly string[]): Promise<DockerCommandResult>;
}

export interface DockerRuntimeAdapterOptions {
  readonly image: string;
  readonly internal_port: number;
  readonly published_host_port: number;
  readonly preview_host_port?: number;
  readonly container_name_prefix?: string;
  readonly health_path?: string;
  readonly command_runner: DockerCommandRunner;
  readonly fetch_impl?: (url: string) => Promise<Response>;
}

export function createDockerRuntimeAdapter(options: DockerRuntimeAdapterOptions): HostRuntimeAdapter {
  const fetchImpl = options.fetch_impl ?? fetch;
  const prefix = options.container_name_prefix ?? "pneuma";
  const healthPath = options.health_path ?? "/health";

  return {
    async startPreview(input): Promise<RuntimeHandle> {
      const name = containerName(prefix, input.app_id, `${input.version_id}-preview`);
      await removeContainer(options.command_runner, name);
      await runDocker(options.command_runner, [
        "run",
        "--detach",
        "--name",
        name,
        "--publish",
        `${options.preview_host_port ?? options.published_host_port}:${options.internal_port}`,
        "--volume",
        `${input.workspace}:/workspace`,
        options.image,
      ]);
      return {
        runtime_generation_id: name,
        url: `http://127.0.0.1:${options.preview_host_port ?? options.published_host_port}`,
      };
    },

    async stopPreview(input): Promise<void> {
      await removeContainer(options.command_runner, input.runtime_generation_id);
    },

    async startPublished(input): Promise<RuntimeHandle> {
      const name = containerName(prefix, input.app_id, input.version_id);
      await removeContainer(options.command_runner, name);
      await runDocker(options.command_runner, [
        "run",
        "--detach",
        "--name",
        name,
        "--publish",
        `${options.published_host_port}:${options.internal_port}`,
        "--volume",
        `${input.data_dir}:/data`,
        "--env",
        `PNEUMA_APP_ID=${input.app_id}`,
        "--env",
        `PNEUMA_VERSION_ID=${input.version_id}`,
        options.image,
      ]);
      return {
        runtime_generation_id: name,
        url: `http://127.0.0.1:${options.published_host_port}`,
      };
    },

    async stopPublished(input): Promise<void> {
      await removeContainer(options.command_runner, input.runtime_generation_id);
    },

    async waitUntilReady(input): Promise<RuntimeReadyResult> {
      const started = Date.now();
      let lastMessage = "not checked";
      while (Date.now() - started <= (input.timeout_ms ?? 30_000)) {
        try {
          const response = await fetchImpl(`${input.url}${healthPath}`);
          if (response.ok) {
            return {
              ok: true,
              checks: [{
                name: "docker-health",
                status: "passed",
                message: `${input.url}${healthPath}`,
                at_ms: Date.now(),
              }],
            };
          }
          lastMessage = `HTTP ${response.status}`;
        } catch (err) {
          lastMessage = err instanceof Error ? err.message : String(err);
        }
        await sleep(250);
      }
      return {
        ok: false,
        checks: [{
          name: "docker-health",
          status: "failed",
          message: lastMessage,
          at_ms: Date.now(),
        }],
      };
    },
  };
}

async function removeContainer(runner: DockerCommandRunner, name: string): Promise<void> {
  await runner.run(["rm", "-f", name]);
}

async function runDocker(runner: DockerCommandRunner, args: readonly string[]): Promise<DockerCommandResult> {
  const result = await runner.run(args);
  if (!result.ok) {
    throw new Error(`docker ${args.join(" ")} failed (${result.exit_code}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function containerName(prefix: string, appId: string, versionId: string): string {
  return `${prefix}-${appId}-${versionId}`.replace(/[^a-zA-Z0-9_.-]/g, "-").toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
