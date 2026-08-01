import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Database,
  LineStatus,
  LineRow,
  ThresholdRow,
  AlertRow,
  SnapshotRow,
} from "@/integrations/supabase/types";

export type { LineStatus };

// Formato que o index.tsx já espera (compatível com o tipo Line hardcoded).
export type ClientLine = {
  id: string;
  number: string;
  used: number; // GB
  total: number; // GB
  bonusGb: number; // GB extras liberados pelo admin
  plan: string;
  cycleDays: number;
  status: LineStatus;
  closingDay: number;
  renewalDay: number;
  vivoPortalUrl: string | null;
  lastScrapedAt: string | null;
  clientName: string | null;
  groupName: string | null;
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
  threshold: {
    warnPct: number;
    warnGb: number | null;
    enabled: boolean;
  } | null;
};

// ---------------------------------------------------------------------------
// Linhas do usuário autenticado (cliente vê as suas; admin vê todas)
// ---------------------------------------------------------------------------
export const getMyLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();

    const isAdmin = profile?.is_admin ?? false;

    let query = supabase.from("lines").select("*");
    if (!isAdmin) query = query.eq("user_id", userId);
    const { data: lines, error } = await query.order("number");
    if (error) throw new Error(error.message);

    // thresholds
    const lineIds = (lines ?? []).map((l) => l.id);
    const { data: thresholds } = await supabase
      .from("thresholds")
      .select("*")
      .in("line_id", lineIds);

    const thMap = new Map<string, ThresholdRow>(
      (thresholds ?? []).map((t) => [t.line_id, t]),
    );

    return (lines ?? []).map((l): ClientLine => mapLine(l, thMap.get(l.id) ?? null));
  });

// ---------------------------------------------------------------------------
// Linha única + histórico de consumo (12 últimos snapshots)
// ---------------------------------------------------------------------------
export const getLineDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ lineId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    const isAdmin = profile?.is_admin ?? false;

    let q = supabase.from("lines").select("*").eq("id", data.lineId);
    if (!isAdmin) q = q.eq("user_id", userId);
    const { data: line, error } = await q.single();
    if (error) throw new Error(error.message);

    const { data: threshold } = await supabase
      .from("thresholds")
      .select("*")
      .eq("line_id", data.lineId)
      .maybeSingle();

    const { data: snapshots } = await supabase
      .from("consumption_snapshots")
      .select("*")
      .eq("line_id", data.lineId)
      .order("scraped_at", { ascending: false })
      .limit(12);

    return {
      line: mapLine(line, threshold),
      history: (snapshots ?? []) as SnapshotRow[],
    };
  });

// ---------------------------------------------------------------------------
// Alertas do usuário (não lidos primeiro)
// ---------------------------------------------------------------------------
export const getMyAlerts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ unreadOnly: z.boolean().optional() }).optional())
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("alerts").select("*").eq("user_id", userId);
    if (data?.unreadOnly) q = q.eq("read", false);
    const { data: alerts, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (alerts ?? []) as AlertRow[];
  });

// ---------------------------------------------------------------------------
// Marcar alerta como lido
// ---------------------------------------------------------------------------
export const markAlertRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ alertId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alerts")
      .update({ read: true })
      .eq("id", data.alertId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: listar todas as linhas com nome do cliente
// ---------------------------------------------------------------------------
export const adminListLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { data: lines, error } = await supabase
      .from("lines")
      .select("*, profiles:user_id(name, phone)")
      .order("number");
    if (error) throw new Error(error.message);

    const { data: thresholds } = await supabase.from("thresholds").select("*");
    const thMap = new Map<string, ThresholdRow>(
      (thresholds ?? []).map((t) => [t.line_id, t]),
    );

    return (lines ?? []).map((l) => {
      const profileName = (l as unknown as { profiles?: { name: string | null } | null }).profiles?.name ?? null;
      return {
        ...mapLine(l, thMap.get(l.id) ?? null),
        clientName: l.client_name ?? profileName ?? "—",
        userId: l.user_id,
      };
    });
  });

