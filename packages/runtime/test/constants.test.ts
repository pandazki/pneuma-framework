import { expect, test } from "bun:test";
import {
  PNEUMA_INTERNAL_HTTP_TOKEN_ENV,
  PNEUMA_INTERNAL_HTTP_TOKEN_HEADER,
  PNEUMA_SQLITE_PATH_ENV,
} from "../src/index.js";

test("runtime exports stable env and header contract constants", () => {
  expect(PNEUMA_SQLITE_PATH_ENV).toBe("PNEUMA_SQLITE_PATH");
  expect(PNEUMA_INTERNAL_HTTP_TOKEN_ENV).toBe("PNEUMA_INTERNAL_HTTP_TOKEN");
  expect(PNEUMA_INTERNAL_HTTP_TOKEN_HEADER).toBe("x-pneuma-internal-token");
});
