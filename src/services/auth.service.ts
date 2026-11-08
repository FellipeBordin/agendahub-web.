export type AuthSession = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: number;
    name: string;
    email: string;
    businessId: number;
  };
  business: {
    id: number;
    name: string;
    slug: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;

  const { user, business } = value;

  return (
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    typeof value.expiresIn === "number" &&
    Number.isFinite(value.expiresIn) &&
    value.expiresIn > 0 &&
    isRecord(user) &&
    typeof user.id === "number" &&
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    typeof user.businessId === "number" &&
    isRecord(business) &&
    typeof business.id === "number" &&
    typeof business.name === "string" &&
    typeof business.slug === "string" &&
    user.businessId === business.id
  );
}

export async function login(
  email: string,
  password: string,
): Promise<AuthSession> {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  let response: Response;

  try {
    response = await fetch(`${apiUrl.replace(/\/+$/, "")}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar à API. Confira sua conexão e tente novamente.",
    );
  }

  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After"));

    const message =
      Number.isFinite(seconds) && seconds > 0
        ? `Muitas tentativas. Tente novamente em aproximadamente ${Math.ceil(seconds / 60)} minuto(s).`
        : "Muitas tentativas. Aguarde antes de tentar novamente.";

    throw new Error(message);
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
        : "Não foi possível entrar. Confira seus dados.";

    throw new Error(message);
  }

  if (!isAuthSession(data)) {
    throw new Error("A API retornou uma resposta de login inválida.");
  }

  return data;
}
