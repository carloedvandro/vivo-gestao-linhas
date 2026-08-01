import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Phone, Mail, Info } from "lucide-react";

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

// Normaliza para o formato sem DDI (apenas DDD + número) — usado na base available_lines
function normalizeLineNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits.substring(2);
  return digits;
}

// Email sintético derivado do celular — o Supabase Auth exige um email internamente
function phoneToEmail(phone: string): string {
  return `${normalizeLineNumber(phone)}@vivo.local`;
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
        // Validar se a linha existe na base de dados da Ytech
        const lineNumber = normalizeLineNumber(phone);
        const { data: availData, error: availErr } = await supabase
          .from("available_lines")
          .select("number, linked")
          .eq("number", lineNumber)
          .maybeSingle();

        if (availErr) {
          throw new Error("Erro ao validar linha. Tente novamente.");
        }
        if (!availData) {
          throw new Error("Esta linha não está na base de dados da empresa Ytech. Verifique o número ou entre em contato com o suporte.");
        }
        if (availData.linked) {
          throw new Error("Esta linha já está cadastrada. Faça login com seu celular e senha.");
        }

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
    <div className="min-h-screen bg-[#f3f3f3]">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        {/* Logo / título — mesmo padrão do app */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#660099] text-2xl font-bold text-white shadow-lg">
            V
          </div>
          <h1 className="text-[28px] font-semibold leading-tight text-[#660099]">
            Vivo Gestão de Linhas
          </h1>
          <p className="mt-1 text-sm text-[#666]">
            Acompanhe seu consumo de internet em tempo real
          </p>
        </div>

        {/* Card com glassmorphism — mesmo estilo do painel de consumo */}
        <div
          className="rounded-lg p-6 shadow-lg"
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.45)",
          }}
        >
          {/* Seletor Cliente / Admin */}
          <div className="mb-5 flex rounded-full bg-[#ececef] p-1">
            <button
              type="button"
              onClick={() => { setRole("cliente"); setFeedback(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                role === "cliente" ? "bg-white text-[#660099] shadow-sm" : "text-[#888] hover:text-[#555]"
              }`}
            >
              Cliente
            </button>
            <button
              type="button"
              onClick={() => { setRole("admin"); setMode("signin"); setFeedback(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                role === "admin" ? "bg-white text-[#660099] shadow-sm" : "text-[#888] hover:text-[#555]"
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

          {/* Aviso importante para cadastro de cliente */}
          {role === "cliente" && mode === "signup" && (
            <div className="mb-4 rounded-md border border-[#660099]/20 bg-[#f3eaf7] px-4 py-3">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#660099]" />
                <div className="text-xs leading-relaxed text-[#4a0048]">
                  <p className="font-semibold text-[#660099]">Importante!</p>
                  <p className="mt-1">
                    Cadastre-se com o <strong>número do chip da sua linha Ytech Internet 5G</strong>,
                    ou seja, o número que foi entregue junto com o seu plano.
                  </p>
                  <p className="mt-1.5">
                    Não use seu número de celular particular. O sistema busca o consumo
                    no portal da Vivo usando o número da linha Ytech.
                  </p>
                  <p className="mt-1.5 text-[#888]">
                    Você pode digitar com ou sem formatação:<br />
                    <span className="font-mono text-[#660099]">(99) 98765-4321</span> ou{" "}
                    <span className="font-mono text-[#660099]">99987654321</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Aviso menor para login de cliente */}
          {role === "cliente" && mode === "signin" && (
            <div className="mb-4 rounded-md bg-[#f8f5fa] px-3 py-2 text-xs text-[#777]">
              Use o número da sua linha Ytech Internet 5G e a senha que você cadastrou.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === "cliente" ? (
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[#333]">
                  Celular da linha Ytech
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999]" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(99) 98765-4321"
                    required
                    autoComplete="tel"
                    className="pl-10"
                  />
                </div>
                {mode === "signup" && (
                  <p className="text-[11px] text-[#999]">
                    Exemplos válidos: (99) 98765-4321 ou 99987654321
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#333]">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999]" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yrwentechnology.com.br"
                    required
                    autoComplete="email"
                    className="pl-10"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#333]">
                Senha
              </Label>
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
              {role === "cliente" && mode === "signup" && (
                <p className="text-[11px] text-[#999]">Mínimo de 6 caracteres</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-[#660099] hover:bg-[#7a00b8]"
              disabled={loading}
            >
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
            <div className="mt-5 text-center text-sm">
              {mode === "signin" ? (
                <button
                  onClick={() => { setMode("signup"); setFeedback(null); }}
                  className="font-medium text-[#660099] underline-offset-2 hover:underline"
                >
                  Não tem conta? Cadastre-se
                </button>
              ) : (
                <button
                  onClick={() => { setMode("signin"); setFeedback(null); }}
                  className="font-medium text-[#660099] underline-offset-2 hover:underline"
                >
                  Já tem conta? Entrar
                </button>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[#aaa]">
          Ytech Internet 5G · Vivo Gestão de Linhas
        </p>
      </main>
    </div>
  );
}
