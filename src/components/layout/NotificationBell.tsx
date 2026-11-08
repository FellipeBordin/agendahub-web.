import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AuthSession } from "@/services/auth.service";
import {
  parseAppointmentDate,
  SessionExpiredError,
} from "@/services/appointment.service";
import {
  getNotifications,
  markNotificationAsRead,
  type AppNotification,
} from "@/services/notification.service";

type NotificationBellProps = {
  session: AuthSession;
  onLogout: () => void;
};

const appointmentFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Não foi possível conectar à API.";
  }

  return error instanceof Error
    ? error.message
    : "Não foi possível atualizar as notificações.";
}

export function NotificationBell({ session, onLogout }: NotificationBellProps) {
  const [data, setData] = useState<{
    notifications: AppNotification[];
    unreadCount: number;
  } | null>(null);

  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  const mounted = useRef(false);
  const submitting = useRef(false);
  const version = useRef(0);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let nextPoll: number | undefined;
    let requestTimeout: number | undefined;
    let controller: AbortController | undefined;

    async function load() {
      if (disposed) return;

      if (document.hidden || submitting.current) {
        nextPoll = window.setTimeout(() => void load(), 30_000);
        return;
      }

      const requestVersion = version.current;
      const requestController = new AbortController();
      controller = requestController;

      requestTimeout = window.setTimeout(() => {
        requestController.abort();
      }, 15_000);

      let sessionExpired = false;

      try {
        const result = await getNotifications(
          session,
          requestController.signal,
        );

        if (disposed || requestVersion !== version.current) return;

        setData(result);
        setError("");
      } catch (cause) {
        if (disposed || requestVersion !== version.current) return;

        if (cause instanceof SessionExpiredError) {
          sessionExpired = true;
          onLogout();
          return;
        }

        setError(
          requestController.signal.aborted
            ? "A consulta demorou demais. Tente novamente."
            : errorMessage(cause),
        );
      } finally {
        window.clearTimeout(requestTimeout);

        if (!disposed && !sessionExpired) {
          nextPoll = window.setTimeout(() => void load(), 30_000);
        }
      }
    }

    void load();

    return () => {
      disposed = true;
      window.clearTimeout(nextPoll);
      window.clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, [session, onLogout, refresh]);

  async function handleRead(notification: AppNotification) {
    if (submitting.current || notification.readAt !== null) return;

    submitting.current = true;

    // Impede uma consulta anterior de sobrescrever a leitura.
    version.current += 1;

    setSavingId(notification.id);
    setError("");

    try {
      const saved = await markNotificationAsRead(session, notification.id);

      if (!mounted.current) return;

      setData((current) => {
        if (!current) return current;

        const notifications = current.notifications.map((item) =>
          item.id === saved.id ? saved : item,
        );

        return {
          notifications,
          unreadCount: notifications.filter((item) => item.readAt === null)
            .length,
        };
      });

      setRefresh((current) => current + 1);
    } catch (cause) {
      if (!mounted.current) return;

      if (cause instanceof SessionExpiredError) {
        onLogout();
        return;
      }

      setError(errorMessage(cause));
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setSavingId(null);
      }
    }
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <details
      ref={disclosure}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && disclosure.current?.open) {
          disclosure.current.open = false;
          trigger.current?.focus();
        }
      }}
    >
      <summary
        ref={trigger}
        aria-label={
          data ? `Notificações: ${unreadCount} não lidas` : "Notificações"
        }
        className="relative flex size-11 cursor-pointer list-none items-center justify-center rounded-xl text-primary transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-6"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>

        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0 right-0 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-5 font-semibold text-primary-foreground"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </summary>

      <section
        aria-label="Notificações de agendamentos"
        className="fixed inset-x-4 top-22 z-50 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl sm:absolute sm:inset-x-auto sm:top-14 sm:right-0 sm:w-96"
      >
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Notificações</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Novas reservas do seu negócio.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-3"
            disabled={savingId !== null}
            onClick={() => setRefresh((current) => current + 1)}
          >
            Atualizar
          </Button>
        </div>

        <div className="max-h-[60svh] overflow-y-auto overscroll-contain">
          {error && (
            <p
              role="alert"
              className="border-b p-4 text-sm leading-relaxed text-destructive"
            >
              {error}
            </p>
          )}

          {!data && !error && (
            <p
              role="status"
              className="p-6 text-center text-sm text-muted-foreground"
            >
              Carregando notificações...
            </p>
          )}

          {data?.notifications.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-sm font-medium">
                Nenhuma notificação por enquanto
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                As novas reservas aparecerão aqui.
              </p>
            </div>
          )}

          {data && data.notifications.length > 0 && (
            <ul className="divide-y">
              {data.notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={
                    notification.readAt === null ? "bg-secondary/40 p-4" : "p-4"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Nova reserva</p>

                    <span className="text-xs text-muted-foreground">
                      {notification.readAt === null ? "Não lida" : "Lida"}
                    </span>
                  </div>

                  <p className="mt-2 break-words text-sm font-medium">
                    {notification.clientName}
                  </p>

                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {notification.serviceName}
                  </p>

                  <time
                    dateTime={parseAppointmentDate(
                      notification.startAt,
                    ).toISOString()}
                    className="mt-2 block text-xs text-muted-foreground"
                  >
                    {appointmentFormatter.format(
                      parseAppointmentDate(notification.startAt),
                    )}
                  </time>

                  {notification.readAt === null && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 min-h-11 w-full"
                      disabled={savingId !== null}
                      onClick={() => void handleRead(notification)}
                    >
                      {savingId === notification.id
                        ? "Salvando..."
                        : "Marcar como lida"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Horários no fuso de São Paulo.
        </p>
      </section>
    </details>
  );
}
