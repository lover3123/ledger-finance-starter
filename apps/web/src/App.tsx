import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "@ledger/shared";
import { api } from "./api";
import { AuthForm } from "./components/AuthForm";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { PersonDetailPage } from "./pages/PersonDetailPage";
import { RequestsPage } from "./pages/RequestsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { LendingPage } from "./pages/LendingPage";
import { SplitsPage } from "./pages/SplitsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { TransactionDetailPage } from "./pages/TransactionDetailPage";
import { QRScanPage } from "./pages/QRScanPage";
import { PaymentSessionPage } from "./pages/PaymentSessionPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("ledger_token")) {
      setCheckingAuth(false);
      return;
    }

    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem("ledger_token"))
      .finally(() => setCheckingAuth(false));
  }, []);

  function logout() {
    localStorage.removeItem("ledger_token");
    setUser(null);
  }

  if (checkingAuth) return <div className="loading-screen">Opening Ledger...</div>;
  if (!user) return <><ScrollToTop /><Routes><Route path="*" element={<AuthForm onAuth={setUser} />} /></Routes></>;

  return <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<DashboardPage user={user} onLogout={logout} />} />
      <Route path="/transactions" element={<TransactionsPage user={user} onLogout={logout} />} />
      <Route path="/budgets" element={<BudgetsPage user={user} onLogout={logout} />} />
      <Route path="/settings" element={<SettingsPage user={user} onLogout={logout} />} />

      {/* Ledger Pay */}
      <Route path="/people" element={<PeoplePage user={user} onLogout={logout} />} />
      <Route path="/people/:userId" element={<PersonDetailPage user={user} onLogout={logout} />} />
      <Route path="/requests" element={<RequestsPage user={user} onLogout={logout} />} />
      <Route path="/requests/:id" element={<RequestDetailPage user={user} onLogout={logout} />} />
      <Route path="/scan" element={<QRScanPage user={user} onLogout={logout} />} />
      <Route path="/payment/:sessionId" element={<PaymentSessionPage user={user} onLogout={logout} />} />
      <Route path="/pay/:id" element={<TransactionDetailPage user={user} onLogout={logout} />} />
      <Route path="/lending" element={<LendingPage user={user} onLogout={logout} />} />
      <Route path="/splits" element={<SplitsPage user={user} onLogout={logout} />} />
      <Route path="/notifications" element={<NotificationsPage user={user} onLogout={logout} />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>;
}
