import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  LogOut,
  ExternalLink,
  Lock,
  Unlock,
  Bell,
  Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  adminListLines,
  adminUpdateThreshold,
  adminUpdateLineStatus,
  adminUpdateLineTotal,
  adminAddBonusGb,
  adminResetBonusGb,
  adminUpdateCycleDays,
  adminUpdateUserPassword,
  type ClientLine,
} from "@/lib/api/lines.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type AdminLine = ClientLine & { clientName: string; userId: string | null };

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel Admin | Vivo Gestão de Linhas" },
      { name: "description", content: "Gestão de linhas e clientes." },
    ],
  }),
  beforeLoad: async () => {
    // No SSR (server) não há localStorage; skip — o componente verifica no cliente.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    // valida admin
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", data.session.user.id)
      .single();
    if (!prof?.is_admin) throw redirect({ to: "/" });
  },
  component: AdminPage,
});

const STATUS_LABELS: Record<ClientLine["status"], string> = {
  ativa: "Ativa",
  reduzida: "Velocidade reduzida",
  bloqueada_fatura: "Bloqueada — fatura",
  bloqueada_pagamento: "Bloqueada — pagamento",
  aguardando: "Aguardando",
};

const STATUS_TONE: Record<ClientLine["status"], string> = {
  ativa: "#16A34A",
  reduzida: "#F97316",
  bloqueada_fatura: "#DC2626",
  bloqueada_pagamento: "#DC2626",
  aguardando: "#6B7280",
};

