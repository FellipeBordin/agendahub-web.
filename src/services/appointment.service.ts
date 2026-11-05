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

// Converte também o formato retornado pelo PostgreSQL:
// 2026-11-04 13:00:00+00 → 2026-11-04T13:00:00Z
export function parseAppointmentDate(value: string): Date {
  const normalized = value
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/\+00$/, "Z")
    .replace(/([+-]\d{2})$/, "$1:00");

  return new Date(normalized);
}

function isAppointment(value: unknown): value is Appointment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "number" &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    typeof item.clientName === "string" &&
    typeof item.clientPhone === "string" &&
    typeof item.startAt === "string" &&
    Number.isFinite(parseAppointmentDate(item.startAt).getTime()) &&
    typeof item.endAt === "string" &&
    Number.isFinite(parseAppointmentDate(item.endAt).getTime()) &&
    (item.status === "SCHEDULED" ||
      item.status === "COMPLETED" ||
      item.status === "CANCELED")
  );
}

function getNextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

export async function getDailyAppointments(
  session: AuthSession,
  date: string,
  signal: AbortSignal,
): Promise<Appointment[]> {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  const params = new URLSearchParams({
    startDate: date,
    endDate: getNextDate(date),
  });

  const slug = encodeURIComponent(session.business.slug);

  const response = await fetch(
    `${apiUrl.replace(/\/+$/, "")}/appointments/${slug}?${params}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
      signal,
    },
  );

  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  if (response.status === 403) {
    throw new Error("Você não tem acesso à agenda deste negócio.");
  }

  if (!response.ok) {
    throw new Error("Não foi possível carregar os agendamentos.");
  }

  const data: unknown = await response.json();

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
