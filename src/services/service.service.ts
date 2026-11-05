export type Service = {
  id: number;
  name: string;
  price: string;
  duration: number;
  active: boolean;
};

function getApiUrl(): string {
  const value = import.meta.env.VITE_API_URL;

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  return value.trim().replace(/\/+$/, "");
}

async function readResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      response.status < 500 &&
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Não foi possível consultar a API.";

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
    Number.isFinite(Number(item.price)) &&
    typeof item.duration === "number" &&
    Number.isSafeInteger(item.duration) &&
    item.duration > 0 &&
    typeof item.active === "boolean"
  );
}

export async function getActiveServices(
  slug: string,
  signal: AbortSignal,
): Promise<Service[]> {
  const response = await fetch(
    `${getApiUrl()}/services/${encodeURIComponent(slug)}`,
    { signal, cache: "no-store" },
  );

  const data = await readResponse(response);

  if (!Array.isArray(data) || !data.every(isService)) {
    throw new Error("A API retornou uma lista de serviços inválida.");
  }

  return data.filter((service) => service.active);
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
