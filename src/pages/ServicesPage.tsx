import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthSession } from "@/services/auth.service";
import { SessionExpiredError } from "@/services/appointment.service";
import {
  createService,
  deleteService,
  getAdminServices,
  updateService,
  updateServiceStatus,
  type Service,
  type ServiceInput,
} from "@/services/service.service";

type ServicesPageProps = {
  session: AuthSession;
  onLogout: () => void;
  onBack: () => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; services: Service[] };

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; service: Service };

type ServiceFormProps = {
  service?: Service;
  busy: boolean;
  onSave: (input: ServiceInput) => Promise<void>;
  onCancel: () => void;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function errorMessage(error: unknown): string {
  return error instanceof TypeError
    ? "Não foi possível conectar à API."
    : error instanceof Error
      ? error.message
      : "Não foi possível realizar a operação.";
}

function ServiceForm({ service, busy, onSave, onCancel }: ServiceFormProps) {
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const price = String(data.get("price") ?? "")
      .trim()
      .replace(",", ".");
    const durationText = String(data.get("duration") ?? "").trim();
    const duration = Number(durationText);

    if (!name) {
      setError("Informe o nome do serviço.");
      return;
    }

    if (
      !/^\d+(?:\.\d{1,2})?$/.test(price) ||
      !Number.isFinite(Number(price)) ||
      Number(price) <= 0
    ) {
      setError("Informe um preço maior que zero, com até duas casas decimais.");
      return;
    }

    if (
      !/^\d+$/.test(durationText) ||
      !Number.isSafeInteger(duration) ||
      duration <= 0
    ) {
      setError(
        "A duração deve ser um número inteiro de minutos maior que zero.",
      );
      return;
    }

    setError("");
    await onSave({ name, price, duration });
  }

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="mb-5 text-xl font-semibold">
        {service ? "Editar serviço" : "Novo serviço"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={busy} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="service-name">Nome do serviço</Label>
            <Input
              id="service-name"
              name="name"
              defaultValue={service?.name ?? ""}
              placeholder="Ex.: Design de sobrancelhas"
              required
              className="h-12 text-base md:text-base"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-price">Preço (R$)</Label>
              <Input
                id="service-price"
                name="price"
                type="text"
                inputMode="decimal"
                defaultValue={service?.price.replace(".", ",") ?? ""}
                placeholder="60,00"
                required
                className="h-12 text-base md:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-duration">Duração em minutos</Label>
              <Input
                id="service-duration"
                name="duration"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                defaultValue={service?.duration ?? ""}
                placeholder="40"
                required
                className="h-12 text-base md:text-base"
              />
            </div>
          </div>

          {service && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Alterar a duração não muda os horários dos agendamentos já
              existentes.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="h-12">
              {busy ? "Salvando..." : "Salvar serviço"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={onCancel}
            >
              Cancelar edição
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function ServicesContent({
  session,
  onLogout,
  onReload,
}: {
  session: AuthSession;
  onLogout: () => void;
  onReload: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [message, setMessage] = useState("");

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

    async function loadServices() {
      try {
        const services = await getAdminServices(session, controller.signal);

        if (disposed) return;

        setState({ status: "success", services });
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
            : errorMessage(error),
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
  }, [session, onLogout]);

  function applyService(saved: Service) {
    setState((current) => {
      if (current.status !== "success") return current;

      const services = current.services.filter(
        (service) => service.id !== saved.id,
      );

      services.push(saved);
      services.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

      return { status: "success", services };
    });
  }

  async function runMutation(
    action: () => Promise<Service>,
    successMessage: string,
  ) {
    if (submitting.current || mutationError) return;

    submitting.current = true;
    setBusy(true);
    setMessage("");

    try {
      const saved = await action();

      if (!mounted.current) return;

      applyService(saved);
      setEditor({ mode: "closed" });
      setMessage(successMessage);
      onReload();
    } catch (error) {
      if (!mounted.current) return;

      if (error instanceof SessionExpiredError) {
        onLogout();
        return;
      }

      setMutationError(errorMessage(error));
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function handleSave(input: ServiceInput) {
    if (editor.mode === "closed") return;

    const editing = editor.mode === "edit" ? editor.service : undefined;

    await runMutation(
      () =>
        editing
          ? updateService(session, editing.id, input)
          : createService(session, input),
      editing ? "Serviço atualizado." : "Serviço cadastrado.",
    );
  }

  async function handleToggle(service: Service) {
    if (submitting.current || mutationError) return;

    if (
      service.active &&
      !window.confirm(
        `Desativar "${service.name}"? Novas reservas serão impedidas, mas os agendamentos existentes serão mantidos.`,
      )
    ) {
      return;
    }

    await runMutation(
      () => updateServiceStatus(session, service.id, !service.active),
      service.active ? "Serviço desativado." : "Serviço ativado.",
    );
  }
  async function handleDelete(service: Service) {
    if (submitting.current || mutationError) return;

    const confirmed = window.confirm(
      `Excluir permanentemente o serviço "${service.name}"? Essa ação não pode ser desfeita. Serviços com agendamentos vinculados não serão excluídos.`,
    );

    if (!confirmed) return;

    submitting.current = true;
    setBusy(true);
    setMessage("");

    try {
      await deleteService(session, service.id);

      if (!mounted.current) return;

      setState((current) => {
        if (current.status !== "success") return current;

        return {
          status: "success",
          services: current.services.filter((item) => item.id !== service.id),
        };
      });

      setMessage(`Serviço "${service.name}" excluído.`);
      onReload();
    } catch (error) {
      if (!mounted.current) return;

      if (error instanceof SessionExpiredError) {
        onLogout();
        return;
      }

      setMutationError(errorMessage(error));
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="py-8 text-muted-foreground">
        Carregando serviços...
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
        <Button type="button" variant="outline" onClick={onReload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const disabled = busy || Boolean(mutationError);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="h-12"
          disabled={disabled || editor.mode !== "closed"}
          onClick={() => {
            setMessage("");
            setEditor({ mode: "create" });
          }}
        >
          Novo serviço
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={busy || (editor.mode !== "closed" && !mutationError)}
          onClick={onReload}
        >
          Atualizar lista
        </Button>
      </div>

      <p role="status" className="text-sm text-muted-foreground">
        {busy ? "Salvando alteração..." : message}
      </p>

      {mutationError && (
        <div className="space-y-2 rounded-xl border p-4">
          <p role="alert" className="text-sm text-destructive">
            {mutationError}
          </p>
          <p className="text-sm text-muted-foreground">
            Clique em Atualizar lista para conferir os dados antes de repetir a
            operação. Isso fechará o formulário aberto.
          </p>
        </div>
      )}

      {editor.mode !== "closed" && (
        <ServiceForm
          key={editor.mode === "edit" ? editor.service.id : "create"}
          service={editor.mode === "edit" ? editor.service : undefined}
          busy={disabled}
          onSave={handleSave}
          onCancel={() => setEditor({ mode: "closed" })}
        />
      )}

      {state.services.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">Nenhum serviço cadastrado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre o primeiro serviço para começar a receber agendamentos.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {state.services.map((service) => (
            <li key={service.id}>
              <article className="h-full rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-lg font-semibold">
                    {service.name}
                  </h2>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      service.active
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {service.active ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <p className="mt-4 text-xl font-semibold">
                  {currencyFormatter.format(Number(service.price))}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Duração: {service.duration} minutos
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={disabled || editor.mode !== "closed"}
                    onClick={() => {
                      setMessage("");
                      setEditor({ mode: "edit", service });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Editar
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={disabled || editor.mode !== "closed"}
                    onClick={() => void handleToggle(service)}
                  >
                    {service.active ? "Desativar" : "Ativar"}
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    className="col-span-2 min-h-11"
                    disabled={disabled || editor.mode !== "closed"}
                    onClick={() => void handleDelete(service)}
                  >
                    Excluir serviço
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ServicesPage({ session, onLogout, onBack }: ServicesPageProps) {
  const [reload, setReload] = useState(0);

  return (
    <main className="hub-page space-y-6">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-xl"
        onClick={onBack}
      >
        Voltar à agenda
      </Button>

      <div>
        <p className="hub-eyebrow">{session.business.name}</p>

        <h1 className="hub-heading mt-2">Serviços</h1>

        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          Gerencie os preços, a duração e a disponibilidade dos serviços.
        </p>
      </div>

      <ServicesContent
        key={reload}
        session={session}
        onLogout={onLogout}
        onReload={() => setReload((current) => current + 1)}
      />
    </main>
  );
}
