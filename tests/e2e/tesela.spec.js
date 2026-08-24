const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");

const httpFixture = "http://127.0.0.1:4173/tests/e2e/fixture.html";
const fileFixture = pathToFileURL(resolve(__dirname, "fixture.html")).href;

async function expectBootstrapped(page) {
  await expect(page.getByRole("heading", { name: "Tesela E2E" })).toBeVisible();
  await expect(page.locator(".ssm-status")).toContainText("2 zones");
  await expect(page.locator(".fake-zone")).toHaveCount(2);
  await expect(page.locator(".fake-layer-control")).toContainText("Context layer");
  await expect(page.getByText("Data and methodology")).toBeVisible();
}

async function searchAndOpen(page, query) {
  const search = page.getByRole("searchbox", { name: "Search zones" });
  await search.fill(query);
  await search.press("Enter");
  await expect(page.locator("#ssm-detail")).toHaveAttribute("aria-hidden", "false");
}

test("interactive workflow over HTTP", async ({ page }) => {
  await page.goto(httpFixture);
  await expectBootstrapped(page);

  await searchAndOpen(page, "alpha");
  await expect(page.locator(".fake-selection")).toHaveCount(1);
  await expect(page.locator("#ssm-map")).toHaveAttribute("data-fit-bounds", /[1-9]/);
  await expect(page.locator("#ssm-detail")).toContainText("MetricsValue10Quality90");
  await expect(page.locator("#ssm-detail")).toContainText("Fixture notice");
  await expect(page.locator(".fixture-provider-item")).toHaveText("Remote Álpha");

  const overlayToggle = page.getByRole("button", { name: "Context layer" });
  await expect(overlayToggle).toHaveAttribute("aria-pressed", "true");
  await overlayToggle.click();
  await expect(overlayToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#ssm-detail")).toContainText("Álpha");

  await page.getByRole("button", { name: "Indicator guide" }).click();
  await expect(page.locator("#ssm-glossary")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#ssm-glossary")).toContainText("Measured value.");
  await page.keyboard.press("Escape");
  await expect(page.locator("#ssm-glossary")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#ssm-detail")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".fake-selection")).toHaveCount(0);

  await page.locator(".fake-zone", { hasText: "Beta" }).click();
  await expect(page.locator("#ssm-detail")).toContainText("Beta");
  await page.getByRole("button", { name: "Quality first" }).click();
  await expect(page.locator(".fake-selection")).toHaveCount(1);
  await expect(page.locator(".fake-layer-control")).toContainText("Context layer");
});

test("stale provider responses never replace the selected zone", async ({ page }) => {
  await page.goto(httpFixture);
  await searchAndOpen(page, "alpha");
  await searchAndOpen(page, "beta");
  await expect(page.locator("#ssm-detail")).toContainText("Beta");
  await expect(page.locator(".fixture-provider-item")).toHaveText("Remote Beta");
  await expect(page.locator("#ssm-detail")).not.toContainText("Remote Álpha");
});

test("zero-build workflow works from file URL", async ({ page }) => {
  await page.goto(fileFixture);
  await expectBootstrapped(page);
  await searchAndOpen(page, "beta");
  await expect(page.locator("#ssm-detail")).toContainText("Beta");
  await expect(page.locator(".fixture-provider-item")).toHaveText("Remote Beta");
  await page.evaluate(() => window.Tesela.app.destroy());
  await expect(page.locator("#ssm-detail")).toHaveAttribute("aria-hidden", "true");
});
