import { expect, test } from "@playwright/test";

test("runs production profile lifecycle from browser controls", async ({ page, request }) => {
  await request.post("/api/reset");
  await page.goto("/");

  await page.getByRole("button", { name: "Create from profile" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Project created");

  await page.getByRole("button", { name: "Ask build agent" }).click();
  await expect(page.getByText("Add release environment tracking to the production scaffold.")).toBeVisible();

  await page.getByRole("button", { name: "Start preview" }).click();
  await expect(page.getByText("Preview running")).toBeVisible();
  let state = await (await request.get("/api/state")).json();
  expect(state.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const previewItems = await (await request.get(`${state.preview_url}/api/items`)).text();
  expect(previewItems).toContain("environment");

  await page.getByRole("button", { name: "Approve and apply" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Project created");

  await page.getByRole("button", { name: "Publish runtime" }).click();
  await expect(page.getByText("Published runtime running")).toBeVisible();
  state = await (await request.get("/api/state")).json();
  expect(state.published_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const publishedItems = await (await request.get(`${state.published_url}/api/items`)).text();
  expect(publishedItems).toContain("production");
  expect(publishedItems).toContain("staging");

  await page.screenshot({ path: "/tmp/pneuma-m53-production-profile-host-e2e.png", fullPage: true });

  await page.getByRole("button", { name: "Rollback" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Project created");
  state = await (await request.get("/api/state")).json();
  expect(state.project.active_version_id).toBe("v0");
  expect(state.published_url).toBeUndefined();
});
