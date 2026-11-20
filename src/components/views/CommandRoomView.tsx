import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Maximize2,
  Minimize2,
  LogOut,
  ShieldAlert,
  AlertTriangle,
  WifiOff,
  CheckCircle2,
  Clock,
  KeyRound,
} from 'lucide-react';
import { api, type FilterParams } from '../../api/client';
import { CommandRoomMap } from '../CommandRoomMap';
import { BrandLogo } from '../BrandLogo';
import type {
  AlertSeverity,
  BrandingConfig,
  CommandRoomStateResponse,
  GeoBoundaryRecord,
  UserAccount,
  WoredaPerformanceMetric,
} from '../../types/opcms';

interface CommandRoomViewProps {
  state: CommandRoomStateResponse;
  boundaries: GeoBoundaryRecord[];
  branding?: BrandingConfig | null;
  filter: FilterParams;
  currentUser: UserAccount;
  authenticated: boolean;
  sseConnected: boolean;
  syncStatus: 'synchronized' | 'syncing' | 'stale' | 'disconnected';
  lastRefreshedAt: string | null;
  isFullscreen: boolean;
  onToggleFullscreen: (next: boolean) => void;
  onLogout: () => void;
  onOpenPasswordChange?: () => void;
}

const SCREEN_META: Array<{ id: number; code: string; title: string; subtitle: string }> = [
  {
    id: 1,
    code: '01',
    title: 'REGIONAL OVERVIEW',
    subtitle: 'Oromia SIA Strategic KPIs, Coverage Progress & Priority Alerts',
  },
  {
    id: 2,
    code: '02',
    title: 'VACCINATION PERFORMANCE',
    subtitle: 'Target Achievement, Age Cohorts, Daily Trajectory & Woreda Rankings',
  },
  {
    id: 3,
    code: '03',
    title: 'VACCINE MANAGEMENT',
    subtitle: 'nOPV2 vs bOPV2 Vial Accountability, Utilization & Wastage Monitoring',
  },
  {
    id: 4,
    code: '04',
    title: 'SURVEILLANCE & SECURITY',
    subtitle: 'Campaign-Reported AFP/AEFI Alerts & Zero-Dose / Under-Vaccinated Follow-Up',
  },
  {
    id: 5,
    code: '05',
    title: 'REPORTING COMPLIANCE',
    subtitle: 'Woreda & Zone Submission Completeness, Teams Reporting & Data Freshness',
  },
];

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function formatAddisDateTime(iso: string | Date | null): string {
  if (!iso) return 'Not available';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

// Animates ONLY when numeric value changes from real backend updates
const AnimatedNumber: React.FC<{
  value: number | null | undefined;
  decimals?: number;
  suffix?: string;
}> = ({ value, decimals = 0, suffix = '' }) => {
  const target = value ?? 0;
  const [display, setDisplay] = useState<number>(target);
  const prevRef = useRef<number>(target);

  useEffect(() => {
    const startVal = prevRef.current;
    if (startVal === target) {
      setDisplay(target);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      prevRef.current = target;
      setDisplay(target);
      return;
    }

    const duration = 550;
    const startTime = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = startVal + (target - startVal) * eased;
      setDisplay(next);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
        setDisplay(target);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (value === null || value === undefined) return <span>—</span>;
  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString('en-US');

  return (
    <span className="tabular-nums">
      {formatted}
      {suffix}
    </span>
  );
};

const ProgressGauge: React.FC<{
  pct: number;
  label: string;
  sublabel: string;
  color: string;
  targetPct?: number;
}> = ({ pct, label, sublabel, color, targetPct }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = 64;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 160 95" className="w-48 h-28 overflow-visible">
        <path
          d="M 16 80 A 64 64 0 0 1 144 80"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 16 80 A 64 64 0 0 1 144 80"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        <text
          x="80"
          y="70"
          textAnchor="middle"
          className="fill-slate-900 text-2xl font-bold font-mono"
        >
          {pct.toFixed(1)}%
        </text>
      </svg>
      <div className="text-xs font-semibold text-slate-800 -mt-1">{label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">
        {sublabel}
        {targetPct !== undefined ? ` · Target ${targetPct}%` : ''}
      </div>
    </div>
  );
};

export const CommandRoomView: React.FC<CommandRoomViewProps> = ({
  state,
  boundaries,
  branding,
  filter,
  currentUser,
  authenticated,
  sseConnected,
  syncStatus,
  lastRefreshedAt,
  isFullscreen,
  onToggleFullscreen,
  onLogout,
  onOpenPasswordChange,
}) => {
  const { settings, kpis, zones, dailyTrends, activeCampaign, latestImport } = state;

  const enabledScreens = useMemo(() => {
    const valid = (settings.commandRoomEnabledScreens ?? [1, 2, 3, 4, 5]).filter(
      (id) => id >= 1 && id <= 5
    );
    return valid.length > 0 ? valid : [1, 2, 3, 4, 5];
  }, [settings.commandRoomEnabledScreens]);

  const intervalSec = Math.max(5, settings.commandRoomIntervalSec || 15);

  const [activeScreenId, setActiveScreenId] = useState<number>(() => {
    return enabledScreens.includes(settings.commandRoomDefaultScreen)
      ? settings.commandRoomDefaultScreen
      : enabledScreens[0];
  });

  const [paused, setPaused] = useState<boolean>(() => !settings.commandRoomAutoRotate);

  const [secondsLeft, setSecondsLeft] = useState<number>(intervalSec);
  const [addisClock, setAddisClock] = useState<string>(() =>
    formatAddisDateTime(new Date())
  );
  const [screenTransitionKey, setScreenTransitionKey] = useState(0);

  // Screen 5 paginated compliance table
  const [woredaPage, setWoredaPage] = useState(1);
  const [woredaStatusFilter, setWoredaStatusFilter] = useState<string>('');
  const [paginatedWoredas, setPaginatedWoredas] = useState<{
    items: WoredaPerformanceMetric[];
    total: number;
  }>({ items: [], total: 0 });

  const wasNativeFsRef = useRef(false);

  // Sync paused state when server-persisted auto-rotate setting changes
  useEffect(() => {
    setPaused(!settings.commandRoomAutoRotate);
  }, [settings.commandRoomAutoRotate]);

  // Keep activeScreenId inside enabledScreens if Admin updates configuration
  useEffect(() => {
    if (!enabledScreens.includes(activeScreenId)) {
      setActiveScreenId(enabledScreens[0]);
      setSecondsLeft(intervalSec);
    }
  }, [enabledScreens, activeScreenId, intervalSec]);

  // Reset countdown when admin updates interval
  useEffect(() => {
    setSecondsLeft(intervalSec);
  }, [intervalSec]);

  // Live Africa/Addis_Ababa wallboard clock
  useEffect(() => {
    const t = setInterval(() => {
      setAddisClock(formatAddisDateTime(new Date()));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Single non-overlapping 1-second slideshow countdown timer
  useEffect(() => {
    if (paused || !settings.commandRoomAutoRotate || enabledScreens.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setActiveScreenId((cur) => {
            const idx = enabledScreens.indexOf(cur);
            const nextIdx = (idx + 1) % enabledScreens.length;
            return enabledScreens[nextIdx];
          });
          setScreenTransitionKey((k) => k + 1);
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [paused, settings.commandRoomAutoRotate, enabledScreens, intervalSec]);

  // Fullscreen startup preference (if user already in command room and no conflict)
  useEffect(() => {
    if (settings.commandRoomFullscreenStartup && !isFullscreen) {
      onToggleFullscreen(true);
    }
    // run once on mount if configured
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape key & native Fullscreen synchronization
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        wasNativeFsRef.current = false;
        onToggleFullscreen(false);
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && wasNativeFsRef.current) {
        wasNativeFsRef.current = false;
        onToggleFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isFullscreen, onToggleFullscreen]);

  async function enterFullscreen() {
    onToggleFullscreen(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        wasNativeFsRef.current = true;
      }
    } catch {
      wasNativeFsRef.current = false;
    }
  }

  async function exitFullscreen() {
    wasNativeFsRef.current = false;
    onToggleFullscreen(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }

  // Fetch paginated woredas when Screen 5 is visible
  useEffect(() => {
    if (activeScreenId !== 5) return;
    let cancelled = false;
    api
      .getCommandRoomWoredas(filter, woredaPage, 8, woredaStatusFilter || undefined)
      .then((res) => {
        if (!cancelled) {
          setPaginatedWoredas({ items: res.items, total: res.total });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeScreenId, filter, woredaPage, woredaStatusFilter, state.cacheVersion]);

  function goToScreen(id: number) {
    setActiveScreenId(id);
    setSecondsLeft(intervalSec);
    setScreenTransitionKey((k) => k + 1);
  }

  function handlePrev() {
    const idx = enabledScreens.indexOf(activeScreenId);
    const prevIdx = (idx - 1 + enabledScreens.length) % enabledScreens.length;
    goToScreen(enabledScreens[prevIdx]);
  }

  function handleNext() {
    const idx = enabledScreens.indexOf(activeScreenId);
    const nextIdx = (idx + 1) % enabledScreens.length;
    goToScreen(enabledScreens[nextIdx]);
  }

  const activeMeta =
    SCREEN_META.find((s) => s.id === activeScreenId) ?? SCREEN_META[0];
  const screenPosition = Math.max(1, enabledScreens.indexOf(activeScreenId) + 1);
  const totalScreensLabel = String(enabledScreens.length).padStart(2, '0');
  const currentScreenLabel = String(screenPosition).padStart(2, '0');

  const isLive =
    sseConnected && syncStatus === 'synchronized' && lastRefreshedAt !== null;
  const completenessPct =
    kpis.expectedReportingWoredas > 0
      ? Math.round((kpis.submittedWoredas / kpis.expectedReportingWoredas) * 1000) / 10
      : 0;
  const reportingTeamsPct =
    kpis.totalVaccinationTeams > 0
      ? Math.round((kpis.reportingVaccinationTeams / kpis.totalVaccinationTeams) * 1000) /
        10
      : 0;

  const isViewerOnly = currentUser.role === 'command_room_viewer';
  const showFullscreenShell = isFullscreen || isViewerOnly;

  // Countdown ring math
  const ringR = 14;
  const ringC = 2 * Math.PI * ringR;
  const ringProgress = intervalSec > 0 ? secondsLeft / intervalSec : 1;
  const ringOffset = ringC * (1 - ringProgress);

  const severityStyles: Record<AlertSeverity, string> = {
    critical: 'text-red-700 bg-red-50 border-red-200',
    high: 'text-[#B45309] bg-amber-50 border-amber-200',
    moderate: 'text-[#485EA9] bg-sky-50 border-sky-200',
    informational: 'text-slate-600 bg-slate-100 border-slate-200',
  };

  const topZonesByCoverage = useMemo(
    () =>
      [...zones]
        .sort((a, b) => b.overallCoveragePct - a.overallCoveragePct)
        .slice(0, 10),
    [zones]
  );

  const zonesByCompletenessDesc = useMemo(
    () =>
      [...zones]
        .sort((a, b) => b.completenessPct - a.completenessPct || a.zone.localeCompare(b.zone)),
    [zones]
  );

  return (
    <div
      className={
        showFullscreenShell
          ? 'fixed inset-0 z-50 bg-slate-50 text-slate-900 flex flex-col overflow-y-auto'
          : 'flex flex-col space-y-4 text-slate-900'
      }
    >
      {/* COMMAND ROOM HEADER */}
      <header className="bg-white border-b border-slate-200 px-5 py-3 shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Left: OHB Emblem / Custom System Logo + Title + Campaign Round */}
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandLogo variant="command_room" branding={branding ?? null} />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base lg:text-lg font-bold tracking-tight text-[#485EA9] truncate">
                  {settings.commandRoomDisplayTitle}
                </h1>
                <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {currentScreenLabel} / {totalScreensLabel}
                </span>
                <span className="text-xs font-semibold text-[#3A99CF]">
                  {activeMeta.title}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                <span>
                  Campaign:{' '}
                  <strong className="text-slate-900">
                    {activeCampaign?.roundCode ?? 'R1-NOV-2026'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Reporting Day:{' '}
                  <strong className="text-slate-900">
                    {state.latestReportingDay
                      ? `Day ${state.latestReportingDay}`
                      : 'Baseline Ready'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-800">
                  {addisClock} EAT
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  LAST IMPORT:{' '}
                  <strong className="font-mono tabular-nums text-slate-800">
                    {latestImport
                      ? formatAddisDateTime(latestImport.confirmedAt)
                      : 'Awaiting first import'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Connection Status, Countdown Ring & Slideshow Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Live Connection / Disconnected Banner */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              {isLive ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span className="font-semibold text-emerald-700 whitespace-nowrap">
                    LIVE DATA
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="font-semibold text-red-700 whitespace-nowrap">
                    {!sseConnected ? 'CONNECTION LOST' : 'SYNCING'}
                  </span>
                </>
              )}
              <span className="text-slate-300" aria-hidden="true">
                |
              </span>
              <span className="text-slate-600 whitespace-nowrap">
                LAST UPDATED:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {formatAddisDateTime(lastRefreshedAt)}
                </strong>
              </span>
            </div>

            {/* Countdown Ring & Auto/Paused Indicator */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-slate-200 bg-white text-xs">
              <svg viewBox="0 0 36 36" className="w-7 h-7 shrink-0 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r={ringR}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r={ringR}
                  fill="none"
                  stroke={paused ? '#D29441' : '#3A99CF'}
                  strokeWidth="3"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 450ms linear' }}
                />
              </svg>
              <div className="leading-tight">
                <div className="font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                  NEXT SCREEN IN {secondsLeft}s
                </div>
                <div
                  className={`text-[10px] font-semibold tracking-wide ${
                    paused || !settings.commandRoomAutoRotate
                      ? 'text-[#D29441]'
                      : 'text-[#485EA9]'
                  }`}
                >
                  {paused || !settings.commandRoomAutoRotate ? 'PAUSED' : 'AUTO'}
                </div>
              </div>
            </div>

            {/* Playback & Screen Step Controls */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1.5 rounded-md text-slate-700 hover:bg-white hover:text-slate-900 transition-colors"
                title="Previous screen"
                aria-label="Previous screen"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-900 shadow-sm inline-flex items-center gap-1 whitespace-nowrap"
                title={paused ? 'Resume automatic rotation' : 'Pause automatic rotation'}
              >
                {paused ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-700" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-[#485EA9]" />
                    Pause
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1.5 rounded-md text-slate-700 hover:bg-white hover:text-slate-900 transition-colors"
                title="Next screen"
                aria-label="Next screen"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Full-screen toggle */}
            {isFullscreen ? (
              <button
                type="button"
                onClick={exitFullscreen}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg whitespace-nowrap shrink-0"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Exit Full-Screen (Esc)
              </button>
            ) : (
              <button
                type="button"
                onClick={enterFullscreen}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg whitespace-nowrap shrink-0"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Full-Screen
              </button>
            )}

            {isViewerOnly && authenticated ? (
              <div className="flex items-center gap-1.5">
                {onOpenPasswordChange ? (
                  <button
                    type="button"
                    onClick={onOpenPasswordChange}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Password
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Thin rotation progress strip + 5 screen quick tabs */}
        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {SCREEN_META.filter((m) => enabledScreens.includes(m.id)).map((m) => {
              const active = m.id === activeScreenId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => goToScreen(m.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#485EA9] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {m.code}. {m.title}
                </button>
              );
            })}
          </div>
          <div className="w-full sm:w-56 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3A99CF] transition-all duration-500"
              style={{
                width: `${
                  intervalSec > 0 ? Math.round((secondsLeft / intervalSec) * 100) : 100
                }%`,
              }}
            />
          </div>
        </div>
      </header>

      {/* Disconnected Warning Notice (Preserves last known data) */}
      {!sseConnected ? (
        <div className="mx-5 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>CONNECTION LOST:</strong> Live stream interrupted. Preserving last successfully synchronized campaign snapshot from{' '}
              <span className="font-mono">{formatAddisDateTime(lastRefreshedAt)} EAT</span>. Attempting automatic reconnection...
            </span>
          </div>
        </div>
      ) : null}

      {/* MAIN ACTIVE SLIDE VIEWPORT */}
      <div
        key={screenTransitionKey}
        className={`flex-1 ${
          showFullscreenShell ? 'p-5' : 'px-1 py-2'
        } space-y-4 transition-opacity duration-200`}
      >
        {/* ==================== SCREEN 1: REGIONAL OVERVIEW ==================== */}
        {activeScreenId === 1 ? (
          <div className="space-y-4">
            {/* Top 14 Regional KPIs across clean 7-col responsive wallboard grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Regional Target', val: kpis.totalPlannedTarget, tone: 'text-[#485EA9]' },
                { label: 'Children Vaccinated', val: kpis.totalChildrenVaccinated0_59, tone: 'text-[#3A99CF]' },
                { label: 'Overall Coverage', val: kpis.overallVaccinationCoveragePct, dec: 1, suf: '%', tone: 'text-emerald-700' },
                { label: 'Reporting Woredas', val: kpis.submittedWoredas, tone: 'text-emerald-700' },
                { label: 'Non-Reporting Woredas', val: kpis.pendingWoredas, tone: 'text-[#D29441]' },
                { label: 'Completeness', val: completenessPct, dec: 1, suf: '%', tone: 'text-[#485EA9]' },
                { label: 'Vaccination Teams', val: kpis.totalVaccinationTeams, tone: 'text-slate-900' },
                { label: 'Reporting Teams', val: kpis.reportingVaccinationTeams, tone: 'text-[#3A99CF]' },
                { label: 'Zero-Dose Identified', val: kpis.zeroDoseIdentified, tone: 'text-slate-900' },
                { label: 'Zero-Dose Vaccinated', val: kpis.zeroDoseVaccinated, tone: 'text-emerald-700' },
                { label: 'Under-Vacc. Identified', val: kpis.underVaccinatedIdentified, tone: 'text-slate-900' },
                { label: 'Under-Vacc. Vaccinated', val: kpis.underVaccinatedVaccinated, tone: 'text-[#3A99CF]' },
                { label: 'AFP Alerts (Reported)', val: kpis.afpAlertsTotal, tone: kpis.afpAlertsTotal > 0 ? 'text-red-700' : 'text-slate-900' },
                { label: 'AEFI Alerts (Reported)', val: kpis.aefiAlertsTotal, tone: kpis.aefiAlertsTotal > 0 ? 'text-[#D29441]' : 'text-slate-900' },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-white border border-slate-200 rounded-lg p-3.5"
                >
                  <div className="text-[11px] font-medium text-slate-500 truncate">
                    {card.label}
                  </div>
                  <div className={`mt-1 text-xl lg:text-2xl font-bold ${card.tone}`}>
                    <AnimatedNumber
                      value={card.val}
                      decimals={card.dec ?? 0}
                      suffix={card.suf ?? ''}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Oromia Regional Map */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Oromia Regional Performance Map
                  </h2>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A]" /> ≥{settings.coverageTargetPct}%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#D29441]" /> Below
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]" /> Critical
                    </span>
                  </div>
                </div>
                <CommandRoomMap
                  state={state}
                  boundaries={boundaries}
                  mode="coverage"
                  heightClass="h-[310px]"
                />
              </div>

              {/* Center: Progress Gauge + Overall Campaign Progress Chart */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Regional Vaccination Progress
                </h2>
                <ProgressGauge
                  pct={kpis.overallVaccinationCoveragePct}
                  label="Cumulative Coverage (0–59m)"
                  sublabel={`${fmt(kpis.totalChildrenVaccinated0_59)} / ${fmt(kpis.totalPlannedTarget)}`}
                  color="#3A99CF"
                  targetPct={settings.coverageTargetPct}
                />
                <div className="h-[195px] border-t border-slate-100 pt-2">
                  {dailyTrends.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-4">
                      Baseline active ({fmt(kpis.totalPlannedTarget)} target). Daily trajectory populates upon first daily import.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dailyTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                        <Bar dataKey="vaccinated0_59" name="Daily Vaccinated" fill="#3A99CF" />
                        <Line
                          type="monotone"
                          dataKey="cumulativeVaccinated0_59"
                          name="Cumulative"
                          stroke="#485EA9"
                          strokeWidth={2}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Right: Zone Ranking & Operational Alerts */}
              <div className="lg:col-span-3 flex flex-col gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4 flex-1">
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Zone Performance Ranking
                  </h2>
                  <div className="space-y-1.5 max-h-[185px] overflow-y-auto text-xs">
                    {topZonesByCoverage.map((z, idx) => (
                      <div
                        key={z.zone}
                        className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0"
                      >
                        <span className="truncate text-slate-800">
                          <span className="font-mono text-slate-400 mr-1.5">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {z.zone}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-[#485EA9] shrink-0">
                          {z.overallCoveragePct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 mb-2">
                    <AlertTriangle className="w-4 h-4 text-[#D29441]" />
                    Operational Alerts ({state.surveillanceLocations.length})
                  </div>
                  {state.surveillanceLocations.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No urgent AFP/AEFI or zero-dose gaps reported yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto text-xs">
                      {state.surveillanceLocations.slice(0, 6).map((s) => (
                        <div
                          key={`${s.zone}-${s.woreda}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-slate-800">
                            {s.woreda} ({s.zone})
                          </span>
                          <span className="font-mono tabular-nums text-red-700 shrink-0">
                            AFP:{s.afpAlerts} AEFI:{s.aefiAlerts}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ==================== SCREEN 2: VACCINATION PERFORMANCE ==================== */}
        {activeScreenId === 2 ? (
          <div className="space-y-4">
            {/* Top Animated KPI Counters & Progress Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Target vs Vaccinated (0–59m)</div>
                <div className="mt-1 text-2xl font-bold text-[#485EA9]">
                  <AnimatedNumber value={kpis.totalChildrenVaccinated0_59} />{' '}
                  <span className="text-sm font-normal text-slate-500">
                    / {fmt(kpis.totalPlannedTarget)}
                  </span>
                </div>
                <div className="mt-2.5 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3A99CF] transition-all duration-700"
                    style={{ width: `${Math.min(100, kpis.overallVaccinationCoveragePct)}%` }}
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Cumulative Coverage</div>
                <div className="mt-1 text-2xl font-bold text-emerald-700">
                  <AnimatedNumber
                    value={kpis.overallVaccinationCoveragePct}
                    decimals={1}
                    suffix="%"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Target Threshold: {settings.coverageTargetPct}%
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Daily Coverage</div>
                <div className="mt-1 text-2xl font-bold text-[#3A99CF]">
                  <AnimatedNumber
                    value={kpis.dailyVaccinationCoveragePct}
                    decimals={1}
                    suffix="%"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Daily Target: {fmt(kpis.totalDailyTarget)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Age-Group Distribution</div>
                <div className="mt-1.5 space-y-1 text-xs tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-600">0–11 months:</span>
                    <strong className="text-slate-900">{fmt(state.ageGroups.age0_11Total)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">12–59 months:</span>
                    <strong className="text-slate-900">{fmt(state.ageGroups.age12_59Total)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">60–120 months:</span>
                    <strong className="text-slate-900">{fmt(state.ageGroups.age60_120Total)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Daily Performance Line Chart & Zone Comparison */}
              <div className="lg:col-span-7 grid grid-cols-1 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Vaccination by Campaign Day &amp; Cumulative Coverage
                  </h2>
                  <div className="h-[200px]">
                    {dailyTrends.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500">
                        No daily campaign records imported yet.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyTrends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                          <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Line yAxisId="left" type="monotone" dataKey="vaccinated0_59" name="Daily Vaccinated" stroke="#3A99CF" strokeWidth={2.5} />
                          <Line yAxisId="right" type="monotone" dataKey="cumulativeCoveragePct" name="Cumulative %" stroke="#485EA9" strokeWidth={2.5} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Regional Coverage Comparison by Zone (Top 14)
                  </h2>
                  <div className="h-[205px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...zones].sort((a, b) => b.overallCoveragePct - a.overallCoveragePct).slice(0, 14)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="zone" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={48} />
                        <YAxis domain={[0, 110]} tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip />
                        <Bar dataKey="overallCoveragePct" name="Coverage %" fill="#485EA9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Right: Top 10 / Bottom 10 Woredas & Interactive Map */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Interactive Oromia Performance Map
                  </h2>
                  <CommandRoomMap
                    state={state}
                    boundaries={boundaries}
                    mode="coverage"
                    heightClass="h-[200px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5">
                    <h3 className="text-xs font-semibold text-emerald-800 mb-2">
                      Top 10 Performing Woredas
                    </h3>
                    {state.top10Woredas.length === 0 ? (
                      <p className="text-[11px] text-slate-500">Awaiting submitted daily reports.</p>
                    ) : (
                      <div className="space-y-1 text-[11px] max-h-44 overflow-y-auto">
                        {state.top10Woredas.map((w, i) => (
                          <div key={`${w.zone}-${w.woreda}`} className="flex justify-between gap-2">
                            <span className="truncate text-slate-800">
                              {i + 1}. {w.woreda}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-emerald-700 shrink-0">
                              {w.coveragePct}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-3.5">
                    <h3 className="text-xs font-semibold text-[#B45309] mb-2">
                      Bottom 10 Performing Woredas
                    </h3>
                    {state.bottom10Woredas.length === 0 ? (
                      <p className="text-[11px] text-slate-500">Awaiting submitted daily reports.</p>
                    ) : (
                      <div className="space-y-1 text-[11px] max-h-44 overflow-y-auto">
                        {state.bottom10Woredas.map((w, i) => (
                          <div key={`${w.zone}-${w.woreda}`} className="flex justify-between gap-2">
                            <span className="truncate text-slate-800">
                              {i + 1}. {w.woreda}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-red-700 shrink-0">
                              {w.coveragePct}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ==================== SCREEN 3: VACCINE MANAGEMENT ==================== */}
        {activeScreenId === 3 ? (
          <div className="space-y-4">
            {/* Separate nOPV2 vs bOPV2 Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                {
                  title: 'nOPV2 Vaccine Accountability (Vials)',
                  badge: 'nOPV2',
                  accent: 'text-[#485EA9]',
                  border: 'border-slate-200',
                  data: state.vaccineAccountability.nopv2,
                },
                {
                  title: 'bOPV2 Vaccine Accountability (Vials)',
                  badge: 'bOPV2',
                  accent: 'text-[#D29441]',
                  border: 'border-slate-200',
                  data: state.vaccineAccountability.bopv,
                },
              ].map((v) => {
                const highWastage =
                  v.data.wastagePct !== null &&
                  v.data.wastagePct > settings.maxWastagePct;
                return (
                  <div
                    key={v.badge}
                    className={`bg-white border ${v.border} rounded-lg p-4`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h2 className={`text-sm font-bold ${v.accent}`}>{v.title}</h2>
                      {highWastage ? (
                        <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                          Wastage Warning (&gt;{settings.maxWastagePct}%)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Threshold ≤ {settings.maxWastagePct}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      {[
                        { k: 'Received', val: v.data.received },
                        { k: 'Used', val: v.data.used },
                        { k: 'Partially Used', val: v.data.partiallyUsed },
                        { k: 'Returned (Good)', val: v.data.returnedGood },
                        { k: 'Broken', val: v.data.broken },
                        { k: 'Returned (Bad)', val: v.data.returnedBad },
                        { k: 'Lost', val: v.data.lost },
                      ].map((m) => (
                        <div key={m.k} className="p-2.5 bg-slate-50 rounded-md">
                          <div className="text-[11px] text-slate-500">{m.k}</div>
                          <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                            {m.val !== null ? <AnimatedNumber value={m.val} /> : '—'}
                          </div>
                        </div>
                      ))}
                      <div className="p-2.5 bg-slate-50 rounded-md">
                        <div className="text-[11px] text-slate-500">Wastage Rate</div>
                        <div
                          className={`mt-0.5 text-lg font-bold tabular-nums ${
                            highWastage ? 'text-red-700' : v.accent
                          }`}
                        >
                          {v.data.wastagePct !== null
                            ? `${v.data.wastagePct}%`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Charts & Zone-Level Utilization */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">
                  nOPV2 vs bOPV2 Utilization &amp; Wastage Comparison
                </h2>
                <div className="h-[245px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          metric: 'Received',
                          nOPV2: state.vaccineAccountability.nopv2.received ?? 0,
                          bOPV2: state.vaccineAccountability.bopv.received ?? 0,
                        },
                        {
                          metric: 'Used',
                          nOPV2: state.vaccineAccountability.nopv2.used ?? 0,
                          bOPV2: state.vaccineAccountability.bopv.used ?? 0,
                        },
                        {
                          metric: 'Partially Used',
                          nOPV2: state.vaccineAccountability.nopv2.partiallyUsed ?? 0,
                          bOPV2: state.vaccineAccountability.bopv.partiallyUsed ?? 0,
                        },
                        {
                          metric: 'Returned Good',
                          nOPV2: state.vaccineAccountability.nopv2.returnedGood ?? 0,
                          bOPV2: state.vaccineAccountability.bopv.returnedGood ?? 0,
                        },
                        {
                          metric: 'Broken / Bad / Lost',
                          nOPV2:
                            (state.vaccineAccountability.nopv2.broken ?? 0) +
                            (state.vaccineAccountability.nopv2.returnedBad ?? 0) +
                            (state.vaccineAccountability.nopv2.lost ?? 0),
                          bOPV2:
                            (state.vaccineAccountability.bopv.broken ?? 0) +
                            (state.vaccineAccountability.bopv.returnedBad ?? 0) +
                            (state.vaccineAccountability.bopv.lost ?? 0),
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="nOPV2" fill="#485EA9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="bOPV2" fill="#D29441" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">
                  Zone-Level Vaccine Utilization &amp; Wastage
                </h2>
                <div className="overflow-x-auto max-h-[245px]">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Zone</th>
                        <th className="text-right font-medium px-2 py-2">nOPV2 Recv/Used</th>
                        <th className="text-right font-medium px-2 py-2">nOPV2 Waste</th>
                        <th className="text-right font-medium px-2 py-2">bOPV2 Recv/Used</th>
                        <th className="text-right font-medium px-3 py-2">bOPV2 Waste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {state.zoneVaccines.map((z) => (
                        <tr key={z.zone} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-medium text-slate-900">{z.zone}</td>
                          <td className="px-2 py-1.5 text-right">
                            {fmt(z.nopv2Received)} / {fmt(z.nopv2Used)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-[#485EA9]">
                            {z.nopv2WastagePct !== null ? `${z.nopv2WastagePct}%` : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {fmt(z.bopvReceived)} / {fmt(z.bopvUsed)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-[#D29441]">
                            {z.bopvWastagePct !== null ? `${z.bopvWastagePct}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ==================== SCREEN 4: SURVEILLANCE & SECURITY ==================== */}
        {activeScreenId === 4 ? (
          <div className="space-y-4">
            {/* Explicit Campaign-Reported Disclaimer */}
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-600 flex items-center justify-between">
              <span>
                <strong className="text-slate-900">Operational Notice:</strong> Counts below represent campaign-reported administrative alerts and equity linkages (no personally identifiable patient information is displayed).
              </span>
              <span className="font-mono text-slate-500">
                Verified AFP: {fmt(kpis.afpVerifiedCasesTotal)} · Verified AEFI: {fmt(kpis.aefiVerifiedCasesTotal)}
              </span>
            </div>

            {/* Alert & Equity Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'AFP Alerts (Reported)', val: kpis.afpAlertsTotal, sub: 'Severity: Critical', tone: kpis.afpAlertsTotal > 0 ? 'text-red-700' : 'text-slate-900' },
                { label: 'AEFI Alerts (Reported)', val: kpis.aefiAlertsTotal, sub: 'Severity: High', tone: kpis.aefiAlertsTotal > 0 ? 'text-[#B45309]' : 'text-slate-900' },
                { label: 'Zero-Dose Identified & Linked', val: kpis.zeroDoseIdentified, sub: 'Target linkage pool', tone: 'text-slate-900' },
                { label: 'Zero-Dose Vaccinated', val: kpis.zeroDoseVaccinated, sub: `${state.integrationMetrics.zdConversionPct}% conversion`, tone: 'text-emerald-700' },
                { label: 'Under-Vacc. Identified & Linked', val: kpis.underVaccinatedIdentified, sub: 'Defaulter tracking', tone: 'text-slate-900' },
                { label: 'Under-Vacc. Vaccinated', val: kpis.underVaccinatedVaccinated, sub: `${state.integrationMetrics.uvConversionPct}% conversion`, tone: 'text-[#3A99CF]' },
              ].map((c) => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-lg p-3.5">
                  <div className="text-[11px] font-medium text-slate-500 truncate">{c.label}</div>
                  <div className={`mt-1 text-2xl font-bold ${c.tone}`}>
                    <AnimatedNumber value={c.val} />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{c.sub}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Follow-Up Progress & Zone Distribution */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Zero-Dose &amp; Under-Vaccinated Follow-Up Progress
                  </h2>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">Zero-Dose Linkage → Vaccinated</span>
                      <span className="font-mono font-semibold text-emerald-700">
                        {state.integrationMetrics.zdConversionPct}%
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-700"
                        style={{ width: `${Math.min(100, state.integrationMetrics.zdConversionPct)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">Under-Vaccinated Linkage → Vaccinated</span>
                      <span className="font-mono font-semibold text-[#3A99CF]">
                        {state.integrationMetrics.uvConversionPct}%
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#3A99CF] transition-all duration-700"
                        style={{ width: `${Math.min(100, state.integrationMetrics.uvConversionPct)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Campaign-Reported Alerts by Zone
                  </h2>
                  <div className="h-[205px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={zones
                          .filter((z) => z.afpAlerts > 0 || z.aefiAlerts > 0)
                          .slice(0, 12)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="zone" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="afpAlerts" name="AFP Alerts" fill="#DC2626" />
                        <Bar dataKey="aefiAlerts" name="AEFI Alerts" fill="#D29441" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Right: Urgent Follow-Up Locations Table */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    Locations Requiring Urgent Follow-Up ({state.surveillanceLocations.length})
                  </h2>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>Severity: Critical · High · Moderate · Informational</span>
                  </div>
                </div>

                {state.surveillanceLocations.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                    No active AFP, AEFI, or unreached zero-dose follow-up alerts reported.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[340px]">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Zone</th>
                          <th className="text-left font-medium px-2 py-2">Woreda</th>
                          <th className="text-center font-medium px-2 py-2">Severity</th>
                          <th className="text-right font-medium px-2 py-2">AFP Alerts</th>
                          <th className="text-right font-medium px-2 py-2">AEFI Alerts</th>
                          <th className="text-right font-medium px-2 py-2">ZD Gap</th>
                          <th className="text-right font-medium px-3 py-2">UV Gap</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 tabular-nums">
                        {state.surveillanceLocations.slice(0, 20).map((loc) => (
                          <tr key={`${loc.zone}-${loc.woreda}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700">{loc.zone}</td>
                            <td className="px-2 py-2 font-medium text-slate-900">{loc.woreda}</td>
                            <td className="px-2 py-2 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 text-[11px] font-semibold uppercase rounded border ${
                                  severityStyles[loc.severity]
                                }`}
                              >
                                {loc.severity}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-red-700">
                              {loc.afpAlerts}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-[#B45309]">
                              {loc.aefiAlerts}
                            </td>
                            <td className="px-2 py-2 text-right">{loc.zdGap}</td>
                            <td className="px-3 py-2 text-right">{loc.uvGap}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* ==================== SCREEN 5: REPORTING COMPLIANCE ==================== */}
        {activeScreenId === 5 ? (
          <div className="space-y-4">
            {/* Top Compliance KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Expected Woredas', val: kpis.expectedReportingWoredas, tone: 'text-[#485EA9]' },
                { label: 'Woredas Submitted', val: kpis.submittedWoredas, tone: 'text-emerald-700' },
                { label: 'Not Submitted / Pending', val: kpis.pendingWoredas, tone: kpis.pendingWoredas > 0 ? 'text-[#D29441]' : 'text-emerald-700' },
                { label: 'Reporting Completeness', val: completenessPct, dec: 1, suf: '%', tone: 'text-[#3A99CF]' },
                { label: 'Reporting Teams', val: kpis.reportingVaccinationTeams, tone: 'text-emerald-700' },
                { label: 'Total Teams Deployed', val: kpis.totalVaccinationTeams, tone: 'text-slate-900' },
              ].map((c) => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-lg p-3.5">
                  <div className="text-[11px] font-medium text-slate-500 truncate">{c.label}</div>
                  <div className={`mt-1 text-2xl font-bold ${c.tone}`}>
                    <AnimatedNumber
                      value={c.val}
                      decimals={c.dec ?? 0}
                      suffix={c.suf ?? ''}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Completeness Gauge + Zone-by-Zone Compliance Bars */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Reporting Completeness &amp; Zone Compliance
                  </h2>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Teams: {reportingTeamsPct}%
                  </span>
                </div>
                <ProgressGauge
                  pct={completenessPct}
                  label="Woreda Reporting Completeness"
                  sublabel={`${fmt(kpis.submittedWoredas)} / ${fmt(kpis.expectedReportingWoredas)} expected`}
                  color={completenessPct >= 90 ? '#16A34A' : '#D29441'}
                />
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zonesByCompletenessDesc.slice(0, 14)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="zone" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={46} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip />
                      <Bar dataKey="completenessPct" name="Completeness %" radius={[4, 4, 0, 0]}>
                        {zonesByCompletenessDesc.slice(0, 14).map((z) => (
                          <Cell
                            key={z.zone}
                            fill={
                              z.submittedWoredas === 0
                                ? '#94A3B8'
                                : z.completenessPct >= 90
                                  ? '#16A34A'
                                  : z.completenessPct >= 65
                                    ? '#D29441'
                                    : '#DC2626'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Center: Reporting Status Map */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Reporting Status Map
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A]" /> Report Received
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#D29441]" /> Pending / Delayed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]" /> Critical Gap
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#94A3B8]" /> No Data
                  </span>
                </div>
                <CommandRoomMap
                  state={state}
                  boundaries={boundaries}
                  mode="reporting"
                  heightClass="h-[280px]"
                />
                <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-100">
                  <span>Last Data Import:</span>
                  <strong className="font-mono text-slate-800">
                    {latestImport
                      ? formatAddisDateTime(latestImport.confirmedAt)
                      : 'None yet'}
                  </strong>
                </div>
              </div>

              {/* Right: Top/Bottom Zones & Paginated Woreda Status */}
              <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Woreda Compliance
                  </h2>
                  <select
                    aria-label="Filter woreda compliance status"
                    value={woredaStatusFilter}
                    onChange={(e) => {
                      setWoredaStatusFilter(e.target.value);
                      setWoredaPage(1);
                    }}
                    className="px-2 py-1 text-[11px] border border-slate-300 rounded bg-white"
                  >
                    <option value="">All ({kpis.expectedReportingWoredas})</option>
                    <option value="on_target">On Target</option>
                    <option value="below_target">Below Target</option>
                    <option value="critical_alert">Critical Gap</option>
                    <option value="no_report">No Report</option>
                  </select>
                </div>

                <div className="divide-y divide-slate-100 text-xs flex-1 overflow-y-auto">
                  {paginatedWoredas.items.map((w) => {
                    const colorClass = w.submitted
                      ? w.statusCategory === 'critical_alert'
                        ? 'text-red-700'
                        : 'text-emerald-700'
                      : 'text-[#D29441]';
                    const label = w.submitted
                      ? w.statusCategory === 'critical_alert'
                        ? 'Critical Gap'
                        : 'Received'
                      : 'Pending';
                    return (
                      <div
                        key={`${w.zone}-${w.woreda}`}
                        className="py-1.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {w.woreda}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {w.zone}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 inline-flex items-center gap-1 ${colorClass}`}
                        >
                          {w.submitted ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : null}
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                  <button
                    type="button"
                    disabled={woredaPage <= 1}
                    onClick={() => setWoredaPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="font-mono">
                    Page {woredaPage} / {Math.max(1, Math.ceil(paginatedWoredas.total / 8))}
                  </span>
                  <button
                    type="button"
                    disabled={woredaPage * 8 >= paginatedWoredas.total}
                    onClick={() => setWoredaPage((p) => p + 1)}
                    className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* COMMAND ROOM FOOTER */}
      <footer className="bg-white border-t border-slate-200 px-5 py-2 text-xs text-slate-500 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {branding?.identity?.showFooterBranding !== false ? (
            <BrandLogo variant="footer" branding={branding ?? null} />
          ) : null}
          <span className="truncate">
            {branding?.identity?.footerText ||
              'Oromia Health Bureau | Polio Campaign Management System'}
          </span>
        </div>
        <span className="font-mono tabular-nums text-[11px] shrink-0">
          Screen {currentScreenLabel} of {totalScreensLabel} · Interval {intervalSec}s
        </span>
      </footer>
    </div>
  );
};
