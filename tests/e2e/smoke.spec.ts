import { test, expect } from "@playwright/test";

test("dashboard informa o próximo passo quando a base está vazia", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Bom dia, administrador/i })).toBeVisible();
  await expect(page.getByText("Cadastre seu primeiro concorrente")).toBeVisible();
});
