export interface ProductionGeneratedAppProfile {
  readonly id: "bun-hono-react-neon";
  readonly displayName: string;
  readonly runtime: {
    readonly local: "bun";
    readonly api: "hono";
    readonly frontend: "react-vite";
  };
  readonly persistence: {
    readonly provider: "neon-postgres";
    readonly orm: "drizzle";
    readonly validation: "zod";
  };
  readonly deploymentTargets: readonly ["docker", "vercel"];
  readonly generatedArtifactContract: {
    readonly editableRoots: readonly string[];
    readonly protectedRoots: readonly string[];
    readonly requiredFiles: readonly string[];
    readonly requiredChecks: readonly string[];
  };
  readonly designContract: {
    readonly register: "product";
    readonly colorStrategy: "restrained";
    readonly componentVocabulary: readonly string[];
    readonly bans: readonly string[];
  };
}

export const productionGeneratedAppProfile: ProductionGeneratedAppProfile = {
  id: "bun-hono-react-neon",
  displayName: "Bun + Hono + React + Neon",
  runtime: {
    local: "bun",
    api: "hono",
    frontend: "react-vite",
  },
  persistence: {
    provider: "neon-postgres",
    orm: "drizzle",
    validation: "zod",
  },
  deploymentTargets: ["docker", "vercel"],
  generatedArtifactContract: {
    editableRoots: ["src/client", "src/server", "src/db", "src/shared", "drizzle"],
    protectedRoots: ["api", "Dockerfile", "vercel.json", "drizzle.config.ts"],
    requiredFiles: [
      "src/server/app.ts",
      "api/index.ts",
      "src/client/App.tsx",
      "src/client/styles.css",
      "src/db/schema.ts",
      "src/shared/contracts.ts",
      "Dockerfile",
      ".dockerignore",
      "vercel.json",
      "drizzle.config.ts",
      ".env.example",
    ],
    requiredChecks: ["bun run test", "bun run build", "bun run neon:smoke with DATABASE_URL"],
  },
  designContract: {
    register: "product",
    colorStrategy: "restrained",
    componentVocabulary: ["Button", "Badge", "Field", "Input", "Textarea", "Segmented control", "Tabs"],
    bans: [
      "native browser select in Builder or Generated App product UI",
      "unstyled form controls",
      "dark mode as default for this operator workflow",
      "cards nested inside decorative cards",
      "full-saturation inactive states",
      "raw #000 or #fff",
    ],
  },
};

export const demoScenarios = [
  {
    id: "minimum-crud",
    title: "Minimum release work CRUD",
    proves: ["Hono API", "Zod validation", "React form", "memory repository for tests"],
  },
  {
    id: "workflow-depth",
    title: "Workflow status and release evidence",
    proves: ["role-independent transitions", "event timeline", "summary metrics", "risk and SLA vocabulary"],
  },
  {
    id: "deployment-shape",
    title: "Docker and Vercel deployment shape",
    proves: ["Bun local server", "Vercel Hono entry", "Drizzle migrations", "Neon env boundary"],
  },
] as const;
