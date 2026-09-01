import { expect, test } from "@playwright/test";

/**
 * IDEA-07: o console renderiza o Project Overview a partir da resposta
 * agregada do Hub. Registra via API (arrange) para popular hipóteses e
 * constraints, depois navega pela UI (verify) — a mesma sessão de login
 * usada pelo fluxo de registro do Slice 0.
 */

const HUB_URL = "http://127.0.0.1:4010";

test("project overview page renders identity, hypotheses and constraints", async ({ page, request }) => {
  const unique = Date.now().toString(36);

  const login = await request.post(`${HUB_URL}/auth/dev-login`, {
    data: { email: "dev-a@evolutionos.local" },
  });
  const { token } = await login.json();

  const manifest = {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name: `Ideia E2E ${unique}`, slug: `ideia-e2e-${unique}`, type: "idea", status: "discovery" },
    spec: {
      intent: { problem: "Overview e2e problem statement" },
      hypotheses: [
        {
          id: "hyp-e2e",
          statement: "Hipótese renderizada no overview",
          type: "desirability",
          evidenceState: "untested",
          status: "active",
        },
      ],
      constraints: [{ id: "con-e2e", statement: "Constraint renderizada no overview", severity: "mandatory" }],
    },
  };

  const register = await request.post(`${HUB_URL}/projects`, {
    headers: { authorization: `Bearer ${token}`, "idempotency-key": `overview-e2e-${unique}` },
    data: manifest,
  });
  expect(register.ok()).toBe(true);
  const { projectId } = await register.json();

  // Login pela UI para o browser carregar o cookie de sessão.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dev-a@evolutionos.local");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

  await page.getByText(`Ideia E2E ${unique}`).click();

  await expect(page.getByTestId("overview-name")).toHaveText(`Ideia E2E ${unique}`);
  await expect(page.getByTestId("hypothesis-list")).toContainText("Hipótese renderizada no overview");
  await expect(page.getByTestId("constraint-list")).toContainText("Constraint renderizada no overview");
  await expect(page.getByTestId("overview-counts")).toContainText("0 artefato(s), 0 decisão(ões)");
  expect(projectId).toMatch(/^prj_/);
});
