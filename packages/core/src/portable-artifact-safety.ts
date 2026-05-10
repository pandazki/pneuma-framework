export interface PortableArtifactSafetyIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface PortableArtifactSafetyCheck {
  readonly ok: boolean;
  readonly issues: readonly PortableArtifactSafetyIssue[];
}

const SECRET_EXACT_KEYS = new Set([
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "token",
  "tokens",
  "password",
  "secret",
  "secrets",
  "private_key",
  "client_secret",
]);

const SECRET_SUFFIXES = [
  "_api_key",
  "_access_token",
  "_refresh_token",
  "_token",
  "_tokens",
  "_password",
  "_secret",
  "_secrets",
  "_private_key",
  "_client_secret",
];

const RAW_SOURCE_KEYS = new Set([
  "database_dump",
  "database_path",
  "db_path",
  "raw_rows",
  "raw_sql",
  "sqlite_file",
  "sqlite_path",
  "source_database",
  "volume_snapshot",
]);

const DECLARATION_ONLY_PATHS = new Set([
  "credential_boundary.allow_secret_storage",
  "excludes.secrets",
  "excludes.source_database",
]);

export function validatePortableArtifactSafety(value: unknown): PortableArtifactSafetyCheck {
  const issues: PortableArtifactSafetyIssue[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown, path: string): void {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const [index, entry] of node.entries()) {
        visit(entry, joinPath(path, String(index)));
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      const childPath = joinPath(path, key);
      if (isDeclarationOnlyPath(childPath)) {
        visit(child, childPath);
        continue;
      }
      if (isSecretKey(key)) {
        issues.push(error(
          "portable_artifact.secret_material.forbidden",
          "Portable artifacts and credential evidence must contain credential requirements or refs only, never raw secret material.",
          childPath,
        ));
        continue;
      }
      if (isRawSourceKey(key)) {
        issues.push(error(
          "portable_artifact.raw_source_material.forbidden",
          "Portable artifacts must not contain raw source databases, row dumps, SQL, or volume snapshots.",
          childPath,
        ));
        continue;
      }
      visit(child, childPath);
    }
  }

  visit(value, "");

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SECRET_EXACT_KEYS.has(normalized) ||
    SECRET_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isRawSourceKey(key: string): boolean {
  return RAW_SOURCE_KEYS.has(normalizeKey(key));
}

function isDeclarationOnlyPath(path: string): boolean {
  return DECLARATION_ONLY_PATHS.has(normalizePath(path));
}

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]+/g, "_")
    .toLowerCase();
}

function normalizePath(path: string): string {
  return path.split(".").map(normalizeKey).join(".");
}

function joinPath(parent: string, child: string): string {
  return parent.length === 0 ? child : `${parent}.${child}`;
}

function error(code: string, message: string, path: string): PortableArtifactSafetyIssue {
  return {
    severity: "error",
    code,
    message,
    path,
  };
}
