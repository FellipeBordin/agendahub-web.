import type { AuthSession } from "@/services/auth.service";

export type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELED";

export type Appointment = {
  id: number;
  clientName: string;
  clientPhone: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
};

export class SessionExpiredError extends Error {
  constructor() {
    super("Sua sessão expirou. Entre novamente.");
    this.name = "SessionExpiredError";
  }
}

export function parseAppointmentDate(value: string): Date {
  const normalized = value
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/\+00$/, "Z")
    .replace(/([+-]\d{2})$/, "$1:00");

  return new Date(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppointment(value: unknown): value is Appointment {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.clientName === "string" &&
    typeof value.clientPhone === "string" &&
    typeof value.startAt === "string" &&
    Number.isFinite(parseAppointmentDate(value.startAt).getTime()) &&
    typeof value.endAt === "string" &&
    Number.isFinite(parseAppointmentDate(value.endAt).getTime()) &&
    (value.status === "SCHEDULED" ||
      value.status === "COMPLETED" ||
      value.status === "CANCELED")
  );
}

function getApiUrl(): string {
  const value = import.meta.env.VITE_API_URL;

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  return value.trim().replace(/\/+$/, "");
}

function getNextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  if (response.status >= 500) {
    throw new Error(
      "O servidor está indisponível. Tente novamente mais tarde.",
    );
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : "Não foi possível realizar a operação.";

    throw new Error(message);
  }

  return data;
}

export async function getDailyAppointments(
  session: AuthSession,
  date: string,
  signal: AbortSignal,
): Promise<Appointment[]> {
  const params = new URLSearchParams({
    startDate: date,
    endDate: getNextDate(date),
  });

  const slug = encodeURIComponent(session.business.slug);

  const response = await fetch(
    `${getApiUrl()}/appointments/${slug}?${params}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
      signal,
    },
  );

  const data = await readResponse(response);

  if (!Array.isArray(data) || !data.every(isAppointment)) {
    throw new Error("A API retornou uma lista de agendamentos inválida.");
  }

  return data.sort((a, b) => {
    const difference =
      parseAppointmentDate(a.startAt).getTime() -
      parseAppointmentDate(b.startAt).getTime();

    return difference || a.id - b.id;
  });
}

export async function updateAppointmentStatus(
  session: AuthSession,
  appointmentId: number,
  status: AppointmentStatus,
): Promise<Appointment> {
  const slug = encodeURIComponent(session.business.slug);

  let response: Response;

  try {
    response = await fetch(
      `${getApiUrl()}/appointments/${slug}/${appointmentId}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    // Uma falha de conexão não garante que o servidor deixou de salvar.
    throw new Error(
      "Não foi possível confirmar a alteração. Atualize a agenda para conferir o status antes de tentar novamente.",
    );
  }

  const data = await readResponse(response);

  if (!isAppointment(data) || data.id !== appointmentId) {
    throw new Error(
      "A API retornou uma resposta inesperada. Atualize a agenda para conferir o status.",
    );
  }

  return data;
}

export type CreateAppointmentInput = {
  clientName: string;
  clientPhone: string;
  startAt: string;
  serviceId: number;
};

export async function createAppointment(
  slug: string,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  let response: Response;

  try {
    response = await fetch(
      `${getApiUrl()}/appointments/${encodeURIComponent(slug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error(
      "Não foi possível confirmar a reserva. Confira a agenda antes de tentar novamente: o servidor pode ter recebido o pedido.",
    );
  }

  const data = await readResponse(response);

  if (!isAppointment(data)) {
    throw new Error(
      "A API retornou uma resposta inesperada. Confira a agenda antes de repetir a reserva.",
    );
  }

  return data;
}
