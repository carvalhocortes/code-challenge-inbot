import { Navigate, Route, Routes } from "react-router-dom";

import { TicketDetailPage } from "../pages/tickets/detail/ui/page";
import { TicketListPage } from "../pages/tickets/list/ui/page";
import { NewTicketPage } from "../pages/tickets/new/ui/page";
import { NotFoundPage } from "../pages/not-found/ui/page";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<Navigate replace to="/tickets" />} path="/" />
      <Route element={<TicketListPage />} path="/tickets" />
      <Route element={<NewTicketPage />} path="/tickets/new" />
      <Route element={<TicketDetailPage />} path="/tickets/:id" />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
