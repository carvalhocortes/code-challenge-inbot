import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TicketForm } from "./ticket-form";

describe("TicketForm", () => {
  it("impede o envio de dados inválidos e associa o erro ao título", async () => {
    const createTicket = vi.fn();

    render(<TicketForm onCreate={createTicket} />);

    await userEvent.click(screen.getByRole("button", { name: "Criar ticket" }));

    const titleInput = screen.getByLabelText("Título");
    expect(createTicket).not.toHaveBeenCalled();
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Informe um título com ao menos 3 caracteres."),
    ).toBeVisible();
  });
});
