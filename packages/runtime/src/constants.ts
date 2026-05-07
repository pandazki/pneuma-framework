/** Runtime SQLite database path environment variable consumed by Host-owned runtime entrypoints. */
export const PNEUMA_SQLITE_PATH_ENV = "PNEUMA_SQLITE_PATH";

/**
 * Child-runtime internal HTTP token environment variable.
 *
 * The framework lifecycle owner writes this value into runtime process env, and
 * internal framework calls mirror it through `PNEUMA_INTERNAL_HTTP_TOKEN_HEADER`.
 */
export const PNEUMA_INTERNAL_HTTP_TOKEN_ENV = "PNEUMA_INTERNAL_HTTP_TOKEN";

/** Runtime-private HTTP header required when using the reserved `framework` principal. */
export const PNEUMA_INTERNAL_HTTP_TOKEN_HEADER = "x-pneuma-internal-token";
