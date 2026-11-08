import type { AuthSession } from "@/services/auth.service";
import {
  parseAppointmentDate,
  SessionExpiredError,
} from "@/services/appointment.service";

export type AppNotification = {
  id: number;
  businessId: number;
  appointmentId: number;
  clientName: string;
  serviceName: string;
  startAt: string;
  createdAt: string;
  readAt: string | null;
};

type NotificationResult = {
  notifications: AppNotification[];
  unreadCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(parseAppointmentDate(value).getTime())
  );
}

function isNotification(value: unknown): value is AppNotification {
  if (!isRecord(value)) return false;

  return (
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.businessId) &&
    isPositiveInteger(value.appointmentId) &&
    typeof value.clientName === "string" &&
    typeof value.serviceName === "string" &&
    isDateString(value.startAt) &&
    isDateString(value.createdAt) &&
    (value.readAt === null || isDateString(value.readAt))
  );
}

function getUrl(session: AuthSession): string {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  return `${apiUrl.replace(/\/+$/, "")}/notifications/${encodeURIComponent(
    session.business.slug,
  )}`;
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 401) {
    throw new SessionExpiredError();
  }

  if (response.status >= 500) {
    throw new Error("O servidor está indisponível. Tente novamente.");
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : "Não foi possível acessar as notificações.",
    );
  }

  return data;
}

export async function getNotifications(
  session: AuthSession,
  signal: AbortSignal,
): Promise<NotificationResult> {
  const response = await fetch(getUrl(session), {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
    signal,
  });

  const data = await readResponse(response);

  if (
    !isRecord(data) ||
    !Array.isArray(data.notifications) ||
    !data.notifications.every(isNotification) ||
    !data.notifications.every(
      (notification) => notification.businessId === session.business.id,
    ) ||
    typeof data.unreadCount !== "number" ||
    !Number.isSafeInteger(data.unreadCount) ||
    data.unreadCount < 0
  ) {
    throw new Error("A API retornou notificações inválidas.");
  }

  return {
    notifications: data.notifications,
    unreadCount: data.unreadCount,
  };
}

export async function markNotificationAsRead(
  session: AuthSession,
  id: number,
): Promise<AppNotification> {
  const response = await fetch(`${getUrl(session)}/${id}/read`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    signal: AbortSignal.timeout(15_000),
  });

  const data = await readResponse(response);

  if (
    !isNotification(data) ||
    data.id !== id ||
    data.businessId !== session.business.id ||
    data.readAt === null
  ) {
    throw new Error("A API retornou uma notificação inválida.");
  }

  return data;
}
