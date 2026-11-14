import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PushNotificationSettings } from "@/components/layout/PushNotificationSettings";
import { LoginPage } from "@/pages/LoginPage";
import { AgendaPage } from "@/pages/AgendaPage";
import { NewAppointmentPage } from "@/pages/NewAppointmentPage";
import { ServicesPage } from "@/pages/ServicesPage";
import { AvailabilityPage } from "@/pages/AvailabilityPage";
import { isAuthSession, type AuthSession } from "@/services/auth.service";
import { deactivatePush } from "@/services/push.service";
import { PublicBookingPage } from "@/pages/PublicBookingPage";

type Page = "agenda" | "new" | "services" | "availability";

type StoredSession = {
  session: AuthSession;
  expiresAt: number;
};

const SESSION_KEY = "agendahub.auth";

function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // O navegador pode bloquear o armazenamento.
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);

    if (!raw) return null;

    const stored: unknown = JSON.parse(raw);

    if (
      typeof stored !== "object" ||
      stored === null ||
      !("session" in stored) ||
      !("expiresAt" in stored) ||
      !isAuthSession(stored.session) ||
      typeof stored.expiresAt !== "number" ||
      !Number.isFinite(stored.expiresAt) ||
      stored.expiresAt <= Date.now()
    ) {
      clearStoredSession();
      return null;
    }

    return {
      session: stored.session,
      expiresAt: stored.expiresAt,
    };
  } catch {
    clearStoredSession();
    return null;
  }
}

function AdminApp() {
  const [auth, setAuth] = useState<StoredSession | null>(readStoredSession);

  const session = auth?.session ?? null;

  const [page, setPage] = useState<Page>("agenda");
  const [agendaDate, setAgendaDate] = useState<string>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [storageMessage, setStorageMessage] = useState("");

  const sessionRef = useRef<AuthSession | null>(session);
  const logoutRunning = useRef(false);

  const handleLogin = useCallback((newSession: AuthSession) => {
    const stored: StoredSession = {
      session: newSession,
      expiresAt: Date.now() + newSession.expiresIn * 1000,
    };

    setStorageMessage("");

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    } catch {
      setStorageMessage(
        "O navegador bloqueou o armazenamento da sessão. Você poderá usar o painel, mas precisará entrar novamente ao atualizar a página.",
      );
    }

    sessionRef.current = newSession;

    setLogoutError("");
    setPage("agenda");
    setAgendaDate(undefined);
    setAuth(stored);
  }, []);

  const handleLogout = useCallback(() => {
    if (logoutRunning.current) return;

    logoutRunning.current = true;

    // Remove imediatamente para não restaurar o login durante a saída.
    clearStoredSession();

    setIsLoggingOut(true);
    setLogoutError("");
    setStorageMessage("");

    const currentSession = sessionRef.current;

    void (async () => {
      try {
        if (currentSession) {
          await deactivatePush(currentSession);
        }
      } catch {
        setLogoutError(
          "Você saiu da conta, mas não foi possível confirmar o cancelamento dos avisos. Bloqueie as notificações deste site nas configurações do navegador.",
        );
      } finally {
        sessionRef.current = null;

        setAuth(null);
        setPage("agenda");
        setAgendaDate(undefined);
        setIsLoggingOut(false);

        logoutRunning.current = false;
      }
    })();
  }, []);

  useEffect(() => {
    if (!auth) return;

    function checkExpiration() {
      if (auth && Date.now() >= auth.expiresAt) {
        handleLogout();
      }
    }

    const remainingTime = Math.max(0, auth.expiresAt - Date.now());

    const timeout = window.setTimeout(
      checkExpiration,
      Math.min(remainingTime, 2_147_483_647),
    );

    // Também verifica ao voltar para uma aba que ficou em segundo plano.
    window.addEventListener("focus", checkExpiration);
    document.addEventListener("visibilitychange", checkExpiration);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", checkExpiration);
      document.removeEventListener("visibilitychange", checkExpiration);
    };
  }, [auth, handleLogout]);

  function navigate(nextPage: Page) {
    if (logoutRunning.current || nextPage === page) return;

    if (
      page !== "agenda" &&
      !window.confirm(
        "Trocar de tela? Alterações não salvas serão perdidas. Se estiver salvando, aguarde a confirmação antes de sair.",
      )
    ) {
      return;
    }

    setPage(nextPage);
    window.scrollTo({ top: 0 });
  }

  if (isLoggingOut) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
        <p
          role="status"
          className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground"
        >
          Encerrando a sessão e desativando os avisos neste aparelho...
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <>
        {logoutError && (
          <p
            role="alert"
            className="border-b bg-card px-6 py-4 text-sm leading-relaxed text-destructive"
          >
            {logoutError}
          </p>
        )}

        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <AppShell
      session={session}
      page={page}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {storageMessage && (
        <p
          role="status"
          className="mx-auto max-w-6xl px-4 pt-4 text-sm text-muted-foreground sm:px-10"
        >
          {storageMessage}
        </p>
      )}

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-10">
        <PushNotificationSettings
          key={`${session.user.id}-${session.business.id}`}
          session={session}
          onLogout={handleLogout}
        />
      </div>

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
            if (logoutRunning.current) return;

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

      {page === "availability" && (
        <AvailabilityPage
          session={session}
          onLogout={handleLogout}
          onBack={() => navigate("agenda")}
        />
      )}
    </AppShell>
  );
}

function App() {
  const path = window.location.pathname;

  const publicRoute = path.match(/^\/agendar\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);

  if (publicRoute) {
    return <PublicBookingPage slug={publicRoute[1]!} />;
  }

  if (path === "/" || path === "/admin" || path === "/admin/") {
    return <AdminApp />;
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>

        <p className="text-sm text-muted-foreground">
          Confira o endereço enviado pelo estabelecimento.
        </p>
      </div>
    </main>
  );
}

export default App;
