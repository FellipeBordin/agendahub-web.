export type PublicBusiness = {
  name: string;
  slug: string;
};

export async function getPublicBusiness(
  slug: string,
  signal: AbortSignal,
): Promise<PublicBusiness> {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new Error("O endereço da API não está configurado.");
  }

  const response = await fetch(
    `${apiUrl.trim().replace(/\/+$/, "")}/public/businesses/${encodeURIComponent(slug)}`,
    {
      signal,
      cache: "no-store",
    },
  );

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Este negócio não foi encontrado ou está indisponível.");
    }

    throw new Error("Não foi possível carregar o negócio. Tente novamente.");
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("name" in data) ||
    typeof data.name !== "string" ||
    !("slug" in data) ||
    data.slug !== slug
  ) {
    throw new Error("A API retornou dados inválidos do negócio.");
  }

  return {
    name: data.name,
    slug: data.slug,
  };
}
