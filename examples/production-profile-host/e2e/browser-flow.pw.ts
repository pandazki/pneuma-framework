import { expect, test } from "@playwright/test";

test("runs production profile lifecycle from browser controls", async ({ context, page, request }) => {
  await request.post("/api/reset");
  await page.goto("/");

  await page.getByRole("button", { name: "Create from profile" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Project created");

  await page.getByRole("button", { name: "Start preview" }).click();
  await expect(page.getByText("Preview running")).toBeVisible();
  let state = await (await request.get("/api/state")).json();
  expect(state.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const v0PreviewPage = await context.newPage();
  await v0PreviewPage.goto(state.preview_url);
  await expect(v0PreviewPage.getByRole("heading", { name: "Operations Board" })).toBeVisible();
  await v0PreviewPage.close();
  const v0PreviewItems = await (await request.get(`${state.preview_url}/api/items`)).text();
  expect(v0PreviewItems).toContain("Finalize OAuth callback hardening");

  await page.getByRole("button", { name: "Publish runtime" }).click();
  await expect(page.getByText("Published runtime running")).toBeVisible();
  state = await (await request.get("/api/state")).json();
  expect(state.project.active_version_id).toBe("v0");
  expect(state.published_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const v0PublishedPage = await context.newPage();
  await v0PublishedPage.goto(state.published_url);
  await expect(v0PublishedPage.getByRole("heading", { name: "Operations Board" })).toBeVisible();
  await v0PublishedPage.close();
  const v0PublishedItems = await (await request.get(`${state.published_url}/api/items`)).text();
  expect(v0PublishedItems).toContain("Finalize OAuth callback hardening");

  await page.getByRole("button", { name: "Ask build agent" }).click();
  await expect(page.getByText("Add release environment tracking to the production scaffold.")).toBeVisible();

  await page.getByRole("button", { name: "Start preview" }).click();
  await expect(page.getByText("Preview running")).toBeVisible();
  state = await (await request.get("/api/state")).json();
  expect(state.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const draftPreviewPage = await context.newPage();
  await draftPreviewPage.goto(state.preview_url);
  await expect(draftPreviewPage.getByRole("heading", { name: "Operations Board" })).toBeVisible();
  await draftPreviewPage.close();
  const previewItems = await (await request.get(`${state.preview_url}/api/items`)).text();
  expect(previewItems).toContain("environment");

  await page.getByRole("button", { name: "Approve and apply" }).click();
  state = await (await request.get("/api/state")).json();
  expect(state.project.active_version_id).toBe("v1");
  expect(state.published_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

  await page.getByRole("button", { name: "Publish runtime" }).click();
  await expect(page.getByText("Published runtime running")).toBeVisible();
  await expect.poll(async () => {
    const current = await (await request.get("/api/state")).json();
    return current.published_url ?? "";
  }).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  state = await (await request.get("/api/state")).json();
  const publishedPage = await context.newPage();
  await publishedPage.goto(state.published_url);
  await expect(publishedPage.getByRole("heading", { name: "Operations Board" })).toBeVisible();
  await publishedPage.close();
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
