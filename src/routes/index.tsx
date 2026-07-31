import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  User,
  Grid3x3,
  FileText,
  ChevronRight,
  Plus,
  X,
  Check,
  Phone,
  MessageSquare,
  Wifi,
  RefreshCw,
  ArrowUpCircle,
  Sparkles,
  AlertTriangle,
  Mail,
  Unlock,
  Gauge,
  Copy,
  QrCode,
  LogOut,
  Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyLines, type ClientLine, type LineStatus } from "@/lib/api/lines.functions";
import { registerServiceWorkerAndPush } from "@/lib/push";

import familyImgAsset from "@/assets/woman-phone.png.asset.json";
import icon3dData from "@/assets/icon-3d-data.png";
import icon3dPhone from "@/assets/icon-3d-phone.png";
import statusAtivaAsset from "@/assets/status-ativa-v2.png.asset.json";
import statusReduzidaAsset from "@/assets/status-reduzida-v2.png.asset.json";
import statusBloqueadaAsset from "@/assets/status-bloqueada-v2.png.asset.json";
import statusAguardandoAsset from "@/assets/status-aguardando-v2.png.asset.json";

import upgradeArrowTransparent from "@/assets/upgrade-arrow-3d-transparent.png";

const statusAtivaIcon = statusAtivaAsset.url;
const statusReduzidaIcon = statusReduzidaAsset.url;
const statusBloqueadaIcon = statusBloqueadaAsset.url;
const statusAguardandoIcon = statusAguardandoAsset.url;
const upgradeArrowIcon = upgradeArrowTransparent;
import icon3dSms from "@/assets/icon-3d-sms.png";
import icon3dAutorenew from "@/assets/icon-3d-autorenew.png";
import icon3dBonus from "@/assets/icon-3d-bonus.png";
import icon3dAlert from "@/assets/icon-3d-alert.png";
import icon3dPie from "@/assets/icon-3d-pie.png";
import icon3dDisk from "@/assets/icon-3d-disk.png";
const familyImg = familyImgAsset.url;

const PRELOAD_ICONS = [
  icon3dData,
  icon3dPhone,
  icon3dSms,
  icon3dAutorenew,
  icon3dBonus,
  icon3dAlert,
];


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Resumo de Consumo | Vivo" },
      {
        name: "description",
        content: "Acompanhe seu consumo de dados Vivo Móvel em tempo real.",
      },
    ],
    links: PRELOAD_ICONS.map((href) => ({ rel: "preload", as: "image", href })),
  }),
  beforeLoad: async () => {
    // No SSR (server) não há localStorage; skip — o componente verifica no cliente.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: ResumoConsumo,
});

type Line = ClientLine;

// O ciclo renova no dia 2 (zera a franquia) e fecha no dia 1.
// Calcula dias até o fim do ciclo (dia 1), contando o dia atual inclusivamente.
function daysUntilCycleEnd(closingDay = 1, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  // Se já passou do dia de fechamento, o próximo fim é no mês seguinte.
  const next = d > closingDay ? new Date(y, m + 1, closingDay) : new Date(y, m, closingDay);
  const ms = next.getTime() - new Date(y, m, d).getTime();
  const days = Math.round(ms / 86400000);
  // Contagem inclusiva: hoje conta como o primeiro dia restante.
  return days === 0 ? 0 : days + 1;
}

// Calcula a data da próxima renovação (dia 2) no formato DD/MM.
function nextRenewalDate(renewalDay = 2, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  // Se ainda não passou do dia de renovação, é este mês; senão, é o próximo.
  const next = d >= renewalDay ? new Date(y, m + 1, renewalDay) : new Date(y, m, renewalDay);
  return `${String(next.getDate()).padStart(2, "0")}/${String(next.getMonth() + 1).padStart(2, "0")}`;
}

// Progress arc color: green → yellow → orange → red as it fills toward 100%
function ringColor(pct: number) {
  if (pct >= 95) return "#ff2a2a"; // red
  if (pct >= 75) return "#ff7a18"; // orange
  if (pct >= 45) return "#f4c20d"; // yellow
  return "#7ec832"; // green
}

function formatGB(gb: number) {
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const;
}
function lerpColor(a: string, b: string, t: number) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
// Tip color interpolated across the full 0-100% spectrum so the arc tip
// shifts smoothly green → yellow → orange → red as consumption grows.
function tipColor(pct: number) {
  const p = Math.min(100, Math.max(0, pct));
  if (p <= 50) return lerpColor("#7ec832", "#f4c20d", p / 50);
  if (p <= 80) return lerpColor("#f4c20d", "#ff7a18", (p - 50) / 30);
  return lerpColor("#ff7a18", "#ff2a2a", (p - 80) / 20);
}

