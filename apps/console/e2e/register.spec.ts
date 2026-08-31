import { expect, test } from "@playwright/test";

/**
 * Exit M0 (TRUST-01/02): o registro percorre UI -> BFF -> API -> outbox ->
 * projection -> UI num browser real contra Hub e Console vivos.
 */

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dev-a@evolutionos.local");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
}

test("register round-trip: project appears in the projected list", async ({ page }) => {
  const unique = Date.now().toString(36);
  const name = `Projeto E2E ${unique}`;

  await login(page);
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Slug").fill(`proj-e2e-${unique}`);
  await page.getByRole("button", { name: "Registrar projeto" }).click();

  await expect(page.getByTestId("register-status")).toContainText("registrado: prj_");

  // A projeção é assíncrona (outbox -> dispatcher); recarrega até aparecer.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("project-list")).toContainText(name, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
});

test("invalid manifest shows the 422 schema error and registers nothing", async ({ page }) => {
  const unique = Date.now().toString(36);

  await login(page);
  await page.getByLabel("Nome").fill(`Projeto Inválido ${unique}`);
  // Slug maiúsculo viola o pattern do schema v0.
  await page.getByLabel("Slug").fill(`PROJ-INVALIDO-${unique}`);
  await page.getByRole("button", { name: "Registrar projeto" }).click();

  await expect(page.getByTestId("register-error")).toContainText("invalid_manifest");
  await page.reload();
  await expect(page.locator("body")).not.toContainText(`Projeto Inválido ${unique}`);
});
