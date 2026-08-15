import { expect, test } from "@playwright/test";

test("operador cria, processa e conduz um Ticket pela SPA", async ({
  page,
}) => {
  const suffix = Date.now();
  await page.goto("/tickets/new");

  await page.getByLabel("Título").fill(`Acesso indisponível ${suffix}`);
  await page
    .getByLabel("Descrição")
    .fill("O operador não consegue acessar o sistema desde o início do turno.");
  await page
    .getByLabel("E-mail do solicitante")
    .fill(`operador-e2e-${suffix}@example.test`);
  await page.getByLabel("Prioridade").selectOption("high");
  await page.getByRole("button", { name: "Criar ticket" }).click();

  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Processado", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("No prazo", { exact: true })).toBeVisible();

  await page.getByLabel("Status de atendimento").selectOption("in_progress");
  await page.getByRole("button", { name: "Atualizar status" }).click();

  await expect(
    page.getByText("Atendimento: Aberto → Em andamento", { exact: true }),
  ).toBeVisible();
});