function ConsumoRing({
  line,
}: {
  line: Line;
}) {
  const pct = line.total > 0 ? Math.min(100, (line.used / line.total) * 100) : 0;

  // Gauge geometry — semicircular speedometer, 240° sweep
  const size = 260;
  const cx = size / 2;
  const cy = 150;
  const r = 105;
  const strokeW = 14;
  // Sweep from -120° (left-bottom) through 0° (top) to +120° (right-bottom)
  const SWEEP = 240;
  const START = -120; // degrees
  const angleAt = (percent: number) => START + (percent / 100) * SWEEP;

  // Convert gauge angle (0° = up, clockwise) to xy
  const polar = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
  };
  const arcPath = (fromDeg: number, toDeg: number, radius: number) => {
    const a = polar(fromDeg, radius);
    const b = polar(toDeg, radius);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  // Full colored arc: green→yellow→orange→red split into many tiny segments
  const STEPS = 100;
  const segments = Array.from({ length: STEPS }, (_, i) => {
    const fromPct = (i / STEPS) * 100;
    const toPct = ((i + 1) / STEPS) * 100;
    return {
      d: arcPath(angleAt(fromPct), angleAt(toPct) + 0.6, r),
      color: tipColor((fromPct + toPct) / 2),
    };
  });

  // Ticks
  const majorTicks = 11; // at 0, 10, 20 ... 100
  const minorTicks = 41; // between majors

  // Needle — starts at 0% and animates up to the real value on mount so the
  // gauge feels like it's "spinning up" every time the user lands on the page.
  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    setAnimPct(0);
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic for a smooth spin-up
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimPct(pct * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const needleAngle = angleAt(animPct);
  const needleTipY = cy - (r - 8);
  // 3D needle geometry — a slim triangular blade with a separate left/right
  // face so we can shade each side to fake volume.
  const nBaseHalf = 5;
  const needleLeftPath = `M ${cx - nBaseHalf} ${cy} L ${cx} ${needleTipY} L ${cx} ${cy} Z`;
  const needleRightPath = `M ${cx} ${cy} L ${cx} ${needleTipY} L ${cx + nBaseHalf} ${cy} Z`;
  const needleGlossPath = `M ${cx - 1.2} ${cy - 4} L ${cx} ${needleTipY + 6} L ${cx + 1.2} ${cy - 4} Z`;

  // Consumed tip dot at the end of the actual consumption (also rotated)
  const tipX = cx;
  const tipY = cy - r;
  const tipCol = tipColor(pct);

  const gid = line.number.replace(/\D/g, "");

  return (
    <div className="relative h-[240px] w-[260px] shrink-0">
      <svg
        viewBox={`0 0 ${size} 210`}
        className="absolute left-0 top-0 h-[210px] w-full"
        style={{ shapeRendering: "geometricPrecision" }}
      >
        <defs>
          <radialGradient id={`hub-${gid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="55%" stopColor="#7b1fa2" />
            <stop offset="100%" stopColor="#4a0072" />
          </radialGradient>
          <linearGradient id={`needleLeft-${gid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a0140" />
            <stop offset="60%" stopColor="#4a0072" />
            <stop offset="100%" stopColor="#7a1fb8" />
          </linearGradient>
          <linearGradient id={`needleRight-${gid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="55%" stopColor="#7b1fa2" />
            <stop offset="100%" stopColor="#3a005c" />
          </linearGradient>
          <linearGradient id={`needleGloss-${gid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`hubHi-${gid}`} cx="35%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#e9d5ff" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
          <filter id={`gaugeShadow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000" floodOpacity="0.35" />
          </filter>
          <linearGradient id={`bezelOuter-${gid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b8b8bf" />
            <stop offset="100%" stopColor="#f4f4f7" />
          </linearGradient>
          <linearGradient id={`bezelInner-${gid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5a5a62" />
            <stop offset="100%" stopColor="#dcdce2" />
          </linearGradient>
        </defs>

        {/* 3D bezel — outer highlight ring */}
        <path
          d={arcPath(START, START + SWEEP, r + strokeW / 2 + 2)}
          fill="none"
          stroke={`url(#bezelOuter-${gid})`}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Background track (recessed) */}
        <path
          d={arcPath(START, START + SWEEP, r)}
          fill="none"
          stroke="#d8d8de"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Inner shadow rim inside the arc for depth */}
        <path
          d={arcPath(START, START + SWEEP, r - strokeW / 2 - 1)}
          fill="none"
          stroke={`url(#bezelInner-${gid})`}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.55}
        />

        {/* Colored arc (full) */}
        {segments.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeLinecap={i === 0 || i === segments.length - 1 ? "round" : "butt"}
          />
        ))}

        {/* Top gloss highlight over colored arc */}
        <path
          d={arcPath(START, START + SWEEP, r + strokeW / 2 - 2)}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.35}
        />

        {/* Ticks */}
        {Array.from({ length: minorTicks }).map((_, i) => {
          const deg = START + (i / (minorTicks - 1)) * SWEEP;
          const p1 = polar(deg, r - strokeW / 2 - 3);
          const p2 = polar(deg, r - strokeW / 2 - 9);
          return (
            <line
              key={`m-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#bdbdc4"
              strokeWidth={1}
            />
          );
        })}
        {Array.from({ length: majorTicks }).map((_, i) => {
          const deg = START + (i / (majorTicks - 1)) * SWEEP;
          const p1 = polar(deg, r - strokeW / 2 - 2);
          const p2 = polar(deg, r - strokeW / 2 - 13);
          return (
            <line
              key={`M-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#8a8a90"
              strokeWidth={2}
            />
          );
        })}

        {/* Rotating group: needle + consumed tip dot. Animates smoothly
            when the consumption percentage changes. */}
        <g
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transformBox: "view-box",
            transition: "transform 1800ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}
        >
          {/* Consumed tip cap (small dot at needle position on arc) */}
          {pct > 0 && (
            <>
              <circle cx={tipX} cy={tipY} r={strokeW / 2 + 1} fill={tipCol} filter={`url(#gaugeShadow-${gid})`} />
              <circle cx={tipX} cy={tipY} r={2} fill="#fff" />
            </>
          )}

          {/* 3D Needle — two shaded faces + glossy specular strip */}
          <g filter={`url(#gaugeShadow-${gid})`}>
            <path d={needleLeftPath} fill={`url(#needleLeft-${gid})`} />
            <path d={needleRightPath} fill={`url(#needleRight-${gid})`} />
            {/* central seam highlight to sell the ridge */}
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={needleTipY}
              stroke="#e9d5ff"
              strokeWidth={0.7}
              opacity={0.85}
            />
            {/* glossy specular on the right face */}
            <path d={needleGlossPath} fill={`url(#needleGloss-${gid})`} opacity={0.55} />
          </g>
        </g>

        {/* Hub (3D pivot) — layered for depth */}
        <circle cx={cx} cy={cy} r={15} fill="#1a0033" opacity={0.35} filter={`url(#gaugeShadow-${gid})`} />
        <circle cx={cx} cy={cy} r={13} fill={`url(#hub-${gid})`} />
        <circle cx={cx} cy={cy} r={13} fill={`url(#hubHi-${gid})`} />
        <circle cx={cx} cy={cy} r={6} fill="#2a0140" />
        <circle cx={cx - 1.5} cy={cy - 1.5} r={1.8} fill="#e9d5ff" opacity={0.95} />
        <circle cx={cx + 3} cy={cy + 3} r={1.2} fill="#000" opacity={0.35} />
      </svg>

      {/* Big value + subtitle — pushed up a bit so it sits above the arc tips. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center">
        <div className="text-[30px] font-bold leading-none text-[#1a1a1a]">
          {((animPct / 100) * line.total).toFixed(2)}
          <span className="ml-1 text-base font-semibold text-[#1a1a1a]">GB</span>
        </div>
        <div className="mt-1 text-[11px] text-[#6b6b6b]">
          consumidos de{" "}
          <span className="font-bold text-[#660099]">{line.total} GB</span>
        </div>
      </div>
    </div>
  );
}




function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-none w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-[480px] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#eee] bg-white px-6 py-4">
          <h3 className="text-lg font-semibold text-[#660099]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1 text-[#666] hover:bg-[#f3eaf7] hover:text-[#660099]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-[#eee] bg-white px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const iconPreloadCache = new Map<string, Promise<void>>();

function preloadIcon(src: string) {
  const cached = iconPreloadCache.get(src);
  if (cached) return cached;

  if (typeof window === "undefined") return Promise.resolve();

  const promise = new Promise<void>((resolve) => {
    const img = new window.Image();
    const finish = () => {
      const decoded = img.decode?.();
      if (decoded) {
        decoded.catch(() => undefined).finally(resolve);
      } else {
        resolve();
      }
    };

    img.decoding = "sync";
    img.onload = finish;
    img.onerror = () => resolve();
    img.src = src;

    if (img.complete) finish();
  });

  iconPreloadCache.set(src, promise);
  return promise;
}

function preloadAllIcons() {
  return Promise.all(PRELOAD_ICONS.map(preloadIcon));
}

function ResumoConsumo() {
  const [lineIdx, setLineIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);
  const [iconsReady, setIconsReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<"dados" | "minutos" | "sms" | null>("dados");
  const [historyTab, setHistoryTab] = useState<"consumo" | "vivobis">("consumo");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhats, setNotifyWhats] = useState(true);
  const [notifySms, setNotifySms] = useState(true);
  const [autoDebit, setAutoDebit] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmAutoDebit, setConfirmAutoDebit] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [simStatus, setSimStatus] = useState<LineStatus | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const pixCode = "00020126580014BR.GOV.BCB.PIX0136vivo-fatura-8f2a-4c11-9e0b520400005303986540589.905802BR5915VIVO TELEFONICA6008SAO PAULO62070503***6304A1B2";

  // --- Dados reais do Supabase ---
  const [lines, setLines] = useState<ClientLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [now, setNow] = useState(() => new Date());
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  async function loadLines() {
    try {
      setLoadError(null);
      const data = await getMyLines();
      setLines(data);
      setLastRefresh(new Date());
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        setProfileName(
          (u.user.user_metadata?.name as string) || u.user.email?.split("@")[0] || "",
        );
        const { data: prof } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", u.user.id)
          .single();
        setIsAdmin(prof?.is_admin ?? false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar linhas");
    }
  }

  useEffect(() => {
    let mounted = true;
    preloadAllIcons().then(() => {
      if (mounted) setIconsReady(true);
    });
    // Verifica auth no cliente (cobre acesso direto via URL / full page reload)
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      loadLines();
    })();
    // PWA: registra service worker + push notifications
    registerServiceWorkerAndPush();
    // Atualiza a cada 60s (o scraper roda a cada 5 min; o cliente vê "atualizado há X")
    const interval = window.setInterval(loadLines, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // Loading / empty / error states
  if (lines === null && !loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-[#660099] border-t-transparent" />
          <p className="text-sm text-[#888]">Carregando seu consumo…</p>
        </div>
      </div>
    );
  }

  if (loadError && lines === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <p className="text-sm text-[#555]">{loadError}</p>
          <button
            onClick={loadLines}
            className="mt-4 rounded-md bg-[#660099] px-4 py-2 text-sm font-medium text-white hover:bg-[#7a00b8]"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (lines && lines.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
        <div className="max-w-md text-center">
          <Phone className="mx-auto mb-3 h-10 w-10 text-[#660099]" />
          <h1 className="text-lg font-semibold text-[#333]">Nenhuma linha vinculada</h1>
          <p className="mt-2 text-sm text-[#888]">
            {isAdmin
              ? "Cadastre linhas no painel administrativo."
              : "Entre em contato com o seu vendedor para vincular suas linhas."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {isAdmin && (
              <Link
                to="/admin"
                className="rounded-md bg-[#660099] px-4 py-2 text-sm font-medium text-white hover:bg-[#7a00b8]"
              >
                Ir para o painel admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="rounded-md border border-[#ddd] px-4 py-2 text-sm font-medium text-[#555] hover:bg-[#f3f3f3]"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  const safeLineIdx = lines ? Math.min(lineIdx, lines.length - 1) : 0;
  const baseLine = lines![safeLineIdx];
  const bonusDebito = autoDebit ? 25 : 0;
  // Se total_gb for 0 (scraper ainda nao preencheu), usa um default para evitar divisao por zero
  const safeTotal = baseLine.total > 0 ? baseLine.total : 50;
  const franquiaTotal = safeTotal + bonusDebito;

  // Real-time consumption simulation:
  // increments live usage every few seconds so the ring updates in tempo real.
  // Ao atingir 100% da franquia, o excedente é debitado do Vivo Bis do mês anterior.
  // O ciclo fecha dia 1 e renova dia 2. Até o dia 1 ainda estamos no ciclo
  // que iniciou no dia 2 do mês anterior — então o "mês atual" para efeito
  // de histórico e Vivo Bis é o mês anterior do calendário.
  const _today = new Date();
  const _cycleAnchor =
    _today.getDate() <= 1
      ? new Date(_today.getFullYear(), _today.getMonth() - 1, 2)
      : new Date(_today.getFullYear(), _today.getMonth(), 2);
  const currentYear = _cycleAnchor.getFullYear();
  const currentMonth = _cycleAnchor.getMonth(); // 0-11 (mês do ciclo)

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const consumoAnterior = [
    20.9, 16.3, 25.1, 18.7, 22.4, 19.3,
    23.8, 19.5, 21.2, 17.4, 24.1, 15.6,
  ];
  const prevIdx = (currentMonth - 1 + 12) % 12;
  const sobrouAnterior = Math.max(
    0,
    franquiaTotal - consumoAnterior[prevIdx],
  );

  // Consumo estático — sobe apenas na animação de entrada e para no valor real.
  const simExtra = 0;


  const rawUsed = +(baseLine.used + simExtra).toFixed(2);
  const liveUsed = Math.min(rawUsed, franquiaTotal + sobrouAnterior);
  const bisUsed = +Math.max(0, liveUsed - franquiaTotal).toFixed(2);
  const usedInFranquia = Math.min(liveUsed, franquiaTotal);

  const line: Line = { ...baseLine, used: usedInFranquia, total: franquiaTotal };
  const pct = franquiaTotal > 0 ? Math.min(100, (line.used / line.total) * 100) : 0;
  const available = franquiaTotal > 0 ? +(line.total - line.used).toFixed(2) : 0;
  const availPct = Math.round(100 - pct);
  const usedPct = Math.round(pct);
  const usedPctExact = (Math.round(pct * 100) / 100).toFixed(2);
  const availPctExact = (Math.round((100 - pct) * 100) / 100).toFixed(2);
  const color = ringColor(pct);

  useEffect(() => {
    const scheduleMidnight = () => {
      const n = new Date();
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
      return window.setTimeout(() => {
        setNow(new Date());
        timer = scheduleMidnight();
      }, next.getTime() - n.getTime());
    };
    let timer = scheduleMidnight();
    const onFocus = () => setNow(new Date());
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setLastUpdated(new Date());
    const interval = window.setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastUpdatedDate = `${pad(lastUpdated.getDate())}/${pad(lastUpdated.getMonth() + 1)}/${lastUpdated.getFullYear()}`;
  const lastUpdatedTime = `${pad(lastUpdated.getHours())}:${pad(lastUpdated.getMinutes())}`;

  const cycleDaysLeft = daysUntilCycleEnd(1, now);
  const cycleLabel =
    cycleDaysLeft === 0
      ? "hoje"
      : `em ${cycleDaysLeft} ${cycleDaysLeft === 1 ? "dia" : "dias"}`;
  const renewalDateLabel = nextRenewalDate(2, now);


  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function openAfterIconsReady(openModal: () => void) {
    // Icons are preloaded on mount and via <link rel="preload"> in <head>,
    // so open immediately to keep transitions instant. Kick off a background
    // preload as a safety net without blocking the modal open.
    openModal();
    if (!iconsReady) {
      preloadAllIcons().then(() => setIconsReady(true));
    }
  }

  const consumoSimulado = [
    20.9, 16.3, 25.1, 18.7, 22.4, line.used,
    23.8, 19.5, 21.2, 17.4, 24.1, 15.6,
  ];


  const months = monthNames
    .map((nome, i) => ({
      mes: `${nome}/${currentYear}`,
      consumo: consumoSimulado[i],
      status: i === currentMonth ? "Em andamento" : "Fechado",
      idx: i,
    }))
    .filter((m) => m.idx <= currentMonth);



  const plans = [
    { id: "sv50", nome: "SmartVoz 50GB", giga: "50 GB", preco: "R$ 99,90/mês", bonus: "+ Apps ilimitados" },
    { id: "sv80", nome: "SmartVoz 80GB", giga: "80 GB", preco: "R$ 124,90/mês", bonus: "+ Disney+ incluso" },
    { id: "sv100", nome: "SmartVoz 100GB", giga: "100 GB", preco: "R$ 149,90/mês", bonus: "+ Netflix + Disney+" },
    
  ];

  return (
    <div className="min-h-screen bg-[#f3f3f3]">

      {/* Top bar: perfil, seletor de linha, atualizar, alertas, logout */}
      <header className="sticky top-0 z-30 border-b border-[#eee] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-2 py-2 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#660099] text-sm font-bold text-white">
              {profileName ? profileName.charAt(0).toUpperCase() : "V"}
            </div>
            <span className="hidden text-sm font-medium text-[#333] sm:inline">
              {profileName || "Conta"}
            </span>
          </div>

          {lines && lines.length > 1 && (
            <select
              value={safeLineIdx}
              onChange={(e) => setLineIdx(Number(e.target.value))}
              className="ml-1 rounded-md border border-[#ddd] bg-white px-2 py-1 text-sm text-[#333] focus:border-[#660099] focus:outline-none"
              aria-label="Selecionar linha"
            >
              {lines.map((l, i) => (
                <option key={l.id} value={i}>
                  {l.number} — {l.plan}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={loadLines}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[#555] hover:bg-[#f3f3f3]"
              title={`Atualizado ${lastRefresh.toLocaleTimeString("pt-BR")}`}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[#660099] hover:bg-[#660099]/10"
                title="Painel administrativo"
              >
                <Grid3x3 className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[#555] hover:bg-[#f3f3f3]"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-2 pt-6 pb-16 md:px-6 md:pt-8">
        <h1 className="text-[32px] font-semibold leading-tight text-[#660099] md:text-[42px]">
          Resumo de Consumo
        </h1>
        <p className="mt-1 text-sm text-[#666]">
          Informação atualizada em{" "}
          <span suppressHydrationWarning className="font-semibold text-[#333]">{lastUpdatedDate}</span> às{" "}
          <span suppressHydrationWarning className="font-semibold text-[#333]">{lastUpdatedTime}</span>
          {baseLine.lastScrapedAt && (
            <span className="text-[#999]">
              {" "}(scraper: há {Math.round((Date.now() - new Date(baseLine.lastScrapedAt).getTime()) / 60000)} min)
            </span>
          )}

        </p>


        {/* Hero card */}
        <section className="relative mt-6 overflow-hidden rounded-md">
          <img
            src={familyImg}
            alt="Família usando tablet"
            width={1280}
            height={768}
            className="h-[360px] w-full object-cover object-[60%_20%] md:h-[520px]"
          />

          {/* Consumption panel overlay - centered/right like reference */}
          <div
            className="relative -mt-24 overflow-hidden rounded-md p-3 pb-10 md:absolute md:right-10 md:top-10 md:mx-0 md:mt-0 md:w-[640px] md:translate-y-0 md:px-9 md:py-6 md:pb-9"
            style={{
              background: "rgba(255,255,255,0.74)",
              backdropFilter: "blur(6px)",
              boxShadow:
                "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            {/* Gray diagonal triangle in the corner with + near the tip */}
            <button
              aria-label="Ver histórico de consumo"
              onClick={() => openAfterIconsReady(() => setExpandOpen(true))}
              className="group absolute bottom-0 right-0 h-10 w-10 text-[#660099] md:h-12 md:w-12"
              style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
            >
              <span className="absolute inset-0 bg-[#d9d9d9] transition-colors duration-200 group-hover:bg-[#e8e8e8]" />
              <Plus
                className="absolute bottom-1 right-1 h-4 w-4 transition-transform duration-200 group-hover:scale-110"
                strokeWidth={2.75}
              />
            </button>
            <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-center md:gap-2">
              <div className="self-center md:-ml-3 md:self-auto"><ConsumoRing line={line} /></div>

              <div className="w-full md:w-[340px]">



                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold tracking-wide text-[#1a1a1a]">
                    {baseLine.plan}
                  </h2>
                  {bonusDebito > 0 && (
                    <span className="inline-flex items-center rounded-full bg-[#16a34a]/15 px-2 py-0.5 text-[10px] font-semibold text-[#15803d] ring-1 ring-[#16a34a]/30 animate-fade-in">
                      +{bonusDebito}GB liberado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[#5a5a5a]">
                  Fim do ciclo{" "}
                  <span className="font-semibold text-[#1a1a1a]">{cycleLabel}</span>
                </p>
                <p className="mt-0.5 text-sm text-[#5a5a5a]">
                  Próxima renovação:{" "}
                  <span className="font-semibold text-[#1a1a1a]">{renewalDateLabel}</span>
                </p>

                <ul className="mt-5 -ml-2 space-y-2.5 text-sm">
                  <li>
                    <div className="flex items-center gap-2">
                      <img
                        src={icon3dPie}
                        alt=""
                        loading="eager"
                        decoding="sync"
                        className="h-10 w-10 shrink-0 object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                          <span className="font-semibold text-[#1a1a1a]">Meu Consumo</span>
                          <span className="text-[13px]">
                            <span className="font-bold text-[#660099]">{usedPctExact}%</span>
                            <span className="text-[#8a8a90]"> - </span>
                            <span className="font-bold text-[#1a1a1a]">{line.used.toFixed(2)} GB</span>
                          </span>
                        </div>

                        <div className="relative mt-1.5 h-1.5 w-full overflow-visible rounded-full bg-[#ececef]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${usedPct}%`,
                              background:
                                "linear-gradient(90deg,#7ec832 0%,#f4c20d 45%,#ff7a18 75%,#ff2a2a 100%)",
                              transition: "width 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                            }}
                          />
                          <div
                            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white"
                            style={{
                              left: `calc(${Math.max(0, Math.min(100, usedPct))}% - 6px)`,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(0,0,0,0.06)",
                              transition: "left 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                  <li>
                    <div className="flex items-center gap-2">
                      <img
                        src={icon3dDisk}
                        alt=""
                        loading="eager"
                        decoding="sync"
                        className="h-10 w-10 shrink-0 object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                          <span className="font-semibold text-[#1a1a1a]">Disponíveis</span>
                          <span className="text-[13px]">
                            <span className="font-bold text-[#660099]">{availPctExact}%</span>
                            <span className="text-[#8a8a90]"> - </span>
                            <span className="font-bold text-[#1a1a1a]">{available.toFixed(2)} GB</span>
                          </span>
                        </div>

                        <div className="relative mt-1.5 h-1.5 w-full overflow-visible rounded-full bg-[#ececef]">
                          <div
                            className="h-full rounded-full bg-[#660099]"
                            style={{
                              width: `${availPct}%`,
                              transition: "width 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                            }}
                          />
                          <div
                            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white"
                            style={{
                              left: `calc(${Math.max(0, Math.min(100, availPct))}% - 6px)`,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(0,0,0,0.06)",
                              transition: "left 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>


                {/* Renovação automática (integrada, sem card) */}
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 pt-0.5">
                    <span className="text-sm font-semibold text-[#1a1a1a]">Renovação automática</span>
                    <div className="mt-2.5 space-y-0.5">
                      {autoDebit ? (
                        <div
                          className="text-[11px] font-semibold text-[#660099] transition-all duration-500"
                          style={{ opacity: 1, transform: 'translateY(0)' }}
                        >
                          Débito automático ativo
                        </div>
                      ) : (
                        <div className="text-[11px] font-medium text-[#666] transition-all duration-500">
                          Ative e ganhe +25GB de bônus
                        </div>
                      )}

                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoDebit}
                    onClick={() => {
                      openAfterIconsReady(() => setConfirmAutoDebit(true));
                    }}
                    className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ${
                      autoDebit ? "bg-[#16a34a]" : "bg-[#bfbfbf]"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-300 ${
                        autoDebit ? "translate-x-[22px]" : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </div>


                <button
                  onClick={() => openAfterIconsReady(() => setDetailsOpen(true))}
                  className="mt-4 text-sm font-semibold text-[#660099] hover:underline md:mt-8"
                >
                  Ver detalhes do seu consumo &gt;
                </button>

                {(() => {
                  const effective: LineStatus =
                    simStatus ?? baseLine.status;
                  const map: Record<LineStatus, { icon: string; label: string; tone: string }> = {
                    ativa: { icon: statusAtivaIcon, label: "Ativa", tone: "#16A34A" },
                    reduzida: { icon: statusReduzidaIcon, label: "Velocidade reduzida", tone: "#F97316" },
                    bloqueada_fatura: { icon: statusBloqueadaIcon, label: "Bloqueada por fatura", tone: "#DC2626" },
                    bloqueada_pagamento: { icon: statusBloqueadaIcon, label: "Bloqueada por pagamento", tone: "#DC2626" },
                    aguardando: { icon: statusAguardandoIcon, label: "Aguardando", tone: "#6B7280" },
                  };
                  const s = map[effective];
                  return (
                    <button
                      onClick={() => openAfterIconsReady(() => setStatusOpen(true))}
                      className="mt-3 flex w-full items-center gap-x-2 text-left text-[12px] font-semibold transition hover:underline md:-ml-2 md:mt-5 md:text-[13px]"
                      style={{ color: s.tone }}
                    >
                      <img
                        src={s.icon}
                        alt={s.label}
                        className="h-5 w-5 shrink-0 object-contain"
                      />
                      <span className="whitespace-nowrap">
                        Status da linha: {s.label}
                        {effective === "reduzida" && (
                          <span className="ml-1.5 text-xs font-bold">256 Kbps</span>
                        )}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>


            {/* Realtime footer */}
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#6b6b6b]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z" fill="#660099" opacity="0.85" />
                <path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Os dados são atualizados em tempo real.
            </div>
          </div>




        </section>


        
      </main>

      {/* Details modal */}
      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Detalhes do seu consumo"
      >
        <div className="space-y-4">
          <div className="py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#444]">
              Linha
            </div>
            <div className="mt-1 text-[22px] font-bold tracking-tight text-[#660099]">
              {line.number}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "dados" as const, icon: icon3dData, label: "Dados", value: `${line.total} GB` },
              { key: "minutos" as const, icon: icon3dPhone, label: "Minutos", value: "Ilimitado" },
              { key: "sms" as const, icon: icon3dSms, label: "SMS", value: "Ilimitado" },
            ].map((card) => {
              const active = activeCard === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setActiveCard(active ? null : card.key)}
                  className="rounded-xl p-3 text-center transition"
                  style={{
                    background: active
                      ? "rgba(102,0,153,0.04)"
                      : "#ffffff",
                    border: active
                      ? "1px solid rgba(102,0,153,0.25)"
                      : "1px solid rgba(0,0,0,0.06)",
                    boxShadow: active
                      ? "0 0 18px -6px rgba(102,0,153,0.25)"
                      : "0 2px 8px -4px rgba(0,0,0,0.08)",
                  }}
                >
                  <img
                    src={card.icon}
                    alt=""
                    loading="eager" decoding="sync" fetchPriority="high"
                    width={64}
                    height={64}
                    className="mx-auto h-16 w-16 object-contain"
                  />
                  <div className="mt-1.5 text-[11px] font-medium text-[#660099]">{card.label}</div>
                  <div className="text-[13px] font-bold text-[#1a1a1a]">{card.value}</div>
                </button>
              );
            })}
          </div>




          <div>
            {/* Tabs */}
            <div
              className="relative mb-3 grid grid-cols-2 rounded-full p-1"
              style={{
                background: "rgba(102,0,153,0.06)",
                border: "1px solid rgba(102,0,153,0.10)",
              }}
            >
              {/* Sliding indicator */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white transition-transform duration-300 ease-out"
                style={{
                  transform:
                    historyTab === "vivobis"
                      ? "translateX(100%)"
                      : "translateX(0%)",
                  boxShadow: "0 2px 6px -2px rgba(102,0,153,0.25)",
                }}
              />
              <button
                type="button"
                onClick={() => setHistoryTab("consumo")}
                className="relative z-10 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={{
                  color: historyTab === "consumo" ? "#660099" : "#7a5a8f",
                }}
              >
                Meu consumo disponível
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab("vivobis")}
                className="relative z-10 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={{
                  color: historyTab === "vivobis" ? "#660099" : "#7a5a8f",
                }}
              >
                Vivo Bis
              </button>
            </div>


            {historyTab === "consumo" && (
              <>
                <div className="mb-2 text-sm font-semibold text-[#333]">
                  Histórico mensal
                </div>
                <ul className="divide-y divide-[#eee]">
                  {months
                    .slice()
                    .reverse()
                    .map((m) => {
                      const minutosVals = [820, 645, 712, 538, 690, 756, 623, 589, 701, 534, 678, 612];
                      const smsVals = [42, 31, 58, 24, 37, 45, 29, 51, 33, 48, 27, 40];
                      const i = m.idx;
                      const valor =
                        activeCard === "minutos"
                          ? `${minutosVals[i]} min`
                          : activeCard === "sms"
                            ? `${smsVals[i]} SMS`
                            : formatGB(m.consumo);
                      return (
                        <li
                          key={m.mes}
                          className="flex items-center justify-between py-2.5 text-sm"
                        >
                          <div>
                            <div className="text-[#333]">{m.mes}</div>
                            <div className="text-xs text-[#888]">{m.status}</div>
                          </div>
                          <div className="font-semibold text-[#660099]">{valor}</div>
                        </li>
                      );
                    })}
                </ul>
              </>
            )}

            {historyTab === "vivobis" && (
              <>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#333]">
                      Vivo Bis · Internet acumulativa
                    </div>
                    <div className="text-[11px] leading-snug text-[#888]">
                      A internet que sobra do seu plano fica disponível no mês seguinte, por 30 dias.
                    </div>
                  </div>
                </div>




                {/* Visual diagram: como funciona o Vivo Bis */}
                {(() => {
                  const franquia = line.total;
                  // Mostra o ciclo atual → próximo mês, refletindo a franquia
                  // consumida em tempo real. Se atingir 100%, não sobra Vivo Bis
                  // e o próximo mês fica sem bônus (apenas franquia).
                  const curUsado = Math.min(franquia, line.used);
                  const curSobrou = Math.max(0, franquia - curUsado);
                  const nextIdx = (currentMonth + 1) % 12;
                  const nextYear =
                    currentMonth === 11 ? currentYear + 1 : currentYear;
                  const prevMesNome = `${monthNames[currentMonth]}/${currentYear}`;
                  const curMesNome = `${monthNames[nextIdx]}/${nextYear}`;
                  const prevUsado = curUsado;
                  const prevSobrou = curSobrou;
                  // Heights proportional to franquia
                  const boxH = 132; // px total for franquia column
                  const sobrouH =
                    franquia > 0 ? (prevSobrou / franquia) * boxH : 0;
                  const usouH = boxH - sobrouH;
                  const bisH = sobrouH; // same GB carried

                  return (
                    <div className="mb-3 py-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#660099]">
                        Como funciona
                      </div>
                      <div className="flex items-end justify-center gap-6 pt-1">
                        {/* Franquia label */}
                        <div className="flex flex-col items-center justify-end pb-6 text-center">
                          <div className="text-[10px] leading-tight text-[#888]">
                            Franquia<br />mensal
                          </div>
                          <div className="mt-1 text-[13px] font-bold text-[#333]">
                            {formatGB(franquia)}
                          </div>
                        </div>

                        {/* 1º mês */}
                        <div className="flex flex-col items-center">
                          <div
                            className="w-[74px] overflow-hidden rounded-md shadow-sm"
                            style={{ height: boxH }}
                          >
                            {prevSobrou > 0 && (
                              <div
                                className="flex flex-col items-center justify-center text-white"
                                style={{
                                  height: sobrouH,
                                  background:
                                    "linear-gradient(180deg, #8ed14f, #6fb332)",
                                }}
                              >
                                <div className="text-[9px] font-semibold uppercase leading-none">
                                  Sobrou
                                </div>
                                <div className="mt-0.5 text-[12px] font-bold leading-none">
                                  {formatGB(prevSobrou)}
                                </div>
                              </div>
                            )}
                            <div
                              className="flex flex-col items-center justify-center text-white"
                              style={{
                                height: usouH,
                                background:
                                  "linear-gradient(180deg, #7b1fa2, #4a0072)",
                              }}
                            >
                              <div className="text-[9px] font-semibold uppercase leading-none">
                                Usou
                              </div>
                              <div className="mt-0.5 text-[12px] font-bold leading-none">
                                {formatGB(prevUsado)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 text-[10px] font-medium text-[#888]">
                            {prevMesNome}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div
                          className="pb-8 text-[#660099]"
                          aria-hidden
                          style={{ fontSize: 22, lineHeight: 1 }}
                        >
                          ↷
                        </div>

                        {/* 2º mês */}
                        <div className="flex flex-col items-center">
                          {prevSobrou > 0 && (
                            <div
                              className="mb-0.5 rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white"
                              style={{
                                background:
                                  "linear-gradient(90deg,#660099,#8e24aa)",
                              }}
                            >
                              Vivo Bis
                            </div>
                          )}
                          <div
                            className="w-[74px] overflow-hidden rounded-md shadow-sm"
                            style={{ height: boxH + bisH }}
                          >
                            {prevSobrou > 0 && (
                              <div
                                className="flex flex-col items-center justify-center text-white"
                                style={{
                                  height: bisH,
                                  background:
                                    "linear-gradient(180deg, #8ed14f, #6fb332)",
                                }}
                              >
                                <div className="text-[11px] font-bold leading-none">
                                  {formatGB(prevSobrou)}
                                </div>
                              </div>
                            )}
                            <div
                              className="flex flex-col items-center justify-center text-white"
                              style={{
                                height: boxH,
                                background:
                                  "linear-gradient(180deg, #7b1fa2, #4a0072)",
                              }}
                            >
                              <div className="text-[9px] font-semibold uppercase leading-none">
                                Franquia
                              </div>
                              <div className="mt-0.5 text-[13px] font-bold leading-none">
                                {formatGB(franquia)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 text-[10px] font-medium text-[#888]">
                            {curMesNome}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-center text-[10px] leading-snug text-[#7a5a8f]">
                        O que sobrou vira <strong>Vivo Bis</strong> e soma à
                        franquia do mês seguinte por 30 dias.
                      </div>
                    </div>
                  );
                })()}

                <div className="mb-2 text-sm font-semibold text-[#333]">
                  Histórico Vivo Bis

                </div>
                <ul className="divide-y divide-[#eee]">
                  {(() => {
                    // Projeção do próximo mês baseada no consumo em tempo real.
                    // Se a franquia atingir 100% neste ciclo, o Vivo Bis do
                    // próximo mês fica zerado ("Sem bônus").
                    const franquia = line.total;
                    const projSobrou = Math.max(0, franquia - line.used);
                    const nextIdx = (currentMonth + 1) % 12;
                    const nextYear =
                      currentMonth === 11 ? currentYear + 1 : currentYear;
                    const nextMesNome = `${monthNames[nextIdx]}/${nextYear}`;
                    const zerado = projSobrou <= 0;
                    const label = zerado ? "Sem bônus" : "Previsto";
                    const bg = zerado
                      ? "rgba(0,0,0,0.05)"
                      : "rgba(126,200,50,0.18)";
                    const color = zerado ? "#888" : "#3d7a12";
                    const tip = zerado
                      ? "Franquia 100% utilizada — não haverá Vivo Bis no próximo mês."
                      : "Projeção do Vivo Bis que será acumulado para o próximo mês.";
                    return (
                      <li className="flex items-center justify-between gap-2 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="text-[#333]">
                            {nextMesNome}
                            <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-[#888]">
                              Projeção
                            </span>
                          </div>
                          <div className="text-xs text-[#888]">
                            Sobra prevista deste mês: {formatGB(projSobrou)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="group relative">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ background: bg, color }}
                            >
                              {label}
                            </span>
                            <div
                              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-md px-2.5 py-1.5 text-[10px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
                              style={{ background: color }}
                            >
                              {tip}
                              <span
                                className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent"
                                style={{ borderTopColor: color }}
                              />
                            </div>
                          </div>
                          <div className="min-w-[52px] text-right font-semibold text-[#660099]">
                            {formatGB(projSobrou)}
                          </div>
                        </div>
                      </li>
                    );
                  })()}
                  {months
                    .slice()
                    .reverse()
                    .map((m) => {

                      const franquia = line.total;
                      const i = m.idx;
                      const prevIdx = i - 1;
                      const sobrouAnterior =
                        prevIdx >= 0
                          ? Math.max(0, franquia - consumoSimulado[prevIdx])
                          : 0;
                      const consumoMes = consumoSimulado[i];
                      const bisConsumido = Math.max(0, consumoMes - franquia);
                      const bisRestante = Math.max(
                        0,
                        sobrouAnterior - bisConsumido,
                      );
                      const isCurrent = i === currentMonth;

                      let statusLabel: string;
                      let statusBg: string;
                      let statusColor: string;
                      let statusTip: string;
                      if (sobrouAnterior === 0) {
                        statusLabel = "Sem bônus";
                        statusBg = "rgba(0,0,0,0.05)";
                        statusColor = "#888";
                        statusTip =
                          "Não havia sobra do mês anterior para acumular.";
                      } else if (isCurrent) {
                        statusLabel =
                          bisRestante > 0 ? "Disponível" : "Utilizado";
                        statusBg =
                          bisRestante > 0
                            ? "rgba(126,200,50,0.18)"
                            : "rgba(255,122,24,0.15)";
                        statusColor = bisRestante > 0 ? "#3d7a12" : "#b34e00";
                        statusTip =
                          bisRestante > 0
                            ? "O Vivo Bis deste mês está ativo e disponível para uso."
                            : "O Vivo Bis deste mês já foi totalmente consumido.";
                      } else if (bisConsumido >= sobrouAnterior) {
                        statusLabel = "Utilizado";
                        statusBg = "rgba(255,122,24,0.15)";
                        statusColor = "#b34e00";
                        statusTip =
                          "O Vivo Bis deste mês foi totalmente utilizado antes de expirar.";
                      } else {
                        statusLabel = "Expirado";
                        statusBg = "rgba(0,0,0,0.05)";
                        statusColor = "#888";
                        statusTip =
                          "O Vivo Bis do mês anterior expirou após 30 dias sem uso completo.";
                      }

                      return (
                        <li
                          key={m.mes}
                          className="flex items-center justify-between gap-2 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="text-[#333]">{m.mes}</div>
                            <div className="text-xs text-[#888]">
                              Sobrou do mês anterior: {formatGB(sobrouAnterior)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="group relative">
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{ background: statusBg, color: statusColor }}
                              >
                                {statusLabel}
                              </span>
                              <div
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-md px-2.5 py-1.5 text-[10px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
                                style={{ background: statusColor }}
                              >
                                {statusTip}
                                <span
                                  className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent"
                                  style={{ borderTopColor: statusColor }}
                                />
                              </div>
                            </div>
                            <div className="min-w-[52px] text-right font-semibold text-[#660099]">
                              {formatGB(sobrouAnterior)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </>
            )}

          </div>
        </div>
      </Modal>

      {/* Upgrade modal - premium glass */}
      {upgradeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 animate-fade-in sm:items-center sm:p-4"
          style={{ backdropFilter: "blur(4px)" }}
          onClick={() => {
            setUpgradeOpen(false);
            setSelectedPlan(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full max-h-none w-full max-w-none flex-col overflow-hidden rounded-none animate-scale-in sm:h-auto sm:max-h-[88vh] sm:max-w-[480px] sm:rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(14px)",
              boxShadow:
                "0 20px 60px -10px rgba(102,0,153,0.25), 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.5)",
            }}
          >

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#660099]/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <img
                  src={upgradeArrowIcon}
                  alt="Upgrade"
                  className="h-9 w-9 shrink-0 object-contain drop-shadow-sm"
                />
                <h3 className="text-lg font-semibold text-[#660099]">Upgrade de plano</h3>
              </div>
              <button
                onClick={() => {
                  setUpgradeOpen(false);
                  setSelectedPlan(null);
                }}
                aria-label="Fechar"
                className="rounded-full p-1.5 text-[#666] transition hover:bg-[#660099]/10 hover:text-[#660099]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-5 sm:px-6">
              <p className="mb-4 text-sm text-[#5a5a5a]">
                Escolha o melhor plano para você. A mudança entra em vigor no próximo ciclo.
              </p>
              <div className="space-y-3">
                {plans.map((p, idx) => {
                  const sel = selectedPlan === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlan(p.id)}
                      className={`group relative flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-all duration-300 animate-fade-in ${
                        sel
                          ? "border-[#660099] bg-white"
                          : "border-[#e8e8ee] bg-white hover:-translate-y-0.5 hover:border-[#cda8e0]"
                      }`}
                      style={{
                        animationDelay: `${idx * 60}ms`,
                        boxShadow: sel
                          ? "0 8px 24px -8px rgba(102,0,153,0.25), inset 0 1px 0 rgba(255,255,255,0.8)"
                          : "0 1px 2px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-[#1a1a1a]">{p.nome}</div>
                        <div className="mt-0.5 text-[11px] text-[#888]">{p.bonus}</div>
                        <div className="mt-2 text-sm font-semibold text-[#660099]">
                          {p.preco}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-[#999]">Internet</div>
                          <div className="text-base font-bold text-[#1a1a1a]">{p.giga}</div>
                        </div>
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                            sel
                              ? "bg-gradient-to-br from-[#660099] to-[#7a00b3] shadow-[0_0_0_4px_rgba(102,0,153,0.15)]"
                              : "border-2 border-[#d4d4d8] bg-white"
                          }`}
                        >
                          {sel && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl border border-[#e8e8ee] bg-white p-4">
                <div className="mb-1 text-sm font-semibold text-[#1a1a1a]">Receber confirmação por</div>
                <p className="mb-3 text-xs text-[#888]">A confirmação do upgrade será enviada para o seu e-mail.</p>
                <div className="flex items-center justify-between rounded-lg border border-[#ececf2] bg-white px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-[#333]">
                    <Mail className="h-4 w-4 text-[#660099]" />
                    <span className="font-medium">E-mail</span>
                    <span className="text-xs text-[#888]">(joeliaalmeidas@gmail.com)</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-[#16a34a]">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    Padrão
                  </span>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#660099]/10 bg-white/60 px-3 py-4 sm:px-6">
              <button
                disabled={!selectedPlan || (!notifyEmail && !notifyWhats && !notifySms)}
                onClick={() => {
                  const p = plans.find((x) => x.id === selectedPlan);
                  const canais = [
                    notifyEmail && "e-mail",
                    notifyWhats && "WhatsApp",
                    notifySms && "SMS",
                  ].filter(Boolean).join(", ");
                  console.log("Upgrade notification channels:", { email: notifyEmail, whatsapp: notifyWhats, sms: notifySms, plan: p?.nome });
                  setUpgradeOpen(false);
                  setSelectedPlan(null);
                  showToast(`Upgrade solicitado: ${p?.nome}. Confirmação enviada via ${canais}.`);
                }}
                className="group relative w-full overflow-hidden rounded-xl py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, #660099 0%, #7a00b3 100%)",
                  boxShadow:
                    "0 8px 20px -6px rgba(102,0,153,0.50), 0 2px 6px rgba(102,0,153,0.30), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                <span className="relative z-10">Confirmar upgrade</span>
                <span
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0))",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Expanded view modal */}
      <Modal
        open={expandOpen}
        onClose={() => setExpandOpen(false)}
        title="Consumo detalhado"
      >
        <div className="flex flex-col items-center gap-4">
          <ConsumoRing line={line} />
          <div className="w-full space-y-2 text-sm">
            <div className="flex justify-between border-b border-[#eee] pb-2">
              <span className="text-[#666]">Plano</span>
              <span className="font-semibold text-[#660099]">{line.plan}</span>
            </div>
            <div className="flex justify-between border-b border-[#eee] pb-2">
              <span className="text-[#666]">Linha</span>
              <span className="font-semibold text-[#660099]">{line.number}</span>
            </div>
            <div className="flex justify-between border-b border-[#eee] pb-2">
              <span className="text-[#666]">Consumido</span>
              <span className="font-semibold text-[#660099]">{formatGB(line.used)}</span>
            </div>
            <div className="flex justify-between border-b border-[#eee] pb-2">
              <span className="text-[#666]">Disponível</span>
              <span className="font-semibold text-[#660099]">{formatGB(available)}</span>
            </div>
            <div className="flex justify-between border-b border-[#eee] pb-2">
              <span className="text-[#666]">Fim do ciclo</span>
              <span className="font-semibold text-[#660099]">{cycleLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">Próxima renovação</span>
              <span className="font-semibold text-[#660099]">{renewalDateLabel}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm Auto-Renewal Modal */}
      {confirmAutoDebit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 animate-fade-in"
          style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={() => setConfirmAutoDebit(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[480px] overflow-hidden rounded-2xl p-5 sm:p-8 animate-slide-up"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.06)",
              boxShadow:
                "0 30px 60px -20px rgba(102,0,153,0.25), 0 18px 40px -15px rgba(0,0,0,0.18)",
            }}
          >

            {/* glow ring top */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[140%] -translate-x-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(102,0,153,0.18), rgba(102,0,153,0))",
              }}
            />

            <div className="relative flex items-center gap-3 sm:gap-4">
              <img
                src={icon3dAutorenew}
                alt="Renovação automática"
                width={56}
                height={56}
                loading="eager" decoding="sync" fetchPriority="high"
                className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] sm:text-[20px] font-semibold tracking-tight text-[#1a1a1a] leading-tight whitespace-nowrap">
                  {autoDebit ? "Renovação Automática Ativa" : "Ativar Renovação Automática"}
                </h3>
                <p className="mt-0.5 text-xs font-medium text-[#660099]/80">
                  {autoDebit ? "Função ativa · não pode ser desativada" : "Função premium SmartVoz"}
                </p>
              </div>
            </div>

            <div className="relative mt-6 space-y-4">
              <p className="text-[14px] leading-relaxed text-[#4a4a4a]">
                {autoDebit
                  ? "Ao ativar o débito automático você está ciente que essa função não pode ser desfeita. Seu plano continuará sendo renovado automaticamente todos os meses."
                  : "Ao ativar a renovação automática, seu plano será renovado todos os meses utilizando o saldo disponível da sua carteira virtual/comissões."}
              </p>

              {/* Bônus */}
              <div
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(102,0,153,0.06), rgba(102,0,153,0.02))",
                  border: "1px solid rgba(102,0,153,0.14)",
                  boxShadow:
                    "0 6px 18px -12px rgba(102,0,153,0.30), inset 0 1px 0 rgba(255,255,255,0.6)",
                }}
              >
                <img
                  src={icon3dBonus}
                  alt="Bônus de internet"
                  width={40}
                  height={40}
                  loading="eager" decoding="sync" fetchPriority="high"
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#660099] leading-tight">
                    Bônus de internet liberado
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-[#660099]">
                    Seu plano receberá internet extra automaticamente.
                  </p>
                </div>
              </div>

              {/* Alerta */}
              <div
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(220,38,38,0.05), rgba(220,38,38,0.015))",
                  borderLeft: "3px solid #dc2626",
                  border: "1px solid rgba(220,38,38,0.18)",
                  borderLeftWidth: 3,
                }}
              >
                <img
                  src={icon3dAlert}
                  alt="Atenção"
                  width={40}
                  height={40}
                  loading="eager" decoding="sync" fetchPriority="high"
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <p className="text-[12.5px] leading-snug text-[#991b1b] flex-1">
                  <span className="font-semibold">Atenção:</span> após ativar, esta função não poderá ser desativada manualmente.
                </p>
              </div>

              <p className="text-[12px] leading-relaxed text-[#777]">
                Os valores da renovação serão descontados automaticamente do saldo disponível da sua conta.
              </p>
            </div>

            <div className="relative mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {autoDebit ? (
                <button
                  type="button"
                  onClick={() => setConfirmAutoDebit(false)}
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                  style={{
                    background: "linear-gradient(135deg,#660099,#7a00b3)",
                    boxShadow:
                      "0 10px 28px -8px rgba(102,0,153,0.6), 0 4px 12px -2px rgba(102,0,153,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
                  }}
                >
                  Entendi
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmAutoDebit(false)}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[#660099] transition hover:bg-[rgba(102,0,153,0.06)]"
                    style={{
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(102,0,153,0.35)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoDebit(true);
                      setConfirmAutoDebit(false);
                      setToast("Renovação automática ativada · +25GB liberados");
                      setTimeout(() => setToast(null), 3000);
                    }}
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                    style={{
                      background: "linear-gradient(135deg,#660099,#7a00b3)",
                      boxShadow:
                        "0 10px 28px -8px rgba(102,0,153,0.6), 0 4px 12px -2px rgba(102,0,153,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
                    }}
                  >
                    Ativar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Status da linha modal */}
      {(() => {
        const currentStatus: LineStatus =
          simStatus ?? baseLine.status;
        const cfg = ({
          aguardando: {
            label: "Aguardando",
            image: statusAguardandoIcon,
            tone: "#6B7280",
            fatura: "—",
            message: "Aguardando ativação da linha.",
          },
          ativa: {
            label: "Ativa",
            image: statusAtivaIcon,
            tone: "#16A34A",
            fatura: "Em dia",
            message: "Você pode usar sua linha normalmente.",
          },
          reduzida: {
            label: "Velocidade reduzida",
            image: statusReduzidaIcon,
            tone: "#F97316",
            fatura: "Em dia",
            message:
              "Sua franquia foi totalmente consumida, e a navegação seguirá em velocidade reduzida até a próxima renovação do ciclo. Para voltar à velocidade máxima, você pode contratar um plano superior. Nesse caso, seu consumo atual é preservado, os novos GB são liberados imediatamente e você paga apenas a diferença proporcional aos dias restantes do ciclo. Na próxima renovação, o novo plano já será ativado com a franquia completa.",
          },
          bloqueada_fatura: {
            label: "Bloqueada por fatura",
            image: statusBloqueadaIcon,
            tone: "#DC2626",
            fatura: "Em aberto",
            message:
              "Sua linha está bloqueada devido a uma fatura em aberto. Regularize o pagamento via Pix para reativar o serviço em até 24 horas.",
          },
          bloqueada_pagamento: {
            label: "Bloqueada por pagamento",
            image: statusBloqueadaIcon,
            tone: "#DC2626",
            fatura: "Pendente",
            message:
              "Não conseguimos processar o pagamento da sua última fatura. Regularize via Pix para desbloquear a linha.",
          },
        } as const)[currentStatus];
        return (
          <Modal
            open={statusOpen}
            onClose={() => setStatusOpen(false)}
            title="Status da linha"
          >
            <div className="space-y-5">
              {/* Situação */}
              <div className="flex items-center gap-3">
                <img
                  src={cfg.image}
                  alt={cfg.label}
                  width={56}
                  height={56}
                  loading="lazy"
                  className="h-14 w-14 shrink-0 object-contain drop-shadow-sm"
                />
                <div className="min-w-0">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: cfg.tone, opacity: 0.75 }}
                  >
                    Situação atual
                  </div>
                  <div
                    className="text-base font-semibold leading-tight"
                    style={{ color: cfg.tone }}
                  >
                    {cfg.label}
                  </div>
                </div>
              </div>

              {/* Dados */}
              <div className="rounded-xl border border-[#eee] px-4 py-3 text-sm">
                <div className="flex justify-between py-1.5">
                  <span className="text-[#666]">Número</span>
                  <span className="font-semibold text-[#1a1a1a]">
                    {baseLine.number}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#f0f0f0] py-1.5">
                  <span className="text-[#666]">Plano</span>
                  <span className="font-semibold text-[#1a1a1a]">
                    {baseLine.plan}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#f0f0f0] py-1.5">
                  <span className="text-[#666]">Vencimento</span>
                  <span className="font-semibold text-[#1a1a1a]">
                    Todo dia 10
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#f0f0f0] py-1.5">
                  <span className="text-[#666]">Fatura</span>
                  <span
                    className="font-semibold"
                    style={{ color: cfg.tone }}
                  >
                    {cfg.fatura}
                  </span>
                </div>
              </div>

              {/* Mensagem */}
              <p className="px-4 text-sm text-[#444]">{cfg.message}</p>

              {/* Ações */}
              <div className="space-y-2">
                {currentStatus === "ativa" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setStatusOpen(false);
                        setToast("Abrindo suas faturas...");
                        setTimeout(() => setToast(null), 2200);
                      }}
                      className="flex-1 rounded-xl border border-[#660099] px-3 py-3 text-sm font-semibold text-[#660099] transition hover:bg-[#f5ebfa]"
                    >
                      Ver faturas
                    </button>
                    <button
                      onClick={() => {
                        setStatusOpen(false);
                        openAfterIconsReady(() => setUpgradeOpen(true));
                      }}
                      className="flex-1 rounded-xl px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                      style={{ background: "linear-gradient(135deg,#660099,#7a00b3)" }}
                    >
                      Fazer upgrade
                    </button>
                  </div>
                )}

                {currentStatus === "reduzida" && (
                  <button
                    onClick={() => {
                      setStatusOpen(false);
                      openAfterIconsReady(() => setUpgradeOpen(true));
                    }}
                    className="w-full rounded-xl px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                    style={{
                      background: "linear-gradient(135deg,#660099,#7a00b3)",
                    }}
                  >
                    Fazer upgrade
                  </button>
                )}

                {(currentStatus === "bloqueada_fatura" ||
                  currentStatus === "bloqueada_pagamento") && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setStatusOpen(false);
                        setPixOpen(true);
                      }}
                      className="flex-1 rounded-xl px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                      style={{ background: "linear-gradient(135deg,#DC2626,#b91c1c)" }}
                    >
                      Pagar fatura
                    </button>
                    <button
                      onClick={() => {
                        setStatusOpen(false);
                        openAfterIconsReady(() => setUpgradeOpen(true));
                      }}
                      className="flex-1 rounded-xl border border-[#660099] px-3 py-3 text-sm font-semibold text-[#660099] transition hover:bg-[#f5ebfa]"
                    >
                      Fazer upgrade
                    </button>
                  </div>
                )}


              </div>

            </div>
          </Modal>
        );
      })()}

      {pixOpen && (
        <Modal open={pixOpen} onClose={() => setPixOpen(false)} title="Pagar fatura com Pix">
          <div className="space-y-4 px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between rounded-xl bg-[#f7f0fb] px-4 py-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[#888]">Valor da fatura</div>
                <div className="text-lg font-bold text-[#660099]">R$ 89,90</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-[#888]">Vencimento</div>
                <div className="text-sm font-semibold text-[#333]">10/08</div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-xl border border-[#eee] px-4 py-5">
              <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-white ring-1 ring-[#eee]">
                <QrCode className="h-32 w-32 text-[#222]" strokeWidth={1.2} />
              </div>
              <p className="text-center text-xs text-[#666]">Aponte a câmera do seu banco para o QR Code</p>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                Pix Copia e Cola
              </div>
              <div className="break-all rounded-lg bg-[#fafafa] px-3 py-2.5 text-[11px] text-[#444] ring-1 ring-[#eee]">
                {pixCode}
              </div>
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(pixCode).catch(() => {});
                  }
                  setToast("Código Pix copiado!");
                  setTimeout(() => setToast(null), 2200);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#660099,#7a00b3)" }}
              >
                <Copy className="h-4 w-4" /> Copiar código Pix
              </button>
            </div>

            <p className="rounded-lg bg-[#fff7ed] px-3 py-2 text-xs text-[#b45309]">
              Após o pagamento, a regularização da linha pode ocorrer em até 24 horas.
            </p>
          </div>
        </Modal>
      )}




      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#333] px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Simulador de status (dev) */}
      <div className="fixed bottom-4 right-4 z-40">
        {simOpen ? (
          <div className="w-64 rounded-2xl border border-[#eee] bg-white p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#660099]">
                Simulador
              </div>
              <button
                onClick={() => setSimOpen(false)}
                className="text-[#999] hover:text-[#333]"
                aria-label="Fechar simulador"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { key: null, label: "Automático (real)", tone: "#660099", icon: null },
                { key: "ativa" as LineStatus, label: "Ativa", tone: "#16A34A", icon: statusAtivaIcon },
                { key: "reduzida" as LineStatus, label: "Velocidade reduzida", tone: "#F97316", icon: statusReduzidaIcon },
                { key: "bloqueada_fatura" as LineStatus, label: "Bloqueada — fatura", tone: "#DC2626", icon: statusBloqueadaIcon },
                { key: "bloqueada_pagamento" as LineStatus, label: "Bloqueada — pagamento", tone: "#DC2626", icon: statusBloqueadaIcon },
              ].map((opt) => {
                const active = simStatus === opt.key;
                return (
                  <button
                    key={String(opt.key)}
                    onClick={() => setSimStatus(opt.key)}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition"
                    style={{
                      borderColor: active ? opt.tone : "#eee",
                      background: active ? `${opt.tone}14` : "#fff",
                      color: opt.tone,
                    }}
                  >
                    {opt.icon ? (
                      <img src={opt.icon} alt="" className="h-4 w-4 object-contain" />
                    ) : (
                      <span className="inline-block h-4 w-4 rounded-full" style={{ background: opt.tone }} />
                    )}
                    <span className="flex-1">{opt.label}</span>
                    {active && <span>✓</span>}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setSimOpen(false);
                  openAfterIconsReady(() => setUpgradeOpen(true));
                }}
                className="mt-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#660099,#7a00b3)" }}
              >
                Abrir fluxo de upgrade
              </button>
              <button
                onClick={() => {
                  setSimOpen(false);
                  openAfterIconsReady(() => setStatusOpen(true));
                }}
                className="rounded-lg border border-[#660099] px-2.5 py-2 text-xs font-semibold text-[#660099]"
              >
                Abrir modal de status
              </button>
            </div>
            {simStatus && (
              <p className="mt-2 text-[10px] text-[#999]">
                Simulando: <span className="font-semibold">{simStatus}</span>
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={() => setSimOpen(true)}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:brightness-110"
            style={{ background: "linear-gradient(135deg,#660099,#7a00b3)" }}
            aria-label="Abrir simulador de status"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-white" />
            Simulador
          </button>
        )}
      </div>
    </div>
  );
}