// ---------------------------------------------------------------------------
// Admin: atualizar limiar de uma linha
// ---------------------------------------------------------------------------
export const adminUpdateThreshold = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      warnPct: z.number().min(0).max(100).optional(),
      warnGb: z.number().min(0).nullable().optional(),
      enabled: z.boolean().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const payload: Database["public"]["Tables"]["thresholds"]["Insert"] = {
      line_id: data.lineId,
      warn_pct: data.warnPct ?? 98,
      warn_gb: data.warnGb ?? null,
      enabled: data.enabled ?? true,
    };

    const { error } = await supabase
      .from("thresholds")
      .upsert(payload, { onConflict: "line_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: atualizar status/bloqueio (marca no sistema; bloqueio na Vivo é
// semiautomático — o admin clica no vivoPortalUrl)
// ---------------------------------------------------------------------------
export const adminUpdateLineStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      status: z.enum([
        "ativa",
        "reduzida",
        "bloqueada_fatura",
        "bloqueada_pagamento",
        "aguardando",
      ]),
      vivoPortalUrl: z.string().url().nullable().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const update: Database["public"]["Tables"]["lines"]["Update"] = {
      status: data.status,
    };
    if (data.vivoPortalUrl !== undefined) update.vivo_portal_url = data.vivoPortalUrl;

    const { error } = await supabase.from("lines").update(update).eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: definir franquia total (total_gb) de uma linha
// ---------------------------------------------------------------------------
export const adminUpdateLineTotal = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      totalGb: z.number().min(0).max(10000),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { error } = await supabase
      .from("lines")
      .update({ total_gb: data.totalGb })
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: definir dia de fechamento e renovação do ciclo
// ---------------------------------------------------------------------------
export const adminUpdateCycleDays = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      closingDay: z.number().min(1).max(28).optional(),
      renewalDay: z.number().min(1).max(28).optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const update: Database["public"]["Tables"]["lines"]["Update"] = {};
    if (data.closingDay !== undefined) {
      update.cycle_closing_day = data.closingDay;
      update.due_day = data.closingDay;
    }
    if (data.renewalDay !== undefined) update.cycle_renewal_day = data.renewalDay;

    const { error } = await supabase
      .from("lines")
      .update(update)
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: adicionar GB extras (bonus_gb) a uma linha
// ---------------------------------------------------------------------------
export const adminAddBonusGb = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      addGb: z.number().min(0).max(10000),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    // Soma ao bonus_gb existente
    const { data: line } = await supabase
      .from("lines")
      .select("bonus_gb")
      .eq("id", data.lineId)
      .single();
    const current = Number(line?.bonus_gb ?? 0);
    const newBonus = current + data.addGb;

    const { error } = await supabase
      .from("lines")
      .update({ bonus_gb: newBonus })
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true, bonusGb: newBonus };
  });

