import type { AuthSession } from "@/services/auth.service";
import { SessionExpiredError } from "@/services/appointment.service";

export type PushSetup = {
  registration: ServiceWorkerRegistration;
  publicKey: string;
};

let activationVersion = 0;

function getUrl(session: AuthSession): string {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  return `${apiUrl.replace(/\/+$/, "")}/push/${encodeURIComponent(
    session.business.slug,
  )}`;
}

async function request(
  session: AuthSession,
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${getUrl(session)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  if (response.status >= 500) {
    throw new Error("O servidor está indisponível. Tente novamente.");
  }

  if (response.status === 204) return null;

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Não foi possível configurar as notificações.";

    throw new Error(message);
  }

  return data;
}

function convertPublicKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );

  const decoded = atob(padded);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return buffer;
}

function waitForWorker(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();

  const worker = registration.installing ?? registration.waiting;

  if (!worker) {
    return Promise.reject(
      new Error("Não foi possível preparar os avisos neste navegador."),
    );
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("A preparação demorou demais. Tente novamente."));
    }, 15_000);

    function cleanup() {
      window.clearTimeout(timeout);
      worker!.removeEventListener("statechange", checkState);
    }

    function checkState() {
      if (worker!.state === "activated") {
        cleanup();
        resolve();
      } else if (worker!.state === "redundant") {
        cleanup();
        reject(new Error("Não foi possível ativar o serviço de avisos."));
      }
    }

    worker.addEventListener("statechange", checkState);
    checkState();
  });
}

export async function preparePush(session: AuthSession): Promise<PushSetup> {
  if (!window.isSecureContext) {
    throw new Error(
      "Abra o AgendaHub por HTTPS. No computador, localhost também funciona.",
    );
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    throw new Error(
      "Este navegador não oferece Web Push neste modo. No iPhone, adicione o AgendaHub à tela inicial e abra pelo ícone.",
    );
  }

  const data = await request(session, "/public-key", "GET");

  if (
    typeof data !== "object" ||
    data === null ||
    !("publicKey" in data) ||
    typeof data.publicKey !== "string" ||
    data.publicKey.length === 0
  ) {
    throw new Error("A API retornou uma chave pública inválida.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  await waitForWorker(registration);

  return {
    registration,
    publicKey: data.publicKey,
  };
}

export async function activatePush(
  session: AuthSession,
  setup: PushSetup,
): Promise<void> {
  const currentVersion = ++activationVersion;

  // Deve ser chamada diretamente a partir do clique no botão.
  const permission = await Notification.requestPermission();

  if (currentVersion !== activationVersion) {
    throw new Error("Ativação cancelada.");
  }

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notificações bloqueadas. Libere a permissão nas configurações do navegador ou do aparelho."
        : "A permissão não foi concedida. Toque em ativar para tentar novamente.",
    );
  }

  let subscription: PushSubscription | null = null;

  try {
    subscription = await setup.registration.pushManager.getSubscription();

    if (currentVersion !== activationVersion) {
      throw new Error("Ativação cancelada.");
    }

    if (!subscription) {
      subscription = await setup.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertPublicKey(setup.publicKey),
      });
    }

    if (currentVersion !== activationVersion) {
      throw new Error("Ativação cancelada.");
    }

    await request(session, "/subscriptions", "POST", subscription.toJSON());

    if (currentVersion !== activationVersion) {
      throw new Error("Ativação cancelada.");
    }
  } catch (error) {
    // Se o cadastro falhar ou houver logout, cancela a inscrição local.
    if (subscription) {
      await subscription.unsubscribe().catch(() => false);
    }

    throw error;
  }
}

export async function deactivatePush(session: AuthSession): Promise<string> {
  // Invalida uma ativação que ainda esteja aguardando permissão/resposta.
  activationVersion += 1;

  if (!("serviceWorker" in navigator)) {
    return "Notificações desativadas neste aparelho.";
  }

  const registration = await navigator.serviceWorker.getRegistration("/");

  if (!registration) {
    return "Notificações desativadas neste aparelho.";
  }

  const visibleNotifications = await registration.getNotifications();

  visibleNotifications.forEach((notification) => notification.close());

  if (!("pushManager" in registration)) {
    return "Notificações desativadas neste aparelho.";
  }

  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return "Notificações desativadas neste aparelho.";
  }

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  const remaining = await registration.pushManager.getSubscription();

  if (remaining) {
    throw new Error(
      "Não foi possível cancelar os avisos neste navegador. Bloqueie a permissão de notificações nas configurações do aparelho.",
    );
  }

  try {
    await request(session, "/subscriptions", "DELETE", { endpoint });
  } catch {
    return "Avisos desativados neste aparelho. A limpeza do cadastro no servidor ficou pendente.";
  }

  return "Notificações desativadas neste aparelho.";
}
