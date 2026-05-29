// ---------------------------------------------------------------------------
// Stack profile contract.
//
// This is the Developer-authored declaration the Creation Host consumes. It
// states which roots a code agent may evolve, which deployment/profile files
// are protected, how to verify a draft, and how a published runtime is built,
// migrated, and health-checked. The Host owns governance; this file owns the
// truth about *this* generated-app shape.
// ---------------------------------------------------------------------------

export interface GeneratedArtifactContract {
  /** Roots a code agent is allowed to change in a draft workspace. */
  editableRoots: string[];
  /** Deployment / infra / contract files that must never change in a draft. */
  protectedRoots: string[];
  /** Pre-proposal gate run inside the draft workspace. */
  verifyCommand: string[];
  /** Schema migration applied before serving / deploying a published runtime. */
  migrateCommand: string[];
  buildCommand: string[];
  outputDir: string;
  healthPath: string;
  itemsPath: string;
}

export interface StackProfile {
  id: string;
  displayName: string;
  description: string;
  stack: Record<string, string>;
  generatedArtifact: GeneratedArtifactContract;
  deployTargets: Array<"local" | "docker" | "vercel">;
}

export const releaseBoardProfile: StackProfile = {
  id: "clean-room-release-board",
  displayName: "Release Operations Board",
  description:
    "A full-stack release operations board: Bun + Hono + React + Drizzle + Zod, " +
    "Neon Postgres for published data, Vercel and Docker as deploy targets.",
  stack: {
    runtime: "Bun",
    api: "Hono",
    ui: "React + Vite",
    contracts: "Zod",
    orm: "Drizzle",
    database: "Neon Postgres",
    deploy: "Vercel REST API / Docker",
  },
  generatedArtifact: {
    editableRoots: [
      "src/shared",
      "src/server/app.ts",
      "src/server/repository.ts",
      "src/db/schema.ts",
      "src/db/neon-repository.ts",
      "src/client",
      "drizzle",
      "test",
    ],
    protectedRoots: [
      "api",
      "Dockerfile",
      "vercel.json",
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "src/db/client.ts",
      "src/db/migrate.ts",
      "src/profile",
      ".env",
      ".env.example",
    ],
    verifyCommand: ["bun", "run", "verify"],
    migrateCommand: ["bun", "run", "db:migrate"],
    buildCommand: ["bun", "run", "build"],
    outputDir: "dist/client",
    healthPath: "/api/health",
    itemsPath: "/api/items",
  },
  deployTargets: ["local", "docker", "vercel"],
};
