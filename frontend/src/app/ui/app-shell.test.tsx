import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("indica que a API está disponível quando a prontidão responde com sucesso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "ready" }), { status: 200 }),
        ),
      ),
    );

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <AppShell>
            <p>Conteúdo da página</p>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("API disponível")).toBeVisible();
  });
});