// ---------------------------------------------------------------------------
// Admin: remover GB extras (zera bonus_gb)
// ---------------------------------------------------------------------------
export const adminResetBonusGb = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { error } = await supabase
      .from("lines")
      .update({ bonus_gb: 0 })
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const savePushSubscription = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      endpoint: z.string().url(),
      p256dh: z.string(),
      authKey: z.string(),
      userAgent: z.string().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth_key: data.authKey,
          user_agent: data.userAgent ?? null,
        },
        { onConflict: "user_id,endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: trocar senha de um usuário (usa service role)
// ---------------------------------------------------------------------------
export const adminUpdateUserPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().uuid(),
      newPassword: z.string().min(6).max(72),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: definir nome do cliente e grupo da linha
// ---------------------------------------------------------------------------
export const adminUpdateLineClientInfo = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      clientName: z.string().nullable().optional(),
      groupName: z.string().nullable().optional(),
      plan: z.string().nullable().optional(),
      iccid: z.string().nullable().optional(),
      activationDate: z.string().nullable().optional(),
      monthlyValue: z.number().nullable().optional(),
      paymentMethod: z.string().nullable().optional(),
      vivoRepass: z.number().nullable().optional(),
      repass: z.number().nullable().optional(),
      acerto: z.string().nullable().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const update: Database["public"]["Tables"]["lines"]["Update"] = {};
    if (data.clientName !== undefined) update.client_name = data.clientName;
    if (data.groupName !== undefined) update.group_name = data.groupName;
    if (data.plan !== undefined) update.plan = data.plan ?? "";
    if (data.iccid !== undefined) update.iccid = data.iccid;
    if (data.activationDate !== undefined) update.activation_date = data.activationDate;
    if (data.monthlyValue !== undefined) update.monthly_value = data.monthlyValue;
    if (data.paymentMethod !== undefined) update.payment_method = data.paymentMethod;
    if (data.vivoRepass !== undefined) update.vivo_repass = data.vivoRepass;
    if (data.repass !== undefined) update.repass = data.repass;
    if (data.acerto !== undefined) update.acerto = data.acerto;

    const { error } = await supabase
      .from("lines")
      .update(update)
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: atualizar status de pagamento de uma linha
// ---------------------------------------------------------------------------
export const adminUpdatePaymentStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lineId: z.string().uuid(),
      paymentStatus: z.enum(["a_pagar", "pago", "aguardando", "vencido"]),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const update: Database["public"]["Tables"]["lines"]["Update"] = {
      payment_status: data.paymentStatus,
      payment_paid_at: data.paymentStatus === "pago" ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from("lines")
      .update(update)
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: criar linha nova
// ---------------------------------------------------------------------------
export const adminCreateLine = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      number: z.string().min(8),
      clientName: z.string().nullable().optional(),
      groupName: z.string().nullable().optional(),
      plan: z.string().nullable().optional(),
      iccid: z.string().nullable().optional(),
      activationDate: z.string().nullable().optional(),
      monthlyValue: z.number().nullable().optional(),
      dueDay: z.number().min(1).max(28).nullable().optional(),
      paymentMethod: z.string().nullable().optional(),
      vivoRepass: z.number().nullable().optional(),
      repass: z.number().nullable().optional(),
      acerto: z.string().nullable().optional(),
      totalGb: z.number().min(0).nullable().optional(),
      status: z.enum(["ativa", "reduzida", "bloqueada_fatura", "bloqueada_pagamento", "aguardando"]).optional(),
      closingDay: z.number().min(1).max(28).nullable().optional(),
      renewalDay: z.number().min(1).max(28).nullable().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const insert: Database["public"]["Tables"]["lines"]["Insert"] = {
      number: data.number,
      plan: data.plan ?? "",
      total_gb: data.totalGb ?? 130,
      status: data.status ?? "ativa",
      cycle_closing_day: data.closingDay ?? 1,
      cycle_renewal_day: data.renewalDay ?? 2,
      client_name: data.clientName ?? null,
      group_name: data.groupName ?? null,
      iccid: data.iccid ?? null,
      activation_date: data.activationDate ?? null,
      monthly_value: data.monthlyValue ?? null,
      due_day: data.dueDay ?? null,
      payment_method: data.paymentMethod ?? null,
      vivo_repass: data.vivoRepass ?? null,
      repass: data.repass ?? null,
      acerto: data.acerto ?? null,
    };

    const { error } = await supabase.from("lines").insert(insert);
    if (error) throw new Error(error.message);
    // tambem marca na available_lines
    await supabase.from("available_lines").upsert({ number: data.number, linked: true }, { onConflict: "number" });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin: CRUD de fornecedores (suppliers)
// ---------------------------------------------------------------------------
export const adminListSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { data: suppliers, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return suppliers ?? [];
  });

export const adminCreateSupplier = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(200),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { data: supplier, error } = await supabase
      .from("suppliers")
      .insert({ name: data.name, email: data.email ?? null, phone: data.phone ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return supplier;
  });

export const adminUpdateSupplier = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const update: Database["public"]["Tables"]["suppliers"]["Update"] = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.email !== undefined) update.email = data.email;
    if (data.phone !== undefined) update.phone = data.phone;

    const { error } = await supabase.from("suppliers").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSupplier = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { error } = await supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function mapLine(l: LineRow, t: ThresholdRow | null): ClientLine {
  return {
    id: l.id,
    number: l.number,
    used: Number(l.used_gb),
    total: Number(l.total_gb),
    bonusGb: Number(l.bonus_gb ?? 0),
    plan: l.plan,
    cycleDays: daysUntilCycleEnd(l.cycle_closing_day),
    status: l.status,
    closingDay: l.cycle_closing_day,
    renewalDay: l.cycle_renewal_day,
    vivoPortalUrl: l.vivo_portal_url,
    lastScrapedAt: l.last_scraped_at,
    clientName: l.client_name ?? null,
    groupName: l.group_name ?? null,
    iccid: l.iccid ?? null,
    activationDate: l.activation_date ?? null,
    monthlyValue: l.monthly_value == null ? null : Number(l.monthly_value),
    dueDay: l.due_day ?? null,
    paymentMethod: l.payment_method ?? null,
    vivoRepass: l.vivo_repass == null ? null : Number(l.vivo_repass),
    repass: l.repass == null ? null : Number(l.repass),
    acerto: l.acerto ?? null,
    paymentStatus: l.payment_status ?? "a_pagar",
    paymentPaidAt: l.payment_paid_at ?? null,
    threshold: t
      ? { warnPct: Number(t.warn_pct), warnGb: t.warn_gb == null ? null : Number(t.warn_gb), enabled: t.enabled }
      : null,
  };
}

function daysUntilCycleEnd(closingDay: number, today = new Date()): number {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const next = d > closingDay ? new Date(y, m + 1, closingDay) : new Date(y, m, closingDay);
  const ms = next.getTime() - new Date(y, m, d).getTime();
  const days = Math.round(ms / 86400000);
  return days === 0 ? 0 : days + 1;
}
