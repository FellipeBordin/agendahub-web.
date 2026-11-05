import { useCallback, useEffect, useState } from "react";
import { LoginPage } from "@/pages/LoginPage";
import { AgendaPage } from "@/pages/AgendaPage";
import { NewAppointmentPage } from "@/pages/NewAppointmentPage";
import type { AuthSession } from "@/services/auth.service";

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [page, setPage] = useState<"agenda" | "new">("agenda");
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

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  if (page === "new") {
    return (
      <NewAppointmentPage
        session={session}
        onBack={() => setPage("agenda")}
        onCreated={(date) => {
          setAgendaDate(date);
          setPage("agenda");
        }}
      />
    );
  }

  return (
    <AgendaPage
      session={session}
      onLogout={handleLogout}
      onCreate={() => setPage("new")}
      initialDate={agendaDate}
    />
  );
}

export default App;
