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
  onServices?: () => void;
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
      className="hub-card relative overflow-hidden p-5 sm:p-6"
    >
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${
          appointment.status === "SCHEDULED"
            ? "bg-primary"
            : appointment.status === "COMPLETED"
              ? "bg-emerald-400"
              : "bg-border"
        }`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-xl bg-secondary/70 px-3 py-2 text-lg font-semibold tracking-tight text-primary tabular-nums">
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

  function changeDay(amount: number) {
    const selected = new Date(`${date || getToday()}T12:00:00Z`);
    selected.setUTCDate(selected.getUTCDate() + amount);
    setDate(selected.toISOString().slice(0, 10));
  }

  const dateLabel = date
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date(`${date}T12:00:00Z`))
    : "Selecione uma data";

  return (
    <main className="hub-page space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="hub-eyebrow mb-3">{session.business.name}</p>

          <h1 className="hub-heading">Sua agenda, mais leve.</h1>

          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Um dia organizado começa aqui. Acompanhe seus atendimentos e cuide
            de cada detalhe.
          </p>
        </div>

        <Button
          type="button"
          className="h-12 shrink-0 gap-2 rounded-xl px-5 shadow-sm"
          onClick={onCreate}
        >
          <span aria-hidden="true" className="text-xl font-normal">
            +
          </span>
          Novo agendamento
        </Button>
      </section>

      <section
        aria-label="Selecionar data da agenda"
        className="hub-card overflow-hidden"
      >
        <div className="flex flex-col justify-between gap-4 border-b bg-secondary/40 p-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="hub-eyebrow">Agenda do dia</p>
            <h2 className="mt-2 text-lg font-semibold capitalize sm:text-xl">
              {dateLabel}
            </h2>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 bg-card px-5"
            onClick={() => {
              setDate(getToday());
              refreshAppointments();
            }}
          >
            Voltar para hoje
          </Button>
        </div>

        <div className="space-y-4 p-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="agenda-date">Escolha a data</Label>

              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Dia anterior"
                  className="size-12 shrink-0 text-xl"
                  onClick={() => changeDay(-1)}
                >
                  <span aria-hidden="true">‹</span>
                </Button>

                <Input
                  id="agenda-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-12 min-w-0 flex-1 rounded-xl bg-background text-base md:text-base"
                />

                <Button
                  type="button"
                  variant="outline"
                  aria-label="Próximo dia"
                  className="size-12 shrink-0 text-xl"
                  onClick={() => changeDay(1)}
                >
                  <span aria-hidden="true">›</span>
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={!date}
              className="h-12 rounded-xl px-6"
              onClick={refreshAppointments}
            >
              Atualizar agenda
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Horários exibidos no fuso de São Paulo.
          </p>
        </div>
      </section>

      <section aria-label="Agendamentos da data selecionada">
        <div className="mb-4 flex items-center gap-3">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Seus atendimentos</h2>
          <div className="h-px flex-1 bg-border" />
        </div>

        {date ? (
          <AppointmentList
            key={`${date}-${reload}`}
            session={session}
            date={date}
            onLogout={onLogout}
            onRetry={refreshAppointments}
          />
        ) : (
          <div className="hub-card p-8 text-center">
            <p role="status" className="text-sm text-muted-foreground">
              Selecione uma data para consultar a agenda.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
