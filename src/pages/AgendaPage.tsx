import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthSession } from "@/services/auth.service";
import {
  getDailyAppointments,
  parseAppointmentDate,
  SessionExpiredError,
  type Appointment,
  type AppointmentStatus,
} from "@/services/appointment.service";

type AgendaPageProps = {
  session: AuthSession;
  onLogout: () => void;
};

type AppointmentListProps = AgendaPageProps & {
  date: string;
  onRetry: () => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "success"; appointments: Appointment[] }
  | { status: "error"; message: string };

const statusLabels: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendado",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

const statusStyles: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  CANCELED: "bg-muted text-muted-foreground",
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  const day = parts.find((part) => part.type === "day")!.value;

  return `${year}-${month}-${day}`;
}

function formatTime(value: string): string {
  return timeFormatter.format(parseAppointmentDate(value));
}

function AppointmentList({
  session,
  date,
  onLogout,
  onRetry,
}: AppointmentListProps) {
  const [state, setState] = useState<LoadState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;

    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);

    async function loadAppointments() {
      try {
        const appointments = await getDailyAppointments(
          session,
          date,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        setState({
          status: "success",
          appointments,
        });
      } catch (error) {
        // Ignora uma consulta cancelada ao trocar a data ou sair.
        if (controller.signal.aborted && !timedOut) return;

        if (error instanceof SessionExpiredError) {
          onLogout();
          return;
        }

        setState({
          status: "error",
          message: timedOut
            ? "A consulta demorou demais. Tente novamente."
            : error instanceof TypeError
              ? "Não foi possível conectar à API. Confira sua conexão."
              : error instanceof Error
                ? error.message
                : "Não foi possível carregar a agenda.",
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadAppointments();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [session, date, onLogout]);

  if (state.status === "loading") {
    return (
      <div
        role="status"
        className="rounded-2xl border bg-card px-6 py-12 text-center"
      >
        <p className="text-muted-foreground">Carregando sua agenda...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>

        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={onRetry}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (state.appointments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
        <h2 className="text-lg font-semibold">Nenhum agendamento neste dia</h2>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Quando houver agendamentos, eles aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">
        {state.appointments.length} agendamento(s) nesta data
      </p>

      <ul className="space-y-3">
        {state.appointments.map((appointment) => (
          <li key={appointment.id}>
            <article className="rounded-2xl border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold tabular-nums">
                  <time
                    dateTime={parseAppointmentDate(
                      appointment.startAt,
                    ).toISOString()}
                  >
                    {formatTime(appointment.startAt)}
                  </time>
                  {" – "}
                  <time
                    dateTime={parseAppointmentDate(
                      appointment.endAt,
                    ).toISOString()}
                  >
                    {formatTime(appointment.endAt)}
                  </time>
                </p>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[appointment.status]}`}
                >
                  {statusLabels[appointment.status]}
                </span>
              </div>

              <h2 className="mt-4 break-words text-lg font-semibold">
                {appointment.clientName}
              </h2>

              <p className="mt-1 break-words text-sm text-muted-foreground">
                WhatsApp: {appointment.clientPhone}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgendaPage({ session, onLogout }: AgendaPageProps) {
  const [date, setDate] = useState(getToday);
  const [reload, setReload] = useState(0);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              AgendaHub
            </p>

            <p className="truncate text-lg font-semibold">
              {session.business.name}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 px-4"
            onClick={onLogout}
          >
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sua agenda</h1>

          <p className="mt-2 text-muted-foreground">
            Acompanhe os atendimentos do seu negócio.
          </p>
        </div>

        <section
          aria-label="Selecionar data da agenda"
          className="rounded-2xl border bg-card p-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="agenda-date">Data dos agendamentos</Label>

              <Input
                id="agenda-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-12 w-full min-w-0 text-base md:text-base"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-12 px-6"
              onClick={() => {
                setDate(getToday());
                setReload((current) => current + 1);
              }}
            >
              Hoje
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Horários no fuso de São Paulo.
          </p>
        </section>

        <section aria-label="Agendamentos da data selecionada">
          {date ? (
            <AppointmentList
              key={`${date}-${reload}`}
              session={session}
              date={date}
              onLogout={onLogout}
              onRetry={() => setReload((current) => current + 1)}
            />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Selecione uma data para consultar a agenda.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
