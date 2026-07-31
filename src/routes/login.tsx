import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar | Vivo Gestão de Linhas" },
      { name: "description", content: "Acesse seu painel de consumo." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

// Normaliza celular para formato E.164 sem + (apenas dígitos, com DDI 55)
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return "55" + digits;
  return digits;
}

// Email sintético derivado do celular — o Supabase Auth exige um email internamente
function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@vivo.local`;
}

type Role = "cliente" | "admin";

function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("cliente");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (role === "admin") {
      // Admin: login com email + senha (sem cadastro)
      if (!email || !password) return;
      setLoading(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/admin" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao entrar";
        setFeedback({ type: "error", text: msg });
        toast.error(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Cliente: celular + senha
    if (!phone || !password) return;
    const syntheticEmail = phoneToEmail(phone);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password,
        });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email: syntheticEmail,
          password,
          options: {
            data: {
              name: phone,
              phone: normalizePhone(phone),
            },
          },
        });
        if (error) throw error;
        const msg = "Conta criada com sucesso! Você já pode entrar com seu celular e senha.";
        setFeedback({ type: "success", text: msg });
        toast.success(msg);
        setMode("signin");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar";
      setFeedback({ type: "error", text: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#660099] to-[#2d004d] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#660099] text-2xl font-bold text-white">
            V
          </div>
          <CardTitle className="text-2xl">Vivo Gestão de Linhas</CardTitle>
          <p className="text-sm text-muted-foreground">
            {role === "admin"
              ? "Acesso do administrador"
              : mode === "signin"
                ? "Entre para ver seu consumo"
                : "Crie sua conta com seu celular"}
          </p>
        </CardHeader>
        <CardContent>
          {/* Seletor de tipo de acesso */}
          <div className="mb-4 flex rounded-lg border border-[#ddd] p-1">
            <button
              type="button"
              onClick={() => { setRole("cliente"); setFeedback(null); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                role === "cliente" ? "bg-[#660099] text-white" : "text-[#666] hover:bg-[#f3f3f3]"
              }`}
            >
              Cliente
            </button>
            <button
              type="button"
              onClick={() => { setRole("admin"); setMode("signin"); setFeedback(null); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                role === "admin" ? "bg-[#660099] text-white" : "text-[#666] hover:bg-[#f3f3f3]"
              }`}
            >
              Admin
            </button>
          </div>

          {feedback && (
            <div
              role="alert"
              className={`mb-4 rounded-md border px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {feedback.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === "cliente" ? (
              <div className="space-y-2">
                <Label htmlFor="phone">Celular</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(31) 99999-9999"
                  required
                  autoComplete="tel"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@exemplo.com"
                  required
                  autoComplete="email"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full bg-[#660099] hover:bg-[#7a00b8]" disabled={loading}>
              {loading
                ? "Aguarde..."
                : role === "admin"
                  ? "Entrar"
                  : mode === "signin"
                    ? "Entrar"
                    : "Criar conta"}
            </Button>
          </form>

          {role === "cliente" && (
            <div className="mt-4 text-center text-sm">
              {mode === "signin" ? (
                <button
                  onClick={() => { setMode("signup"); setFeedback(null); }}
                  className="text-[#660099] underline-offset-2 hover:underline"
                >
                  Não tem conta? Cadastre-se
                </button>
              ) : (
                <button
                  onClick={() => { setMode("signin"); setFeedback(null); }}
                  className="text-[#660099] underline-offset-2 hover:underline"
                >
                  Já tem conta? Entrar
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
