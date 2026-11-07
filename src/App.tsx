import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { AgendaPage } from "@/pages/AgendaPage";
import { NewAppointmentPage } from "@/pages/NewAppointmentPage";
import { ServicesPage } from "@/pages/ServicesPage";
import type { AuthSession } from "@/services/auth.service";

type Page = "agenda" | "new" | "services";

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [page, setPage] = useState<Page>("agenda");
  const [agendaDate, setAgendaDate] = useState<string>();

  const handleLogout = useCallback(() => {
    setSession(null);
    setPage("agenda");
    setAgendaDate(undefined);
  }, []);

  useEffect(() => {
    if (!session) return;

    const timeout = window.setTimeout(handleLogout, session.expiresIn * 1000);

    return () => window.clearTimeout(timeout);
  }, [session, handleLogout]);

  function navigate(nextPage: Page) {
    if (nextPage === page) return;

    if (
      (page === "new" || page === "services") &&
      !window.confirm(
        "Trocar de tela? Se houver um formulário em edição, os dados não salvos serão perdidos. Se estiver salvando, aguarde a confirmação antes de sair.",
      )
    ) {
      return;
    }

    setPage(nextPage);
    window.scrollTo({ top: 0 });
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  return (
    <AppShell
      session={session}
      page={page}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {page === "agenda" && (
        <AgendaPage
          session={session}
          onLogout={handleLogout}
          onCreate={() => navigate("new")}
          onServices={() => navigate("services")}
          initialDate={agendaDate}
        />
      )}

      {page === "new" && (
        <NewAppointmentPage
          session={session}
          onBack={() => navigate("agenda")}
          onCreated={(date) => {
            setAgendaDate(date);
            setPage("agenda");
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {page === "services" && (
        <ServicesPage
          session={session}
          onLogout={handleLogout}
          onBack={() => navigate("agenda")}
        />
      )}
    </AppShell>
  );
}

export default App;
