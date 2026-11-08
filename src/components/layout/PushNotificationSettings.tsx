import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AuthSession } from "@/services/auth.service";
import { SessionExpiredError } from "@/services/appointment.service";
import {
  activatePush,
  deactivatePush,
  preparePush,
  type PushSetup,
} from "@/services/push.service";

type Props = {
  session: AuthSession;
  onLogout: () => void;
};

export function PushNotificationSettings({ session, onLogout }: Props) {
  const [setup, setSetup] = useState<PushSetup | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

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

    async function prepare() {
      try {
        const result = await preparePush(session);

        if (disposed) return;

        setSetup(result);
        setError("");
      } catch (cause) {
        if (disposed) return;

        if (cause instanceof SessionExpiredError) {
          onLogout();
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível preparar as notificações.",
        );
      } finally {
        if (!disposed) setPreparing(false);
      }
    }

    void prepare();

    return () => {
      disposed = true;
    };
  }, [session, onLogout, retry]);

  async function handleChange(enable: boolean) {
    if (submitting.current || (enable && !setup)) return;

    submitting.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (enable && setup) {
        await activatePush(session, setup);

        if (!mounted.current) return;

        setActive(true);
        setMessage("Aparelho cadastrado para receber notificações.");
      } else {
        const result = await deactivatePush(session);

        if (!mounted.current) return;

        setActive(false);
        setMessage(result);
      }
    } catch (cause) {
      if (!mounted.current) return;

      setActive(false);

      if (cause instanceof SessionExpiredError) {
        onLogout();
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar as notificações.",
      );
    } finally {
      submitting.current = false;

      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="push-settings-title"
      aria-busy={busy || preparing}
      className="hub-card p-5"
    >
      <h2 id="push-settings-title" className="font-semibold">
        Avisos neste aparelho
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Receba um aviso quando houver uma nova reserva, mesmo sem a agenda
        aberta.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="min-h-11"
          disabled={preparing || busy || !setup || active}
          onClick={() => void handleChange(true)}
        >
          {preparing
            ? "Preparando..."
            : busy
              ? "Aguarde..."
              : active
                ? "Aparelho cadastrado"
                : "Ativar notificações"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy || preparing}
          onClick={() => void handleChange(false)}
        >
          Desativar neste aparelho
        </Button>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {error && (
        <div className="mt-3 space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>

          {!setup && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={preparing}
              onClick={() => {
                setPreparing(true);
                setError("");
                setRetry((current) => current + 1);
              }}
            >
              Tentar novamente
            </Button>
          )}
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        No iPhone, adicione o AgendaHub à tela inicial e abra pelo ícone antes
        de ativar. Ao sair da conta, os avisos deste aparelho serão desativados.
      </p>
    </section>
  );
}
