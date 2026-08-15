import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="problem-state" aria-labelledby="not-found-title">
      <p className="eyebrow">Rota não encontrada</p>
      <h1 id="not-found-title">Esta tela não existe</h1>
      <p>Volte à central para continuar acompanhando os Tickets.</p>
      <Link className="button button-primary" to="/tickets">
        Ir para tickets
      </Link>
    </section>
  );
}
