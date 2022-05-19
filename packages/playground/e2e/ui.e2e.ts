import { expect, test } from "@playwright/test";

const host = `http://localhost:3000`;
const ctrlOrCmd = process.platform === "darwin" ? "Meta" : "Control";

test("compiled http sample", async ({ page }) => {
  await page.goto(host);
  const samplesDropDown = page.locator("select.sample-dropdown");
  await samplesDropDown.selectOption({ label: "Http" });
  const outputContainer = page.locator("#output");
  await expect(outputContainer).toContainText(`"title": "Widget Service"`);
});

test("shared link works", async ({ page }) => {
  // Pass code "op sharedCode(): string;"
  await page.goto(`${host}/?c=b3Agc2hhcmVkQ29kZSgpOiBzdHJpbmc7`);
  const outputContainer = page.locator("#output");
  await expect(outputContainer).toContainText(`"operationId": "sharedCode"`);
});

test("save code with ctrl/cmd+S", async ({ page }) => {
  await page.goto(host);
  const cadlEditorContainer = page.locator("#editor");
  await cadlEditorContainer.click();
  await cadlEditorContainer.type("op sharedCode(): string;");
  await Promise.all([
    // It is important to call waitForNavigation before click to set up waiting.
    page.waitForNavigation({ url: `${host}/?c=b3Agc2hhcmVkQ29kZSgpOiBzdHJpbmc7` }),
    page.keyboard.press(`${ctrlOrCmd}+KeyS`),
  ]);
});
