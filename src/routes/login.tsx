import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
    // Já logado? Manda pra home (ou admin depois).
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setFeedback(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: email.split("@")[0] } },
        });
        if (error) throw error;
        const message = "Conta criada com sucesso! Você já pode entrar com seu email e senha.";
        setFeedback({ type: "success", text: message });
        toast.success(message);
        setMode("signin");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao autenticar";
      setFeedback({ type: "error", text: message });
      toast.error(message);
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
            {mode === "signin" ? "Entre para ver seu consumo" : "Crie sua conta de cliente"}
          </p>
        </CardHeader>
        <CardContent>
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
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                required
                autoComplete="email"
              />
            </div>
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
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {mode === "signin" ? (
              <button
                onClick={() => setMode("signup")}
                className="text-[#660099] underline-offset-2 hover:underline"
              >
                Não tem conta? Cadastre-se
              </button>
            ) : (
              <button
                onClick={() => setMode("signin")}
                className="text-[#660099] underline-offset-2 hover:underline"
              >
                Já tem conta? Entrar
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
