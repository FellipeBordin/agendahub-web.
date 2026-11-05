import { useCallback, useEffect, useState } from "react";
import { LoginPage } from "@/pages/LoginPage";
import { AgendaPage } from "@/pages/AgendaPage";
import type { AuthSession } from "@/services/auth.service";

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);

  const handleLogout = useCallback(() => {
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) return;

    const timeout = window.setTimeout(handleLogout, session.expiresIn * 1000);

    return () => window.clearTimeout(timeout);
  }, [session, handleLogout]);

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  return <AgendaPage session={session} onLogout={handleLogout} />;
}

export default App;
