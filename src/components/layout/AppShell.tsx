import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AuthSession } from "@/services/auth.service";

type Screen = "agenda" | "new" | "services";
type IconName = Screen | "logout";

type AppShellProps = {
  session: AuthSession;
  page: Screen;
  onNavigate: (page: Screen) => void;
  onLogout: () => void;
  children: ReactNode;
};

function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {name === "agenda" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2" />
        </>
      )}

      {name === "services" && (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      )}

      {name === "new" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </>
      )}

      {name === "logout" && (
        <>
          <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h13" />
        </>
      )}
    </svg>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Icon name="agenda" className="size-6" />
      </div>

      <div>
        <p className="text-xl font-semibold tracking-tight">
          Agenda<span className="text-primary">Hub</span>
        </p>
        <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Seu tempo, organizado
        </p>
      </div>
    </div>
  );
}

const navigation: { page: Screen; label: string }[] = [
  { page: "agenda", label: "Minha agenda" },
  { page: "services", label: "Serviços" },
  { page: "new", label: "Novo agendamento" },
];

export function AppShell({
  session,
  page,
  onNavigate,
  onLogout,
  children,
}: AppShellProps) {
  const initials = session.user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-svh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card px-5 py-8 lg:flex">
        <div className="px-2">
          <Brand />
        </div>

        <div className="mt-10 rounded-2xl border bg-background px-4 py-4">
          <p className="hub-eyebrow">Seu negócio</p>
          <p className="mt-2 truncate text-sm font-semibold">
            {session.business.name}
          </p>
        </div>

        <p className="hub-eyebrow mt-9 mb-3 px-4">Gerenciar</p>

        <nav aria-label="Menu principal" className="space-y-2">
          {navigation.map((item) => (
            <button
              key={item.page}
              type="button"
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => onNavigate(item.page)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                page === item.page
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon name={item.page} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-5 pt-10">
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-sm font-semibold">Uma rotina mais leve.</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Organize seus atendimentos e tenha mais tempo para seus clientes.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={onLogout}
            className="h-11 w-full justify-start gap-3 px-4 text-muted-foreground"
          >
            <Icon name="logout" />
            Sair da conta
          </Button>
        </div>
      </aside>

      <div className="pb-24 lg:pb-0 lg:pl-64">
        <header className="border-b bg-card">
          <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-10">
            <div className="lg:hidden">
              <Brand />
            </div>

            <div className="hidden lg:block">
              <p className="text-sm font-medium">Painel do negócio</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tudo pronto para organizar o seu dia.
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-semibold">
                  {session.user.name}
                </p>
                <p className="text-xs text-muted-foreground">Administrador</p>
              </div>

              <div
                aria-label={session.user.name}
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white bg-secondary text-sm font-semibold text-primary ring-1 ring-border"
              >
                {initials}
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={onLogout}
                className="min-h-11 px-2 lg:hidden"
                aria-label="Sair da conta"
              >
                <Icon name="logout" />
              </Button>
            </div>
          </div>
        </header>

        {children}
      </div>

      <nav
        aria-label="Menu principal no celular"
        className="hub-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 gap-1 border-t bg-card px-3 pt-2 lg:hidden"
      >
        {navigation.map((item) => (
          <button
            key={item.page}
            type="button"
            aria-current={page === item.page ? "page" : undefined}
            onClick={() => onNavigate(item.page)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              page === item.page
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon name={item.page} />
            {item.page === "new" ? "Agendar" : item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
