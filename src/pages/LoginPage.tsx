import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRef } from "react";
import { login, type AuthSession } from "@/services/auth.service";

type LoginPageProps = {
  onLogin: (session: AuthSession) => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    const email = formData.get("email");
    const password = formData.get("password");

    if (typeof email !== "string" || typeof password !== "string") {
      setMessage("Preencha o e-mail e a senha.");
      return;
    }

    submitting.current = true;
    setIsLoading(true);
    setMessage("");

    try {
      const session = await login(email, password);
      form.reset();
      onLogin(session);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  // Mantenha o return com o layout abaixo.

  return (
    <main className="min-h-svh bg-background text-foreground lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex xl:p-16">
        <span className="text-2xl font-semibold tracking-tight">AgendaHub</span>

        <div className="max-w-lg space-y-6">
          <p className="text-sm font-medium uppercase tracking-widest opacity-70">
            Mais organização no seu dia
          </p>

          <h1 className="text-5xl leading-tight font-semibold tracking-tight">
            Sua agenda organizada.
            <br />
            Mais tempo para atender.
          </h1>

          <p className="max-w-md text-lg leading-relaxed opacity-75">
            Gerencie horários, serviços e agendamentos do seu negócio em um só
            lugar.
          </p>
        </div>

        <p className="text-sm opacity-65">
          Feito para acompanhar a rotina do seu negócio.
        </p>
      </aside>

      <section
        aria-labelledby="login-title"
        className="flex min-h-svh flex-col px-6 py-8 sm:px-10 lg:px-16"
      >
        <header className="lg:hidden">
          <span className="text-xl font-semibold tracking-tight">
            AgendaHub
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Área do administrador
              </p>

              <h2
                id="login-title"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Boas-vindas!
              </h2>

              <p className="text-base leading-relaxed text-muted-foreground">
                Entre na sua conta para gerenciar sua agenda.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              aria-busy={isLoading}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>

                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  disabled={isLoading}
                  required
                  className="h-12 text-base md:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>

                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                    className="h-12 pr-24 text-base md:text-base"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    aria-controls="password"
                    aria-label={
                      showPassword ? "Ocultar senha" : "Mostrar senha"
                    }
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute top-1 right-1 h-10 px-3"
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="h-12 w-full text-base font-medium"
              >
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>

              <p
                role="status"
                aria-live="polite"
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {message}
              </p>
            </form>
          </div>
        </div>

        <footer className="text-center text-xs text-muted-foreground">
          AgendaHub — Gestão de agendamentos
        </footer>
      </section>
    </main>
  );
}
