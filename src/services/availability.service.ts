import type { AuthSession } from "@/services/auth.service";
import { SessionExpiredError } from "@/services/appointment.service";

export type Availability = {
  id: number;
  businessId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
};

export type AvailabilityInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

function getApiUrl(): string {
  const value = import.meta.env.VITE_API_URL;

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  return value.trim().replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAvailability(value: unknown): value is Availability {
  if (!isRecord(value)) return false;

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

  return (
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.businessId === "number" &&
    Number.isSafeInteger(value.businessId) &&
    typeof value.dayOfWeek === "number" &&
    Number.isInteger(value.dayOfWeek) &&
    value.dayOfWeek >= 0 &&
    value.dayOfWeek <= 6 &&
    typeof value.startTime === "string" &&
    timeRegex.test(value.startTime) &&
    typeof value.endTime === "string" &&
    timeRegex.test(value.endTime) &&
    typeof value.active === "boolean"
  );
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      response.status < 500 && isRecord(data) && typeof data.error === "string"
        ? data.error
        : "Não foi possível realizar a operação.",
    );
  }

  return data;
}

export async function getAvailability(
  session: AuthSession,
  signal: AbortSignal,
): Promise<Availability[]> {
  const slug = encodeURIComponent(session.business.slug);

  const response = await fetch(`${getApiUrl()}/availability/${slug}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
    signal,
  });

  const data = await readResponse(response);

  if (
    !Array.isArray(data) ||
    !data.every(isAvailability) ||
    data.some((item) => item.businessId !== session.business.id)
  ) {
    throw new Error("A API retornou horários de funcionamento inválidos.");
  }

  return data;
}

export async function saveAvailability(
  session: AuthSession,
  input: AvailabilityInput,
  alreadyExists: boolean,
): Promise<Availability> {
  const slug = encodeURIComponent(session.business.slug);
  const url = `${getApiUrl()}/availability/${slug}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: alreadyExists ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      "Não foi possível confirmar a alteração. Atualize os horários para conferir se os dados foram salvos antes de tentar novamente.",
    );
  }

  const result = await readResponse(response);

  if (
    !isRecord(result) ||
    !isAvailability(result.data) ||
    result.data.businessId !== session.business.id ||
    result.data.dayOfWeek !== input.dayOfWeek
  ) {
    throw new Error(
      "A API retornou uma resposta inesperada. Atualize os horários para conferir os dados.",
    );
  }

  return result.data;
}
