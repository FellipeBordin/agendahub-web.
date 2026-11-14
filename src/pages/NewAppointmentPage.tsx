import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthSession } from "@/services/auth.service";
import { createAppointment } from "@/services/appointment.service";
import {
  getActiveServices,
  getAvailableSlots,
  type Service,
} from "@/services/service.service";

type NewAppointmentPageProps = {
  session: AuthSession;
  onBack: () => void;
  onCreated: (date: string) => void;
};

type ServicesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; services: Service[] };

type SlotsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; slots: string[] };

export type BookingDetails = {
  time: string;
  serviceName: string;
};

type BookingFormProps = {
  slug: string;
  date: string;
  service: Service;
  onCreated: (date: string, details: BookingDetails) => void;
  onBack?: () => void;
  onSavingChange?: (saving: boolean) => void;
  publicBooking?: boolean;
};

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

function getErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Não foi possível conectar à API. Confira sua conexão.";
  }

  return error instanceof Error
    ? error.message
    : "Não foi possível carregar os dados.";
}
export function BookingForm({
  slug,
  date,
  service,
  onCreated,
  onBack,
  onSavingChange,
  publicBooking = false,
}: BookingFormProps) {
  const [state, setState] = useState<SlotsState>({
    status: "loading",
  });
  const [slot, setSlot] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  const submitting = useRef(false);
  const mounted = useRef(false);

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

    async function loadSlots() {
      try {
        const slots = await getAvailableSlots(
          slug,
          date,
          service.id,
          controller.signal,
        );

        if (disposed) return;

        setState({ status: "success", slots });
      } catch (caught) {
        if (disposed) return;

        setState({
          status: "error",
          message: controller.signal.aborted
            ? "A consulta demorou demais. Selecione novamente o serviço ou a data."
            : getErrorMessage(caught),
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadSlots();

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [slug, date, service.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current || error) return;

    if (state.status !== "success" || !slot || !state.slots.includes(slot)) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const clientName = formData.get("clientName");
    const clientPhone = formData.get("clientPhone");

    if (
      typeof clientName !== "string" ||
      !clientName.trim() ||
      typeof clientPhone !== "string" ||
      !clientPhone.trim()
    ) {
      setValidationError("Informe o nome e o WhatsApp.");
      return;
    }

    setValidationError("");
    onSavingChange?.(true);

    try {
      await createAppointment(slug, {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        serviceId: service.id,
        startAt: `${date}T${slot}:00-03:00`,
      });
      if (mounted.current) {
        onCreated(date, {
          time: slot,
          serviceName: service.name,
        });
      }
    } catch (caught) {
      if (mounted.current) {
        setError(getErrorMessage(caught));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setIsSaving(false);
        onSavingChange?.(false);
      }
    }
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Buscando horários disponíveis...
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.message}
      </p>
    );
  }

  if (state.slots.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Não há horários disponíveis nesta data. Escolha outro dia.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}
      <fieldset disabled={isSaving || Boolean(error)} className="space-y-3">
        <legend className="mb-3 text-sm font-medium">Horário disponível</legend>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {state.slots.map((time) => (
            <Button
              key={time}
              type="button"
              variant={slot === time ? "default" : "outline"}
              aria-pressed={slot === time}
              className="h-11"
              onClick={() => setSlot(time)}
            >
              {time}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="client-name">
          {publicBooking ? "Seu nome" : "Nome do cliente"}
        </Label>

        <Input
          id="client-name"
          name="clientName"
          autoComplete="name"
          placeholder="Nome completo"
          required
          disabled={isSaving || Boolean(error)}
          className="h-12 text-base md:text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="client-phone">WhatsApp</Label>

        <Input
          id="client-phone"
          name="clientPhone"
          type="tel"
          autoComplete="tel"
          placeholder="11999999999"
          required
          disabled={isSaving || Boolean(error)}
          className="h-12 text-base md:text-base"
        />
      </div>

      {error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {error}
          </p>
          {onBack ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={onBack}
            >
              Voltar para conferir a agenda
            </Button>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Se houve falha de conexão ao confirmar, entre em contato com o
              estabelecimento antes de tentar novamente. A reserva pode ter sido
              registrada mesmo sem a confirmação aparecer aqui.
            </p>
          )}
        </div>
      ) : (
        <Button
          type="submit"
          disabled={!slot || isSaving}
          className="h-12 w-full"
        >
          {isSaving ? "Confirmando..." : "Confirmar agendamento"}
        </Button>
      )}

      <p role="status" className="text-sm text-muted-foreground">
        {isSaving
          ? "Aguarde a confirmação antes de sair desta tela."
          : "O horário será confirmado ao finalizar a reserva."}
      </p>
    </form>
  );
}

export function NewAppointmentPage({
  session,
  onBack,
  onCreated,
}: NewAppointmentPageProps) {
  const [state, setState] = useState<ServicesState>({
    status: "loading",
  });
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(getToday);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    async function loadServices() {
      try {
        const services = await getActiveServices(
          session.business.slug,
          controller.signal,
        );

        if (disposed) return;

        setState({ status: "success", services });
      } catch (caught) {
        if (disposed) return;

        setState({
          status: "error",
          message: controller.signal.aborted
            ? "A consulta demorou demais. Volte à agenda e tente novamente."
            : getErrorMessage(caught),
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadServices();

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [session.business.slug]);

  const selectedService =
    state.status === "success"
      ? state.services.find((service) => service.id === Number(serviceId))
      : undefined;

  return (
    <main className="hub-page">
      <div className="mx-auto max-w-xl space-y-6">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={onBack}
        >
          Voltar à agenda
        </Button>

        <div>
          <p className="text-sm text-muted-foreground">
            {session.business.name}
          </p>

          <h1 className="hub-heading mt-2">Novo agendamento</h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Escolha o serviço, a data e o horário do atendimento.
          </p>
        </div>

        <section className="space-y-6 rounded-2xl border bg-card p-5 sm:p-6">
          {state.status === "loading" && (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando serviços...
            </p>
          )}

          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}

          {state.status === "success" && state.services.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este negócio ainda não possui serviços ativos.
            </p>
          )}

          {state.status === "success" && state.services.length > 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="booking-service">Serviço</Label>

                <select
                  id="booking-service"
                  value={serviceId}
                  onChange={(event) => setServiceId(event.target.value)}
                  className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base"
                >
                  <option value="">Selecione um serviço</option>

                  {state.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} — {service.duration} min
                    </option>
                  ))}
                </select>

                {selectedService && (
                  <p className="text-sm text-muted-foreground">
                    Valor:{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(Number(selectedService.price))}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="booking-date">Data</Label>

                <Input
                  id="booking-date"
                  type="date"
                  min={getToday()}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-12 min-w-0 text-base md:text-base"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Horários no fuso de São Paulo.
              </p>

              {selectedService && date && (
                <BookingForm
                  key={`${selectedService.id}-${date}`}
                  slug={session.business.slug}
                  date={date}
                  service={selectedService}
                  onCreated={onCreated}
                  onBack={onBack}
                />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