function AdminPage() {
  const navigate = useNavigate();
  const [lines, setLines] = useState<AdminLine[] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [pwdModal, setPwdModal] = useState<{ line: AdminLine } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await adminListLines();
      setLines(data as AdminLine[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Verifica auth no cliente (cobre acesso direto via URL / full page reload)
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/login" });
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", data.session.user.id)
        .single();
      if (!prof?.is_admin) {
        navigate({ to: "/" });
        return;
      }
      setAuthChecked(true);
      load();
    })();
    const i = window.setInterval(load, 60_000);
    return () => window.clearInterval(i);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function updateThreshold(line: AdminLine, warnPct: number) {
    try {
      await adminUpdateThreshold({ data: { lineId: line.id, warnPct } });
      toast.success(`Limiar de ${line.number} atualizado para ${warnPct}%`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function updateStatus(line: AdminLine, status: ClientLine["status"]) {
    try {
      await adminUpdateLineStatus({ data: { lineId: line.id, status } });
      toast.success(`${line.number} → ${STATUS_LABELS[status]}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function updateTotal(line: AdminLine, totalGb: number) {
    try {
      await adminUpdateLineTotal({ data: { lineId: line.id, totalGb } });
      toast.success(`${line.number}: franquia definida para ${totalGb} GB`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function addBonus(line: AdminLine, addGb: number) {
    try {
      const res = await adminAddBonusGb({ data: { lineId: line.id, addGb } });
      toast.success(`${line.number}: +${addGb} GB extras (total: ${res.bonusGb} GB)`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function resetBonus(line: AdminLine) {
    try {
      await adminResetBonusGb({ data: { lineId: line.id } });
      toast.success(`${line.number}: GB extras zerados`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function updateCycleDays(line: AdminLine, field: "closingDay" | "renewalDay", value: number) {
    try {
      await adminUpdateCycleDays({ data: { lineId: line.id, [field]: value } });
      toast.success(`${line.number}: ${field === "closingDay" ? "fechamento" : "renovação"} = dia ${value}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function changePassword() {
    if (!pwdModal?.line.userId) {
      toast.error("Esta linha não tem usuário vinculado");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setPwdLoading(true);
    try {
      await adminUpdateUserPassword({
        data: { userId: pwdModal.line.userId, newPassword },
      });
      toast.success(`Senha de ${pwdModal.line.number} alterada com sucesso`);
      setPwdModal(null);
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setPwdLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f3f3]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-[#660099] border-t-transparent" />
          <p className="text-sm text-[#888]">Verificando acesso…</p>
        </div>
      </div>
    );
  }

  const filtered = (lines ?? []).filter(
    (l) =>
      l.number.includes(filter) ||
      l.plan.toLowerCase().includes(filter.toLowerCase()) ||
      l.clientName.toLowerCase().includes(filter.toLowerCase()),
  );

  // métricas resumidas
  const total = lines?.length ?? 0;
  const alerting = (lines ?? []).filter((l) => {
    const pct = l.total > 0 ? (l.used / l.total) * 100 : 0;
    const th = l.threshold;
    if (!th || !th.enabled) return false;
    const limit = th.warnGb != null ? th.warnGb : (th.warnPct / 100) * l.total;
    return l.used >= limit;
  }).length;
  const blocked = (lines ?? []).filter((l) => l.status.startsWith("bloqueada")).length;

  return (
    <div className="min-h-screen bg-[#f3f3f3]">
      <header className="sticky top-0 z-30 border-b border-[#eee] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#660099] text-sm font-bold text-white">
            A
          </div>
          <h1 className="text-lg font-semibold text-[#333]">Painel Administrativo</h1>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#555] hover:bg-[#f3f3f3]"
            >
              Ver como cliente
            </a>
            <button
              onClick={load}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-[#555] hover:bg-[#f3f3f3]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-[#555] hover:bg-[#f3f3f3]"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {/* métricas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[#888]">Total de linhas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#660099]">{total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1 text-sm font-medium text-[#888]">
                <Bell className="h-3.5 w-3.5" /> Em alerta (limiar)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#F97316]">{alerting}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1 text-sm font-medium text-[#888]">
                <Lock className="h-3.5 w-3.5" /> Bloqueadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#DC2626]">{blocked}</div>
            </CardContent>
          </Card>
        </div>

        {/* filtro */}
        <div className="mt-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999]" />
            <Input
              placeholder="Buscar por número, plano ou cliente…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* tabela */}
        <div className="mt-4 overflow-hidden rounded-lg border border-[#eee] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-left text-xs uppercase tracking-wider text-[#888]">
              <tr>
                <th className="px-4 py-3">Linha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Consumo</th>
                <th className="px-4 py-3">Franquia (GB)</th>
                <th className="px-4 py-3">GB Extras</th>
                <th className="px-4 py-3">Fecha ciclo</th>
                <th className="px-4 py-3">Renovação</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Limiar (%)</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {lines === null ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-[#999]">
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-[#999]">
                    Nenhuma linha encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const pct = l.total > 0 ? (l.used / l.total) * 100 : 0;
                  const inAlert =
                    l.threshold?.enabled &&
                    l.used >=
                      (l.threshold.warnGb != null
                        ? l.threshold.warnGb
                        : (l.threshold.warnPct / 100) * l.total);
                  return (
                    <tr key={l.id} className={inAlert ? "bg-[#FFF7ED]" : ""}>
                      <td className="px-4 py-3 font-medium text-[#333]">{l.number}</td>
                      <td className="px-4 py-3 text-[#555]">{l.clientName}</td>
                      <td className="px-4 py-3 text-[#555]">{l.plan}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-[#eee]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                background:
                                  pct >= 95 ? "#DC2626" : pct >= 75 ? "#F97316" : "#16A34A",
                              }}
                            />
                          </div>
                          <span className="text-xs text-[#666]">
                            {l.used.toFixed(1)} / {(l.total + (l.bonusGb ?? 0)).toFixed(0)} GB ({pct.toFixed(0)}%)
                          </span>
                          {inAlert && <Bell className="h-3.5 w-3.5 text-[#F97316]" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          step={1}
                          defaultValue={l.total}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== l.total) {
                              updateTotal(l, v);
                            }
                          }}
                          className="w-20"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-[#660099]">
                            +{l.bonusGb ?? 0} GB
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            step={1}
                            placeholder="+GB"
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isNaN(v) && v > 0) {
                                addBonus(l, v);
                                e.target.value = "";
                              }
                            }}
                            className="w-16"
                          />
                          {(l.bonusGb ?? 0) > 0 && (
                            <button
                              onClick={() => resetBonus(l)}
                              className="rounded-md border border-[#ddd] px-1.5 py-1 text-xs text-[#666] hover:bg-[#f3f3f3]"
                              title="Zerar GB extras"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={1}
                          max={28}
                          step={1}
                          defaultValue={l.closingDay}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v >= 1 && v <= 28 && v !== l.closingDay) {
                              updateCycleDays(l, "closingDay", v);
                            }
                          }}
                          className="w-16"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={1}
                          max={28}
                          step={1}
                          defaultValue={l.renewalDay}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v >= 1 && v <= 28 && v !== l.renewalDay) {
                              updateCycleDays(l, "renewalDay", v);
                            }
                          }}
                          className="w-16"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: `${STATUS_TONE[l.status]}1A`, color: STATUS_TONE[l.status] }}
                        >
                          {STATUS_LABELS[l.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          defaultValue={l.threshold?.warnPct ?? 98}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== (l.threshold?.warnPct ?? 98)) {
                              updateThreshold(l, v);
                            }
                          }}
                          className="w-20"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Select
                            value={l.status}
                            onValueChange={(v) => updateStatus(l, v as ClientLine["status"])}
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(STATUS_LABELS) as ClientLine["status"][]).map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {l.vivoPortalUrl ? (
                            <a
                              href={l.vivoPortalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 rounded-md border border-[#660099] px-2 py-1 text-xs font-medium text-[#660099] hover:bg-[#660099]/10"
                              title="Abrir no portal Vivo (bloqueio semiautomático)"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Portal
                            </a>
                          ) : (
                            <span className="text-xs text-[#bbb]" title="Defina vivo_portal_url na linha">
                              sem link
                            </span>
                          )}
                          {l.userId && (
                            <button
                              onClick={() => {
                                setPwdModal({ line: l });
                                setNewPassword("");
                              }}
                              className="flex items-center gap-1 rounded-md border border-[#888] px-2 py-1 text-xs font-medium text-[#555] hover:bg-[#f3f3f3]"
                              title="Trocar senha do usuário"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Senha
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[#999]">
          Bloqueio é <strong>semiautomático</strong>: ao mudar o status aqui, o sistema avisa o
          cliente. Para bloquear de fato na Vivo, use o botão <em>Portal</em> (configure{" "}
          <code>vivo_portal_url</code> por linha no banco). O scraper atualiza o consumo a cada 5
          minutos.
        </p>
      </main>

      {/* Modal trocar senha */}
      {pwdModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setPwdModal(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#333]">Trocar senha</h2>
            <p className="mt-1 text-sm text-[#888]">
              Linha: <strong>{pwdModal.line.number}</strong> · Cliente: {pwdModal.line.clientName}
            </p>
            <div className="mt-4">
              <Label className="text-[#555]">Nova senha</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPwdModal(null)}
                disabled={pwdLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={changePassword}
                disabled={pwdLoading || newPassword.length < 6}
                className="bg-[#660099] text-white hover:bg-[#5a0088]"
              >
                {pwdLoading ? "Salvando…" : "Salvar senha"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
