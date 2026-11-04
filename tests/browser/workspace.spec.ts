import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("authenticated buying flow preserves corrections, recalculates, highlights sources and undoes", async ({ page }, testInfo) => {
  const password = "Fixture-" + randomUUID() + "-aA1";
  const origin = new URL(testInfo.project.use.baseURL ?? "http://127.0.0.1:4173").origin;
  const response = await page.request.post("/_agent-native/auth/ba/sign-up/email", { headers: { Origin: origin }, data: { email: "browser-" + randomUUID() + "@example.invalid", name: "Browser fixture", password } });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/home");
  await page.getByRole("button", { name: "Try the example" }).click();
  await expect(page.getByTestId("recommendation")).toHaveText("Cedar Print");
  await page.getByRole("button", { name: "Edit Cedar Print Delivery date" }).click();
  await page.getByRole("dialog").locator('input[name="value"]').fill("2026-11-18");
  await page.getByRole("dialog").locator('input[name="note"]').fill("Supplier confirmed the delay");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByTestId("recommendation")).toHaveText("Harbor Studio");
  await expect(page.getByLabel("Delivery date locked", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Total budget", exact: true }).fill("590.00");
  await page.getByRole("button", { name: "Update decision" }).click();
  await expect(page.getByTestId("recommendation")).toHaveText("No suitable offer");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("recommendation")).toHaveText("Harbor Studio");
  await expect(page.getByLabel("Delivery date locked", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Total budget", exact: true }).fill("650.00");
  await page.getByLabel("Delivery deadline", { exact: true }).fill("2026-11-10");
  await page.getByRole("button", { name: "Update decision" }).click();
  await expect(page.getByTestId("recommendation")).toHaveText("Rushline");
  await page.getByRole("button", { name: "View Rushline" }).click();
  await page.getByRole("button", { name: "$6.25", exact: true }).click();
  await expect(page.locator(".sl-source mark")).toContainText("$6.25");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export brief" }).click();
  expect((await download).suggestedFilename()).toBe("shortlist-decision.txt");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("recommendation")).toBeVisible();
  await page.screenshot({ path: "reports/shortlist-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.screenshot({ path: "reports/shortlist-desktop.png", fullPage: true });
});

test("an unauthenticated caller cannot read a private decision action", async ({ request }) => {
  const response = await request.get("/_agent-native/actions/get-decision?id=unknown");
  expect([401, 403]).toContain(response.status());
});
