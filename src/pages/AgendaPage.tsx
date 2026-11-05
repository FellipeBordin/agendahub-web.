import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthSession } from "@/services/auth.service";
import {
  getDailyAppointments,
  parseAppointmentDate,
  SessionExpiredError,
  updateAppointmentStatus,
  type Appointment,
  type AppointmentStatus,
} from "@/services/appointment.service";

type AgendaPageProps = {
  session: AuthSession;
  onLogout: () => void;
  onCreate?: () => void;
  initialDate?: string;
};

type AppointmentListProps = AgendaPageProps & {
  date: string;
  onRetry: () => void;
};

type AppointmentCardProps = AgendaPageProps & {
  appointment: Appointment;
  onUpdated: (appointment: Appointment) => void;
  onRefresh: () => void;
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

const successMessages: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendamento reativado.",
  COMPLETED: "Atendimento concluído.",
  CANCELED: "Agendamento cancelado.",
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

function AppointmentCard({
  session,
  appointment,
  onLogout,
  onUpdated,
  onRefresh,
}: AppointmentCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleStatusChange(status: AppointmentStatus) {
    if (submitting.current || error) return;

    if (status === "CANCELED") {
      const confirmed = window.confirm(
        `Cancelar o agendamento de ${appointment.clientName}, às ${formatTime(appointment.startAt)}?`,
      );

      if (!confirmed) return;
    }

    if (status === "COMPLETED") {
      const confirmed = window.confirm(
        `Marcar o atendimento de ${appointment.clientName} como concluído? Essa ação não poderá ser desfeita pela agenda.`,
      );

      if (!confirmed) return;
    }

    submitting.current = true;
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const updated = await updateAppointmentStatus(
        session,
        appointment.id,
        status,
      );

      if (!mounted.current) return;

      onUpdated(updated);
      setMessage(successMessages[updated.status]);
    } catch (caught) {
      if (!mounted.current) return;

      if (caught instanceof SessionExpiredError) {
        onLogout();
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível alterar o agendamento.",
      );
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setIsSaving(false);
      }
    }
  }

  const actionsDisabled = isSaving || error !== "";

  return (
    <article
      aria-busy={isSaving}
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold tabular-nums">
          <time
            dateTime={parseAppointmentDate(appointment.startAt).toISOString()}
          >
            {formatTime(appointment.startAt)}
          </time>
          {" – "}
          <time
            dateTime={parseAppointmentDate(appointment.endAt).toISOString()}
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

      {appointment.status !== "COMPLETED" && (
        <div className="mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row">
          {appointment.status === "SCHEDULED" && (
            <>
              <Button
                type="button"
                disabled={actionsDisabled}
                className="min-h-11 sm:min-w-32"
                onClick={() => void handleStatusChange("COMPLETED")}
              >
                Concluir
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={actionsDisabled}
                className="min-h-11 sm:min-w-32"
                onClick={() => void handleStatusChange("CANCELED")}
              >
                Cancelar
              </Button>
            </>
          )}

          {appointment.status === "CANCELED" && (
            <Button
              type="button"
              variant="outline"
              disabled={actionsDisabled}
              className="min-h-11 sm:min-w-32"
              onClick={() => void handleStatusChange("SCHEDULED")}
            >
              Reativar
            </Button>
          )}
        </div>
      )}

      <p role="status" className="mt-3 text-sm text-muted-foreground">
        {isSaving ? "Salvando alteração..." : message}
      </p>

      {error && (
        <div className="mt-3 space-y-3">
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {error}
          </p>

          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onRefresh}
          >
            Atualizar agenda
          </Button>
        </div>
      )}
    </article>
  );
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
    let disposed = false;
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

        if (disposed || controller.signal.aborted) return;

        setState({
          status: "success",
          appointments,
        });
      } catch (error) {
        if (disposed) return;

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
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [session, date, onLogout]);

  function handleUpdated(updated: Appointment) {
    setState((current) => {
      if (current.status !== "success") return current;

      return {
        status: "success",
        appointments: current.appointments.map((appointment) =>
          appointment.id === updated.id ? updated : appointment,
        ),
      };
    });
  }

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
            <AppointmentCard
              appointment={appointment}
              session={session}
              onLogout={onLogout}
              onUpdated={handleUpdated}
              onRefresh={onRetry}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgendaPage({
  session,
  onLogout,
  onCreate,
  initialDate,
}: AgendaPageProps) {
  const [date, setDate] = useState(() => initialDate ?? getToday());
  const [reload, setReload] = useState(0);

  function refreshAppointments() {
    setReload((current) => current + 1);
  }

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
          <Button
            type="button"
            className="mt-4 min-h-12 w-full sm:w-auto"
            onClick={onCreate}
          >
            Novo agendamento
          </Button>
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

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 px-5"
                onClick={() => {
                  setDate(getToday());
                  refreshAppointments();
                }}
              >
                Hoje
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={!date}
                className="h-12 flex-1 px-5"
                onClick={refreshAppointments}
              >
                Atualizar
              </Button>
            </div>
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
              onRetry={refreshAppointments}
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
