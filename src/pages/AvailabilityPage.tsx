import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthSession } from "@/services/auth.service";
import { SessionExpiredError } from "@/services/appointment.service";
import {
  getAvailability,
  saveAvailability,
  type Availability,
  type AvailabilityInput,
} from "@/services/availability.service";

type AvailabilityPageProps = {
  session: AuthSession;
  onLogout: () => void;
  onBack: () => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: Availability[] };

const days = [
  { value: 1, name: "Segunda-feira", short: "Seg" },
  { value: 2, name: "Terça-feira", short: "Ter" },
  { value: 3, name: "Quarta-feira", short: "Qua" },
  { value: 4, name: "Quinta-feira", short: "Qui" },
  { value: 5, name: "Sexta-feira", short: "Sex" },
  { value: 6, name: "Sábado", short: "Sáb" },
  { value: 0, name: "Domingo", short: "Dom" },
];

function getErrorMessage(error: unknown): string {
  return error instanceof TypeError
    ? "Não foi possível conectar à API."
    : error instanceof Error
      ? error.message
      : "Não foi possível realizar a operação.";
}

function HoursForm({
  dayOfWeek,
  availability,
  disabled,
  onSave,
}: {
  dayOfWeek: number;
  availability?: Availability;
  disabled: boolean;
  onSave: (input: AvailabilityInput) => Promise<void>;
}) {
  const [validationError, setValidationError] = useState("");
  const dayName = days.find((day) => day.value === dayOfWeek)!.name;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) return;

    const data = new FormData(event.currentTarget);
    const startTime = String(data.get("startTime") ?? "");
    const endTime = String(data.get("endTime") ?? "");
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      setValidationError("Informe a abertura e o fechamento no formato HH:mm.");
      return;
    }

    if (endTime <= startTime) {
      setValidationError(
        "O fechamento deve ser posterior à abertura, no mesmo dia.",
      );
      return;
    }

    setValidationError("");
    await onSave({ dayOfWeek, startTime, endTime });
  }

  return (
    <section className="hub-card p-5 sm:p-6">
      <p className="hub-eyebrow">
        {availability ? "Editar funcionamento" : "Configurar funcionamento"}
      </p>

      <h2 className="mt-2 text-xl font-semibold">{dayName}</h2>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Esses horários se repetem semanalmente.
      </p>

      {availability && !availability.active && (
        <p className="mt-4 rounded-xl bg-secondary p-3 text-sm">
          Este dia está inativo. Editar os horários não o ativa.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <fieldset disabled={disabled} className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="opening-time">Abertura</Label>
              <Input
                id="opening-time"
                name="startTime"
                type="time"
                step={60}
                required
                defaultValue={availability?.startTime ?? "09:00"}
                className="h-12 min-w-0 text-base md:text-base"
              />
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="closing-time">Fechamento</Label>
              <Input
                id="closing-time"
                name="endTime"
                type="time"
                step={60}
                required
                defaultValue={availability?.endTime ?? "18:00"}
                className="h-12 min-w-0 text-base md:text-base"
              />
            </div>
          </div>

          {validationError && (
            <p role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          )}

          <Button type="submit" className="h-12 w-full sm:w-auto">
            Salvar horários
          </Button>
        </fieldset>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        A alteração será recusada se deixar agendamentos ativos fora do novo
        horário. Horários no fuso de São Paulo.
      </p>
    </section>
  );
}

function AvailabilityContent({
  session,
  onLogout,
  onReload,
}: {
  session: AuthSession;
  onLogout: () => void;
  onReload: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedDay, setSelectedDay] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [formVersion, setFormVersion] = useState(0);

  const mounted = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    async function load() {
      try {
        const items = await getAvailability(session, controller.signal);

        if (disposed) return;

        setState({ status: "success", items });
      } catch (error) {
        if (disposed) return;

        if (error instanceof SessionExpiredError) {
          onLogout();
          return;
        }

        setState({
          status: "error",
          message: controller.signal.aborted
            ? "A consulta demorou demais. Tente novamente."
            : getErrorMessage(error),
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load();

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [session, onLogout]);

  async function handleSave(input: AvailabilityInput) {
    if (submitting.current || mutationError || state.status !== "success") {
      return;
    }

    const alreadyExists = state.items.some(
      (item) => item.dayOfWeek === input.dayOfWeek,
    );

    submitting.current = true;
    setIsSaving(true);
    setMessage("");

    try {
      const saved = await saveAvailability(session, input, alreadyExists);

      if (!mounted.current) return;

      setState((current) => {
        if (current.status !== "success") return current;

        return {
          status: "success",
          items: [
            ...current.items.filter(
              (item) => item.dayOfWeek !== saved.dayOfWeek,
            ),
            saved,
          ],
        };
      });

      setFormVersion((current) => current + 1);
      setMessage("Horários salvos com sucesso.");
    } catch (error) {
      if (!mounted.current) return;

      if (error instanceof SessionExpiredError) {
        onLogout();
        return;
      }

      setMutationError(getErrorMessage(error));
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setIsSaving(false);
      }
    }
  }

  if (state.status === "loading") {
    return (
      <div className="hub-card p-8">
        <p role="status" className="text-sm text-muted-foreground">
          Carregando funcionamento...
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="hub-card space-y-4 p-5">
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
        <Button type="button" variant="outline" onClick={onReload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const selectedAvailability = state.items.find(
    (item) => item.dayOfWeek === selectedDay,
  );

  const disabled = isSaving || Boolean(mutationError);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="hub-eyebrow">Sua semana</p>

        <Button
          type="button"
          variant="outline"
          disabled={isSaving}
          className="min-h-11"
          onClick={() => {
            if (
              window.confirm(
                "Atualizar os horários? Alterações ainda não salvas no formulário serão descartadas.",
              )
            ) {
              onReload();
            }
          }}
        >
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {days.map((day) => (
          <Button
            key={day.value}
            type="button"
            variant={selectedDay === day.value ? "default" : "outline"}
            aria-label={day.name}
            aria-pressed={selectedDay === day.value}
            disabled={disabled}
            className="h-12"
            onClick={() => {
              setSelectedDay(day.value);
              setMessage("");
            }}
          >
            {day.short}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Salve suas alterações antes de escolher outro dia.
      </p>

      <p role="status" className="text-sm text-primary">
        {isSaving ? "Salvando horários..." : message}
      </p>

      {mutationError && (
        <div className="hub-card space-y-2 p-4">
          <p role="alert" className="text-sm text-destructive">
            {mutationError}
          </p>
          <p className="text-sm text-muted-foreground">
            Clique em Atualizar para conferir os dados antes de tentar
            novamente.
          </p>
        </div>
      )}

      <HoursForm
        key={`${selectedDay}-${formVersion}`}
        dayOfWeek={selectedDay}
        availability={selectedAvailability}
        disabled={disabled}
        onSave={handleSave}
      />

      <section className="hub-card overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">Resumo semanal</h2>
        </div>

        <ul className="divide-y">
          {days.map((day) => {
            const availability = state.items.find(
              (item) => item.dayOfWeek === day.value,
            );

            return (
              <li
                key={day.value}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm"
              >
                <span className="font-medium">{day.name}</span>

                <span className="text-muted-foreground">
                  {!availability
                    ? "Não configurado"
                    : !availability.active
                      ? "Inativo"
                      : `${availability.startTime} – ${availability.endTime}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function AvailabilityPage({
  session,
  onLogout,
  onBack,
}: AvailabilityPageProps) {
  const [reload, setReload] = useState(0);

  return (
    <main className="hub-page space-y-6">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={onBack}
      >
        Voltar à agenda
      </Button>

      <div>
        <p className="hub-eyebrow">{session.business.name}</p>
        <h1 className="hub-heading mt-2">Funcionamento</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          Organize sua semana e defina quando seus clientes podem agendar.
        </p>
      </div>

      <AvailabilityContent
        key={reload}
        session={session}
        onLogout={onLogout}
        onReload={() => setReload((current) => current + 1)}
      />
    </main>
  );
}
