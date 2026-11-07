import type { AuthSession } from "@/services/auth.service";
import { SessionExpiredError } from "@/services/appointment.service";

export type Service = {
  id: number;
  name: string;
  price: string;
  duration: number;
  active: boolean;
};

export type ServiceInput = {
  name: string;
  price: string;
  duration: number;
};

function getApiUrl(): string {
  const value = import.meta.env.VITE_API_URL;

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  return value.trim().replace(/\/+$/, "");
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      response.status < 500 &&
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Não foi possível realizar a operação.";

    throw new Error(message);
  }

  return data;
}

function isService(value: unknown): value is Service {
  if (typeof value !== "object" || value === null) return false;

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "number" &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    typeof item.name === "string" &&
    typeof item.price === "string" &&
    item.price.trim() !== "" &&
    Number.isFinite(Number(item.price)) &&
    Number(item.price) > 0 &&
    typeof item.duration === "number" &&
    Number.isSafeInteger(item.duration) &&
    item.duration > 0 &&
    typeof item.active === "boolean"
  );
}

function readServices(data: unknown): Service[] {
  if (!Array.isArray(data) || !data.every(isService)) {
    throw new Error("A API retornou uma lista de serviços inválida.");
  }

  return data.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getActiveServices(
  slug: string,
  signal: AbortSignal,
): Promise<Service[]> {
  const response = await fetch(
    `${getApiUrl()}/services/${encodeURIComponent(slug)}`,
    { signal, cache: "no-store" },
  );

  return readServices(await readResponse(response)).filter(
    (service) => service.active,
  );
}

export async function getAdminServices(
  session: AuthSession,
  signal: AbortSignal,
): Promise<Service[]> {
  const slug = encodeURIComponent(session.business.slug);

  const response = await fetch(`${getApiUrl()}/services/${slug}/admin`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    signal,
    cache: "no-store",
  });

  return readServices(await readResponse(response));
}

async function mutateService(
  session: AuthSession,
  path: string,
  method: "POST" | "PUT" | "PATCH",
  body: ServiceInput | { active: boolean },
): Promise<Service> {
  const slug = encodeURIComponent(session.business.slug);
  const url = `${getApiUrl()}/services/${slug}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      "Não foi possível confirmar a alteração. Atualize a lista antes de tentar novamente: o servidor pode ter salvado os dados.",
    );
  }

  const data = await readResponse(response);

  if (!isService(data)) {
    throw new Error(
      "A API retornou uma resposta inesperada. Atualize a lista para conferir os dados.",
    );
  }

  return data;
}

export function createService(
  session: AuthSession,
  input: ServiceInput,
): Promise<Service> {
  return mutateService(session, "", "POST", input);
}

export function updateService(
  session: AuthSession,
  id: number,
  input: ServiceInput,
): Promise<Service> {
  return mutateService(session, `/${id}`, "PUT", input);
}

export function updateServiceStatus(
  session: AuthSession,
  id: number,
  active: boolean,
): Promise<Service> {
  return mutateService(session, `/${id}/status`, "PATCH", { active });
}

export async function getAvailableSlots(
  slug: string,
  date: string,
  serviceId: number,
  signal: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams({
    date,
    serviceId: String(serviceId),
  });

  const response = await fetch(
    `${getApiUrl()}/availability/${encodeURIComponent(slug)}/slots?${params}`,
    { signal, cache: "no-store" },
  );

  const data = await readResponse(response);

  if (
    typeof data !== "object" ||
    data === null ||
    !("slots" in data) ||
    !Array.isArray(data.slots) ||
    !data.slots.every(
      (slot: unknown) =>
        typeof slot === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot),
    )
  ) {
    throw new Error("A API retornou horários inválidos.");
  }

  return data.slots;
}

export async function deleteService(
  session: AuthSession,
  id: number,
): Promise<void> {
  const slug = encodeURIComponent(session.business.slug);
  const url = `${getApiUrl()}/services/${slug}/${id}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      "Não foi possível confirmar a exclusão. Atualize a lista antes de tentar novamente.",
    );
  }

  const data = await readResponse(response);

  if (
    typeof data !== "object" ||
    data === null ||
    !("id" in data) ||
    data.id !== id
  ) {
    throw new Error(
      "A API retornou uma resposta inesperada. Atualize a lista para conferir se o serviço foi excluído.",
    );
  }
}
