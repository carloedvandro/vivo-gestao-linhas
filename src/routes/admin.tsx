import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import {
  Plus,
  RefreshCw,
  LogOut,
  ExternalLink,
  Lock,
  Unlock,
  Bell,
  Search,
  Trash2,
  Users,
  Sun,
  Moon,
  FileDown,
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
  adminUpdateLineClientInfo,
  adminUpdatePaymentStatus,
  adminListSuppliers,
  adminCreateSupplier,
  adminUpdateSupplier,
  adminDeleteSupplier,
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

type AdminLine = ClientLine & {
  clientName: string | null;
  groupName: string | null;
  userId: string | null;
  iccid: string | null;
  activationDate: string | null;
  monthlyValue: number | null;
  dueDay: number | null;
  paymentMethod: string | null;
  vivoRepass: number | null;
  repass: number | null;
  acerto: string | null;
  paymentStatus: "a_pagar" | "pago" | "aguardando" | "vencido";
  paymentPaidAt: string | null;
};

type Supplier = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  created_at: string;
};

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
  const [supplierFilter, setSupplierFilter] = useState<string>("__all__");
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [pwdModal, setPwdModal] = useState<{ line: AdminLine } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", email: "", phone: "" });
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("admin-dark") === "true";
    }
    return false;
  });

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin-dark", String(next));
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await adminListLines();
      setLines(data as AdminLine[]);
      const sups = await adminListSuppliers();
      setSuppliers(sups as Supplier[]);
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

  async function updateClientInfo(line: AdminLine, field: "clientName" | "groupName", value: string) {
    try {
      await adminUpdateLineClientInfo({
        data: { lineId: line.id, [field]: value || null },
      });
      toast.success(`${line.number}: ${field === "clientName" ? "nome" : "fornecedor"} atualizado`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) {
      toast.error("Nome do fornecedor é obrigatório");
      return;
    }
    try {
      if (editingSupplierId) {
        await adminUpdateSupplier({
          data: {
            id: editingSupplierId,
            name: supplierForm.name.trim(),
            email: supplierForm.email.trim() || null,
            phone: supplierForm.phone.trim() || null,
          },
        });
        toast.success("Fornecedor atualizado");
      } else {
        await adminCreateSupplier({
          data: {
            name: supplierForm.name.trim(),
            email: supplierForm.email.trim() || null,
            phone: supplierForm.phone.trim() || null,
          },
        });
        toast.success("Fornecedor criado");
      }
      setSupplierForm({ name: "", email: "", phone: "" });
      setEditingSupplierId(null);
      setShowSupplierForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function deleteSupplier(id: string, name: string) {
    if (!confirm(`Excluir fornecedor "${name}"?`)) return;
    try {
      await adminDeleteSupplier({ data: { id } });
      toast.success("Fornecedor excluído");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
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
      (supplierFilter === "__all__" || l.groupName === supplierFilter) &&
      (l.number.includes(filter) ||
        l.plan.toLowerCase().includes(filter.toLowerCase()) ||
        (l.clientName ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        (l.groupName ?? "").toLowerCase().includes(filter.toLowerCase())),
  );

  // métricas resumidas
  const total = lines?.length ?? 0;
  const alerting = (lines ?? []).filter((l) => {
    if (l.total <= 0) return false;
    const th = l.threshold;
    if (!th || !th.enabled) return false;
    const limit = th.warnGb != null ? th.warnGb : (th.warnPct / 100) * l.total;
    return l.used >= limit;
  }).length;
  const blocked = (lines ?? []).filter((l) => l.status.startsWith("bloqueada")).length;

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 15;

    // Titulo
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Relatorio de Linhas — Ytech", margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const filtroTxt = supplierFilter !== "__all__" ? `Fornecedor: ${supplierFilter}` : "Todos os fornecedores";
    const dataTxt = `Gerado em: ${new Date().toLocaleString("pt-BR")} | ${filtroTxt} | ${filtered.length} linha(s)`;
    doc.text(dataTxt, margin, y);
    y += 8;

    // Cabecalho da tabela
    const cols = ["Linha", "Cliente", "Ativacao", "Valor", "Venc.", "Consumo", "Franquia", "GB Extra", "Fecha ciclo", "Renovacao", "Status"];
    const colWidths = [28, 55, 22, 20, 14, 22, 20, 20, 22, 22, 24];
    const rowHeight = 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = margin;
    cols.forEach((c, i) => {
      doc.text(c, x, y);
      x += colWidths[i];
    });
    y += 2;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += rowHeight;

    // Dados
    doc.setFont("helvetica", "normal");
    filtered.forEach((l) => {
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = 15;
        doc.setFont("helvetica", "bold");
        x = margin;
        cols.forEach((c, i) => { doc.text(c, x, y); x += colWidths[i]; });
        y += 2;
        doc.line(margin, y, pageWidth - margin, y);
        y += rowHeight;
        doc.setFont("helvetica", "normal");
      }
      const atv = l.activationDate ? new Date(l.activationDate).toLocaleDateString("pt-BR") : "—";
      const valor = l.monthlyValue != null ? `R$ ${l.monthlyValue.toFixed(2).replace(".", ",")}` : "—";
      const consumo = `${l.used.toFixed(2)} GB`;
      const franquia = `${l.total} GB`;
      const extra = `${l.bonusGb} GB`;
      const status = l.status === "ativa" ? "Ativa" : l.status === "bloqueada_fatura" ? "Bloqueada" : l.status;
      const vals = [l.number, (l.clientName ?? "—").substring(0, 35), atv, valor, String(l.dueDay ?? "—"), consumo, franquia, extra, String(l.closingDay), String(l.renewalDay), status];
      x = margin;
      vals.forEach((v, i) => {
        doc.text(String(v), x, y);
        x += colWidths[i];
      });
      y += rowHeight;
    });

    doc.save(`relatorio-linhas-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const d = darkMode;
  const bg = d ? "bg-[#1a1a1a]" : "bg-[#f3f3f3]";
  const bgCard = d ? "bg-[#242424] border-[#333]" : "bg-white border-[#eee]";
  const bgHeader = d ? "bg-[#242424]/90 border-[#333]" : "bg-white/90 border-[#eee]";
  const textMain = d ? "text-[#e0e0e0]" : "text-[#333]";
  const textMuted = d ? "text-[#999]" : "text-[#888]";
  const textSub = d ? "text-[#aaa]" : "text-[#555]";
  const borderClr = d ? "border-[#333]" : "border-[#eee]";
  const hoverBg = d ? "hover:bg-[#2a2a2a]" : "hover:bg-[#f3f3f3]";
  const inputClr = d ? "bg-[#1a1a1a] border-[#444] text-[#e0e0e0]" : "";
  const tableHead = d ? "bg-[#1a1a1a] text-[#888]" : "bg-[#fafafa] text-[#888]";
  const tableDivide = d ? "divide-[#333]" : "divide-[#f0f0f0]";

  return (
    <div className={`min-h-screen ${bg}`}>
      <header className={`sticky top-0 z-30 border-b ${bgHeader} backdrop-blur`}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#660099] text-sm font-bold text-white">
            A
          </div>
          <h1 className={`text-lg font-semibold ${textMain}`}>Painel Administrativo</h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${textSub} ${hoverBg}`}
              title={d ? "Modo claro" : "Modo escuro"}
            >
              {d ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <a
              href="/"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${textSub} ${hoverBg}`}
            >
              Ver como cliente
            </a>
            <button
              onClick={load}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${textSub} ${hoverBg}`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${textSub} ${hoverBg}`}
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
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${textMuted}`}>Total de linhas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#660099]">{total}</div>
            </CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`flex items-center gap-1 text-sm font-medium ${textMuted}`}>
                <Bell className="h-3.5 w-3.5" /> Em alerta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#F97316]">{alerting}</div>
            </CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`flex items-center gap-1 text-sm font-medium ${textMuted}`}>
                <Lock className="h-3.5 w-3.5" /> Bloqueadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#DC2626]">{blocked}</div>
            </CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${textMuted}`}>Pago (mes)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#16A34A]">
                R$ {filtered.filter(l => l.paymentStatus === "pago").reduce((s, l) => s + (l.monthlyValue ?? 0), 0).toFixed(2).replace(".", ",")}
              </div>
              <div className={`text-xs ${textMuted}`}>{filtered.filter(l => l.paymentStatus === "pago").length} linha(s)</div>
            </CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${textMuted}`}>A receber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#2563EB]">
                R$ {filtered.filter(l => l.paymentStatus === "a_pagar").reduce((s, l) => s + (l.monthlyValue ?? 0), 0).toFixed(2).replace(".", ",")}
              </div>
              <div className={`text-xs ${textMuted}`}>{filtered.filter(l => l.paymentStatus === "a_pagar").length} linha(s)</div>
            </CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${textMuted}`}>Aguardando</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#EAB308]">
                R$ {filtered.filter(l => l.paymentStatus === "aguardando").reduce((s, l) => s + (l.monthlyValue ?? 0), 0).toFixed(2).replace(".", ",")}
              </div>
              <div className={`text-xs ${textMuted}`}>{filtered.filter(l => l.paymentStatus === "aguardando").length} linha(s)</div>
            </CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${textMuted}`}>Vencido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#DC2626]">
                R$ {filtered.filter(l => l.paymentStatus === "vencido").reduce((s, l) => s + (l.monthlyValue ?? 0), 0).toFixed(2).replace(".", ",")}
              </div>
              <div className={`text-xs ${textMuted}`}>{filtered.filter(l => l.paymentStatus === "vencido").length} linha(s)</div>
            </CardContent>
          </Card>
        </div>

        {/* fornecedores */}
        <div className={`mt-6 rounded-lg border ${borderClr} ${d ? "bg-[#242424]" : "bg-white"} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className={`flex items-center gap-2 text-sm font-semibold ${textMain}`}>
              <Users className="h-4 w-4 text-[#660099]" />
              Fornecedores
            </h2>
            <button
              onClick={() => {
                setEditingSupplierId(null);
                setSupplierForm({ name: "", email: "", phone: "" });
                setShowSupplierForm(!showSupplierForm);
              }}
              className="flex items-center gap-1 rounded-md bg-[#660099] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#7a00b8]"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo fornecedor
            </button>
          </div>

          {showSupplierForm && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className={`text-xs ${textMuted}`}>Nome *</Label>
                <Input
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="Ex: Oliveira"
                  className={`mt-1 ${inputClr}`}
                  autoFocus
                />
              </div>
              <div>
                <Label className={`text-xs ${textMuted}`}>E-mail</Label>
                <Input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  placeholder="fornecedor@email.com"
                  className={`mt-1 ${inputClr}`}
                />
              </div>
              <div>
                <Label className={`text-xs ${textMuted}`}>Telefone</Label>
                <Input
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                  className={`mt-1 ${inputClr}`}
                />
              </div>
              <div className="col-span-full flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSupplierForm(false);
                    setEditingSupplierId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={saveSupplier}
                  className="bg-[#660099] text-white hover:bg-[#7a00b8]"
                >
                  {editingSupplierId ? "Salvar" : "Criar fornecedor"}
                </Button>
              </div>
            </div>
          )}

          {suppliers && suppliers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {suppliers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-full border border-[#e0d4ed] bg-[#f8f5fc] px-3 py-1.5"
                >
                  <span className="text-xs font-medium text-[#660099]">{s.name}</span>
                  {s.email && <span className={`text-xs ${d ? "text-[#888]" : "text-[#999]"}`}>· {s.email}</span>}
                  <button
                    onClick={() => {
                      setEditingSupplierId(s.id);
                      setSupplierForm({ name: s.name, email: s.email ?? "", phone: s.phone ?? "" });
                      setShowSupplierForm(true);
                    }}
                    className="text-xs text-[#888] hover:text-[#660099]"
                    title="Editar"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteSupplier(s.id, s.name)}
                    className="text-xs text-[#ccc] hover:text-[#DC2626]"
                    title="Excluir"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* filtro */}
        <div className="mt-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${d ? "text-[#888]" : "text-[#999]"}`} />
            <Input
              placeholder="Buscar por número, plano, cliente ou fornecedor…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`pl-9 ${d ? "text-white" : "text-[#1a1a1a]"}`}
            />
          </div>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className={`rounded-md border px-3 py-2 text-sm ${d ? "border-[#444] bg-[#242424] text-white" : "border-[#ddd] bg-white text-[#1a1a1a]"}`}
          >
            <option value="__all__">Todos os fornecedores</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={exportPDF}
            disabled={!lines || filtered.length === 0}
            className="flex items-center gap-1 rounded-md bg-[#660099] px-3 py-2 text-sm font-medium text-white hover:bg-[#550080] disabled:opacity-50"
            title="Gerar PDF do resultado filtrado"
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Gerar PDF</span>
          </button>
        </div>

        {/* tabela */}
        <div className={`mt-4 overflow-auto rounded-lg border ${borderClr} ${d ? "bg-[#242424]" : "bg-white"}`} style={{ maxHeight: "calc(100vh - 200px)" }}>
          <table className={`w-full min-w-[2400px] text-sm whitespace-nowrap ${tableDivide}`}>
            <thead className={`${tableHead} text-left text-xs uppercase tracking-wider ${textMuted} sticky top-0 z-20`}>
              <tr>
                <th className={`px-4 py-3 sticky left-0 z-20 ${d ? "bg-[#1a1a1a]" : "bg-[#fafafa]"} w-[120px] min-w-[120px]`}>Linha</th>
                <th className={`px-4 py-3 sticky left-[120px] z-20 ${d ? "bg-[#1a1a1a]" : "bg-[#fafafa]"} w-[180px] min-w-[180px]`}>Nome do cliente</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">ICCID</th>
                <th className="px-4 py-3">Ativação</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Venc.</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Repasse Vivo</th>
                <th className="px-4 py-3">Repasse</th>
                <th className="px-4 py-3">Acerto</th>
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
                  <td colSpan={21} className={`px-4 py-10 text-center ${textMuted}`}>
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={21} className={`px-4 py-10 text-center ${textMuted}`}>
                    Nenhuma linha encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const pct = l.total > 0 ? (l.used / l.total) * 100 : 0;
                  const inAlert =
                    l.total > 0 &&
                    l.threshold?.enabled &&
                    l.used >=
                      (l.threshold.warnGb != null
                        ? l.threshold.warnGb
                        : (l.threshold.warnPct / 100) * l.total);
                  return (
                    <tr key={l.id} className={inAlert ? "bg-[#FFF7ED]" : ""}>
                      <td className={`px-4 py-3 font-medium ${textMain} sticky left-0 z-10 ${inAlert ? "bg-[#FFF7ED]" : d ? "bg-[#242424]" : "bg-white"} w-[120px] min-w-[120px]`}>{l.number}</td>
                      <td className={`px-4 py-3 sticky left-[120px] z-10 ${inAlert ? "bg-[#FFF7ED]" : d ? "bg-[#242424]" : "bg-white"} w-[180px] min-w-[180px]`}>
                        <Input
                          type="text"
                          defaultValue={l.clientName ?? ""}
                          placeholder="Nome do cliente"
                          onBlur={(e) => {
                            if (e.target.value !== (l.clientName ?? "")) {
                              updateClientInfo(l, "clientName", e.target.value);
                            }
                          }}
                          className={`w-36 ${inputClr}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={l.groupName ?? "__none__"}
                          onValueChange={(v) => {
                            updateClientInfo(l, "groupName", v === "__none__" ? "" : v);
                          }}
                        >
                          <SelectTrigger className={`h-8 w-[140px] ${inputClr}`}>
                            <SelectValue placeholder="Sem fornecedor" />
                          </SelectTrigger>
                          <SelectContent className={d ? "bg-[#242424] border-[#444] text-[#e0e0e0]" : ""}>
                            <SelectItem value="__none__">Sem fornecedor</SelectItem>
                            {(suppliers ?? []).map((s) => (
                              <SelectItem key={s.id} value={s.name}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.plan}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${d ? "text-[#888]" : "text-[#666]"}`}>{l.iccid ?? "—"}</td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.activationDate ? new Date(l.activationDate).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className={`px-4 py-3 font-medium ${
                        l.paymentStatus === "pago" ? "text-[#16A34A] bg-[#16A34A]/10"
                        : l.paymentStatus === "aguardando" ? "text-[#EAB308] bg-[#EAB308]/10"
                        : l.paymentStatus === "vencido" ? "text-[#DC2626] bg-[#DC2626]/10"
                        : textSub
                      }`}>{l.monthlyValue != null ? `R$ ${l.monthlyValue.toFixed(2).replace(".", ",")}` : "—"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={l.paymentStatus}
                          onChange={async (e) => {
                            try {
                              await adminUpdatePaymentStatus({ data: { lineId: l.id, paymentStatus: e.target.value as "a_pagar" | "pago" | "aguardando" | "vencido" } });
                              toast.success(`${l.number}: status de pagamento atualizado`);
                              load();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Erro");
                            }
                          }}
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${
                            l.paymentStatus === "pago" ? "border-[#16A34A] text-[#16A34A] bg-[#16A34A]/10"
                            : l.paymentStatus === "aguardando" ? "border-[#EAB308] text-[#EAB308] bg-[#EAB308]/10"
                            : l.paymentStatus === "vencido" ? "border-[#DC2626] text-[#DC2626] bg-[#DC2626]/10"
                            : d ? "border-[#444] bg-[#242424] text-[#aaa]" : "border-[#ddd] bg-white text-[#555]"
                          }`}
                        >
                          <option value="a_pagar">A pagar</option>
                          <option value="pago">Pago</option>
                          <option value="aguardando">Aguardando</option>
                          <option value="vencido">Vencido</option>
                        </select>
                      </td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.dueDay ?? "—"}</td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.paymentMethod ?? "—"}</td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.vivoRepass != null ? `R$ ${l.vivoRepass.toFixed(2).replace(".", ",")}` : "—"}</td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.repass != null ? `R$ ${l.repass.toFixed(2).replace(".", ",")}` : "—"}</td>
                      <td className={`px-4 py-3 ${textSub}`}>{l.acerto ?? "—"}</td>
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
                          <span className={`text-xs ${d ? "text-[#aaa]" : "text-[#666]"}`}>
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
                          className={`w-20 ${inputClr}`}
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
                            className={`w-16 ${inputClr}`}
                          />
                          {(l.bonusGb ?? 0) > 0 && (
                            <button
                              onClick={() => resetBonus(l)}
                              className={`rounded-md border ${d ? "border-[#555]" : "border-[#ddd]"} px-1.5 py-1 text-xs ${textSub} ${hoverBg}`}
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
                          className={`w-16 ${inputClr}`}
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
                          className={`w-16 ${inputClr}`}
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
                          step={1}
                          defaultValue={l.threshold?.warnPct ?? 80}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== (l.threshold?.warnPct ?? 80)) {
                              updateThreshold(l, v);
                            }
                          }}
                          className={`w-16 ${inputClr}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Select
                            value={l.status}
                            onValueChange={(v) => updateStatus(l, v as ClientLine["status"])}
                          >
                            <SelectTrigger className={`h-8 w-[150px] ${inputClr}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className={d ? "bg-[#242424] border-[#444] text-[#e0e0e0]" : ""}>
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
                            <span className={`text-xs ${d ? "text-[#888]" : "text-[#bbb]"}`} title="Defina vivo_portal_url na linha">
                              sem link
                            </span>
                          )}
                          {l.userId && (
                            <button
                              onClick={() => {
                                setPwdModal({ line: l });
                                setNewPassword("");
                              }}
                              className={`flex items-center gap-1 rounded-md border ${d ? "border-[#888]" : "border-[#660099]"} px-2 py-1 text-xs font-medium ${d ? "text-[#ccc]" : "text-[#660099]"} ${hoverBg}`}
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

        <p className={`mt-4 text-xs ${textMuted}`}>
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
            className={`w-full max-w-md rounded-lg ${d ? "bg-[#242424]" : "bg-white"} p-6 shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={`text-lg font-semibold ${textMain}`}>Trocar senha</h2>
            <p className={`mt-1 text-sm ${textMuted}`}>
              Linha: <strong>{pwdModal.line.number}</strong> · Cliente: {pwdModal.line.clientName}
            </p>
            <div className="mt-4">
              <Label className={textSub}>Nova senha</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={`mt-1 ${inputClr}`}
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
