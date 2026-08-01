import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import {
  ArrowLeft,
  FileDown,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  adminListLines,
  adminListSuppliers,
  type ClientLine,
} from "@/lib/api/lines.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

type Supplier = { id: string; name: string };

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({
    meta: [
      { title: "Relatório Financeiro | Vivo Gestão" },
      { name: "description", content: "Relatório financeiro de linhas." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", data.session.user.id)
      .single();
    if (!prof?.is_admin) throw redirect({ to: "/" });
  },
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const navigate = useNavigate();
  const [lines, setLines] = useState<AdminLine[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("darkMode") === "true";
  });

  async function load() {
    try {
      const data = (await adminListLines()) as unknown as AdminLine[];
      setLines(data);
      const sups = (await adminListSuppliers()) as unknown as Supplier[];
      setSuppliers(sups);
    } catch (err) {
      if (err instanceof Error && err.message.includes("session")) {
        navigate({ to: "/login" });
      }
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    localStorage.setItem("darkMode", String(darkMode));
  }, [darkMode]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const d = darkMode;
  const bg = d ? "bg-[#1a1a1a]" : "bg-[#f3f3f3]";
  const bgCard = d ? "bg-[#242424] border-[#333]" : "bg-white border-[#eee]";
  const textMain = d ? "text-[#e0e0e0]" : "text-[#333]";
  const textMuted = d ? "text-[#999]" : "text-[#888]";
  const textSub = d ? "text-[#aaa]" : "text-[#555]";
  const borderClr = d ? "border-[#333]" : "border-[#eee]";
  const tableDivide = d ? "divide-[#333]" : "divide-[#eee]";
  const tableHead = d ? "bg-[#1a1a1a]" : "bg-[#fafafa]";

  // Calculos
  const allLines = lines ?? [];
  const totalFaturado = allLines.reduce((s, l) => s + (l.monthlyValue ?? 0), 0);
  const totalRecebido = allLines.filter(l => l.paymentStatus === "pago").reduce((s, l) => s + (l.monthlyValue ?? 0), 0);
  const totalAReceber = allLines.filter(l => l.paymentStatus === "a_pagar").reduce((s, l) => s + (l.monthlyValue ?? 0), 0);
  const totalAguardando = allLines.filter(l => l.paymentStatus === "aguardando").reduce((s, l) => s + (l.monthlyValue ?? 0), 0);
  const totalVencido = allLines.filter(l => l.paymentStatus === "vencido").reduce((s, l) => s + (l.monthlyValue ?? 0), 0);
  const totalRepasseVivo = allLines.reduce((s, l) => s + (l.vivoRepass ?? 0), 0);
  const totalRepasseFornec = allLines.reduce((s, l) => s + (l.repass ?? 0), 0);
  const lucroLiquido = totalRecebido - totalRepasseVivo - totalRepasseFornec;

  // Por fornecedor
  const fornecedores = (suppliers ?? []).map(s => {
    const linhasForn = allLines.filter(l => l.groupName === s.name);
    const faturado = linhasForn.reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0);
    const recebido = linhasForn.filter(l => l.paymentStatus === "pago").reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0);
    const aReceber = linhasForn.filter(l => l.paymentStatus === "a_pagar").reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0);
    const aguardando = linhasForn.filter(l => l.paymentStatus === "aguardando").reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0);
    const vencido = linhasForn.filter(l => l.paymentStatus === "vencido").reduce((sum, l) => sum + (l.monthlyValue ?? 0), 0);
    const repasseVivo = linhasForn.reduce((sum, l) => sum + (l.vivoRepass ?? 0), 0);
    const repasseForn = linhasForn.reduce((sum, l) => sum + (l.repass ?? 0), 0);
    const lucro = recebido - repasseVivo - repasseForn;
    return { name: s.name, count: linhasForn.length, faturado, recebido, aReceber, aguardando, vencido, repasseVivo, repasseForn, lucro, linhas: linhasForn };
  });

  function fmt(v: number) {
    return `R$ ${v.toFixed(2).replace(".", ",")}`;
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 15;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Relatorio Financeiro — Ytech", margin, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 10;

    // Resumo geral
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Geral", margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const resumo = [
      ["Total Faturado", fmt(totalFaturado)],
      ["Total Recebido", fmt(totalRecebido)],
      ["A Receber", fmt(totalAReceber)],
      ["Aguardando", fmt(totalAguardando)],
      ["Vencido", fmt(totalVencido)],
      ["Repasse Vivo (total)", fmt(totalRepasseVivo)],
      ["Repasse Fornecedores (total)", fmt(totalRepasseFornec)],
      ["Lucro Liquido (recebido - repasses)", fmt(lucroLiquido)],
    ];
    resumo.forEach(([label, val]) => {
      doc.text(`${label}:`, margin, y);
      doc.text(val, margin + 60, y);
      y += 5;
    });
    y += 6;

    // Por fornecedor
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo por Fornecedor", margin, y);
    y += 6;
    const fCols = ["Fornecedor", "Linhas", "Faturado", "Recebido", "A Receber", "Aguard.", "Vencido", "Rep. Vivo", "Rep. Forn.", "Lucro"];
    const fW = [40, 15, 25, 25, 25, 25, 25, 25, 25, 25];
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = margin;
    fCols.forEach((c, i) => { doc.text(c, x, y); x += fW[i]; });
    y += 4;
    doc.line(margin, y, pw - margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    fornecedores.forEach(f => {
      if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 15; }
      const vals = [f.name, String(f.count), fmt(f.faturado), fmt(f.recebido), fmt(f.aReceber), fmt(f.aguardando), fmt(f.vencido), fmt(f.repasseVivo), fmt(f.repasseForn), fmt(f.lucro)];
      x = margin;
      vals.forEach((v, i) => { doc.text(String(v), x, y); x += fW[i]; });
      y += 5;
    });
    y += 8;

    // Por linha
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Detalhamento por Linha", margin, y);
    y += 6;
    const lCols = ["Linha", "Cliente", "Fornecedor", "Valor", "Status", "Venc.", "Rep. Vivo", "Rep. Forn.", "Lucro"];
    const lW = [28, 50, 35, 22, 22, 14, 22, 22, 22];
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    x = margin;
    lCols.forEach((c, i) => { doc.text(c, x, y); x += lW[i]; });
    y += 4;
    doc.line(margin, y, pw - margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    allLines.forEach(l => {
      if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 15; }
      const st = l.paymentStatus === "pago" ? "Pago" : l.paymentStatus === "aguardando" ? "Aguard." : l.paymentStatus === "vencido" ? "Vencido" : "A pagar";
      const lucro = (l.monthlyValue ?? 0) - (l.vivoRepass ?? 0) - (l.repass ?? 0);
      const vals = [l.number, (l.clientName ?? "—").substring(0, 30), (l.groupName ?? "—").substring(0, 20), fmt(l.monthlyValue ?? 0), st, String(l.dueDay ?? "—"), fmt(l.vivoRepass ?? 0), fmt(l.repass ?? 0), fmt(lucro)];
      x = margin;
      vals.forEach((v, i) => { doc.text(String(v), x, y); x += lW[i]; });
      y += 5;
    });

    doc.save(`relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  if (!lines) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className={textMuted}>Carregando…</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg}`}>
      {/* Header */}
      <header className={`sticky top-0 z-30 border-b ${borderClr} ${d ? "bg-[#1a1a1a]/90" : "bg-white/90"} backdrop-blur`}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3">
          <Link to="/admin" className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium ${d ? "text-[#aaa] hover:bg-[#333]" : "text-[#555] hover:bg-[#f3f3f3]"}`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Link>
          <h1 className={`text-base font-semibold ${textMain}`}>Relatório Financeiro</h1>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={exportPDF}
              className="flex items-center gap-1 rounded-md bg-[#660099] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#550080]"
              title="Gerar PDF"
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar PDF</span>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${d ? "text-[#aaa] hover:bg-[#333]" : "text-[#555] hover:bg-[#f3f3f3]"}`}
            >
              {d ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${d ? "text-[#aaa] hover:bg-[#333]" : "text-[#555] hover:bg-[#f3f3f3]"}`}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Resumo Geral */}
        <h2 className={`mb-3 text-lg font-bold ${textMain}`}>Resumo Geral</h2>
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Total Faturado</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#660099]">{fmt(totalFaturado)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Recebido</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#16A34A]">{fmt(totalRecebido)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>A Receber</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#2563EB]">{fmt(totalAReceber)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Aguardando</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#EAB308]">{fmt(totalAguardando)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Vencido</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#DC2626]">{fmt(totalVencido)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Repasse Vivo</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#F97316]">{fmt(totalRepasseVivo)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Repasse Fornecedores</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#F97316]">{fmt(totalRepasseFornec)}</div></CardContent>
          </Card>
          <Card className={`${bgCard} ${borderClr}`}>
            <CardHeader className="pb-2"><CardTitle className={`text-sm ${textMuted}`}>Lucro Líquido</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${lucroLiquido >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{fmt(lucroLiquido)}</div>
              <div className={`text-xs ${textMuted}`}>recebido - repasses</div>
            </CardContent>
          </Card>
        </div>

        {/* Por Fornecedor */}
        <h2 className={`mb-3 text-lg font-bold ${textMain}`}>Resumo por Fornecedor</h2>
        <div className={`mb-6 overflow-auto rounded-lg border ${borderClr} ${d ? "bg-[#242424]" : "bg-white"}`}>
          <table className={`w-full min-w-[900px] text-sm whitespace-nowrap ${tableDivide}`}>
            <thead className={`${tableHead} text-left text-xs uppercase tracking-wider ${textMuted} sticky top-0`}>
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Linhas</th>
                <th className="px-4 py-3">Faturado</th>
                <th className="px-4 py-3">Recebido</th>
                <th className="px-4 py-3">A Receber</th>
                <th className="px-4 py-3">Aguardando</th>
                <th className="px-4 py-3">Vencido</th>
                <th className="px-4 py-3">Rep. Vivo</th>
                <th className="px-4 py-3">Rep. Forn.</th>
                <th className="px-4 py-3">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fornecedores.map((f) => (
                <tr key={f.name}>
                  <td className={`px-4 py-3 font-medium ${textMain}`}>{f.name}</td>
                  <td className={`px-4 py-3 ${textSub}`}>{f.count}</td>
                  <td className={`px-4 py-3 ${textSub}`}>{fmt(f.faturado)}</td>
                  <td className="px-4 py-3 font-medium text-[#16A34A]">{fmt(f.recebido)}</td>
                  <td className="px-4 py-3 text-[#2563EB]">{fmt(f.aReceber)}</td>
                  <td className="px-4 py-3 text-[#EAB308]">{fmt(f.aguardando)}</td>
                  <td className="px-4 py-3 text-[#DC2626]">{fmt(f.vencido)}</td>
                  <td className={`px-4 py-3 ${textSub}`}>{fmt(f.repasseVivo)}</td>
                  <td className={`px-4 py-3 ${textSub}`}>{fmt(f.repasseForn)}</td>
                  <td className={`px-4 py-3 font-medium ${f.lucro >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{fmt(f.lucro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detalhamento por Linha */}
        <h2 className={`mb-3 text-lg font-bold ${textMain}`}>Detalhamento por Linha</h2>
        <div className={`overflow-auto rounded-lg border ${borderClr} ${d ? "bg-[#242424]" : "bg-white"}`}>
          <table className={`w-full min-w-[1100px] text-sm whitespace-nowrap ${tableDivide}`}>
            <thead className={`${tableHead} text-left text-xs uppercase tracking-wider ${textMuted} sticky top-0`}>
              <tr>
                <th className="px-4 py-3">Linha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status Pag.</th>
                <th className="px-4 py-3">Venc.</th>
                <th className="px-4 py-3">Rep. Vivo</th>
                <th className="px-4 py-3">Rep. Forn.</th>
                <th className="px-4 py-3">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allLines.map((l) => {
                const lucro = (l.monthlyValue ?? 0) - (l.vivoRepass ?? 0) - (l.repass ?? 0);
                const stLabel = l.paymentStatus === "pago" ? "Pago" : l.paymentStatus === "aguardando" ? "Aguardando" : l.paymentStatus === "vencido" ? "Vencido" : "A pagar";
                const stColor = l.paymentStatus === "pago" ? "text-[#16A34A]" : l.paymentStatus === "aguardando" ? "text-[#EAB308]" : l.paymentStatus === "vencido" ? "text-[#DC2626]" : textSub;
                return (
                  <tr key={l.id}>
                    <td className={`px-4 py-3 font-medium ${textMain}`}>{l.number}</td>
                    <td className={`px-4 py-3 ${textSub}`}>{l.clientName ?? "—"}</td>
                    <td className={`px-4 py-3 ${textSub}`}>{l.groupName ?? "—"}</td>
                    <td className={`px-4 py-3 font-medium ${
                      l.paymentStatus === "pago" ? "text-[#16A34A]"
                      : l.paymentStatus === "aguardando" ? "text-[#EAB308]"
                      : l.paymentStatus === "vencido" ? "text-[#DC2626]"
                      : textSub
                    }`}>{l.monthlyValue != null ? fmt(l.monthlyValue) : "—"}</td>
                    <td className={`px-4 py-3 font-medium ${stColor}`}>{stLabel}</td>
                    <td className={`px-4 py-3 ${textSub}`}>{l.dueDay ?? "—"}</td>
                    <td className={`px-4 py-3 ${textSub}`}>{l.vivoRepass != null ? fmt(l.vivoRepass) : "—"}</td>
                    <td className={`px-4 py-3 ${textSub}`}>{l.repass != null ? fmt(l.repass) : "—"}</td>
                    <td className={`px-4 py-3 font-medium ${lucro >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{fmt(lucro)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
