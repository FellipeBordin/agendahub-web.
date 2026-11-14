import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingForm, type BookingDetails } from "@/pages/NewAppointmentPage";
import {
  getPublicBusiness,
  type PublicBusiness,
} from "@/services/publicBusiness.service";
import { getActiveServices, type Service } from "@/services/service.service";

type Props = {
  slug: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      business: PublicBusiness;
      services: Service[];
    };

type Confirmation = BookingDetails & {
  date: string;
};

const priceFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "long",
  year: "numeric",
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

function BookingContent({ slug }: Props) {
  const [state, setState] = useState<LoadState>({
    status: "loading",
  });

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(getToday);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 15_000);

    async function load() {
      try {
        const [business, services] = await Promise.all([
          getPublicBusiness(slug, controller.signal),
          getActiveServices(slug, controller.signal),
        ]);

        if (disposed) return;

        setState({
          status: "success",
          business,
          services,
        });
      } catch (error) {
        if (disposed) return;

        setState({
          status: "error",
          message: controller.signal.aborted
            ? "A consulta demorou demais. Tente novamente."
            : error instanceof TypeError
              ? "Não foi possível conectar. Confira sua internet."
              : error instanceof Error
                ? error.message
                : "Não foi possível carregar o agendamento.",
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
  }, [slug]);

  // Evita sair acidentalmente enquanto a reserva está sendo enviada.
  useEffect(() => {
    if (!isSaving) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSaving]);

  if (state.status === "loading") {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Preparando seu agendamento...
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <section className="hub-card space-y-4 p-6">
        <h1 className="text-xl font-semibold">
          Não foi possível abrir a agenda
        </h1>

        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>

        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </Button>
      </section>
    );
  }

  if (confirmation) {
    return (
      <section className="hub-card space-y-6 p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-secondary text-2xl text-primary"
        >
          ✓
        </div>

        <div role="status">
          <p className="hub-eyebrow">{state.business.name}</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Seu horário está reservado!
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Confira os detalhes e guarde esta confirmação.
          </p>
        </div>

        <dl className="space-y-4 rounded-xl bg-secondary/50 p-5">
          <div>
            <dt className="text-xs text-muted-foreground">Serviço</dt>
            <dd className="mt-1 break-words font-medium">
              {confirmation.serviceName}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">Data</dt>
            <dd className="mt-1 font-medium">
              {dateFormatter.format(new Date(`${confirmation.date}T12:00:00Z`))}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">Horário</dt>
            <dd className="mt-1 font-medium">
              {confirmation.time} — fuso de São Paulo
            </dd>
          </div>
        </dl>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Para cancelar ou alterar seu horário, entre em contato diretamente com
          o estabelecimento.
        </p>
      </section>
    );
  }

  const selectedService = state.services.find(
    (service) => service.id === Number(serviceId),
  );

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= getToday();

  return (
    <div className="space-y-6">
      <div>
        <p className="hub-eyebrow">{state.business.name}</p>

        <h1 className="hub-heading mt-3">Reserve seu momento.</h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Escolha seu serviço e o melhor horário. Para reservar, precisamos
          apenas do seu nome e WhatsApp.
        </p>
      </div>

      <fieldset disabled={isSaving} className="min-w-0 space-y-4">
        <legend className="text-base font-semibold">Escolha seu serviço</legend>

        <p className="text-sm text-muted-foreground">
          Toque em uma opção para consultar os horários.
        </p>

        <div className="grid gap-3">
          {state.services.map((service) => {
            const selected = serviceId === String(service.id);
            const inputId = `public-service-${service.id}`;

            return (
              <div key={service.id} className="relative min-w-0">
                <input
                  id={inputId}
                  type="radio"
                  name="public-service"
                  value={service.id}
                  checked={selected}
                  onChange={(event) => setServiceId(event.target.value)}
                  className="peer sr-only"
                />

                <label
                  htmlFor={inputId}
                  className={`block cursor-pointer rounded-2xl border p-4 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60 sm:p-5 ${
                    selected
                      ? "border-primary bg-secondary/60 ring-1 ring-primary"
                      : "border-border bg-background hover:border-primary/40 hover:bg-secondary/25"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card"
                      }`}
                    >
                      {selected && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-4"
                        >
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-base font-semibold leading-snug">
                        {service.name}
                      </span>

                      <span className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.7}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        {service.duration} minutos
                      </span>
                    </span>
                  </span>

                  <span className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className="text-lg font-semibold tracking-tight text-primary tabular-nums">
                      {priceFormatter.format(Number(service.price))}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {selected ? "Selecionado" : "Selecionar"}
                    </span>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      {state.services.length === 0 ? (
        <div className="hub-card p-6 text-center">
          <p className="font-medium">Nenhum serviço disponível no momento.</p>

          <p className="mt-2 text-sm text-muted-foreground">
            Entre em contato com o estabelecimento para mais informações.
          </p>
        </div>
      ) : (
        <section
          aria-labelledby="booking-date-title"
          className="hub-card space-y-6 p-5 sm:p-7"
        >
          <div>
            <p className="hub-eyebrow">Próximo passo</p>

            <h2
              id="booking-date-title"
              className="mt-2 text-xl font-semibold tracking-tight"
            >
              Escolha seu melhor horário
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Selecione a data para consultar os horários disponíveis.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="public-date">Data do atendimento</Label>

            <Input
              id="public-date"
              type="date"
              min={getToday()}
              value={date}
              disabled={isSaving}
              onChange={(event) => setDate(event.target.value)}
              className="h-12 w-full min-w-0 rounded-xl text-base md:text-base"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Horários no fuso de São Paulo.
          </p>

          {selectedService && validDate ? (
            <BookingForm
              key={`${slug}-${selectedService.id}-${date}`}
              slug={slug}
              date={date}
              service={selectedService}
              publicBooking
              onSavingChange={setIsSaving}
              onCreated={(createdDate, details) => {
                setIsSaving(false);

                setConfirmation({
                  date: createdDate,
                  ...details,
                });

                window.scrollTo({ top: 0 });
              }}
            />
          ) : (
            <p
              role="status"
              className="rounded-xl bg-secondary/50 p-4 text-sm leading-relaxed text-muted-foreground"
            >
              Selecione um serviço e uma data válida para consultar os horários.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export function PublicBookingPage({ slug }: Props) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-5">
          <p className="text-xl font-semibold tracking-tight">
            Agenda<span className="text-primary">Hub</span>
          </p>

          <span className="text-xs text-muted-foreground">
            Agendamento online
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <BookingContent key={slug} slug={slug} />
      </main>

      <footer className="px-5 pb-8 text-center text-xs text-muted-foreground">
        AgendaHub — Seu tempo, organizado.
      </footer>
    </div>
  );
}
