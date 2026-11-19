import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
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
} from 'recharts';
import {
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import type { DashboardSummaryResponse } from '../../api/client';
import type {
  AdvancedAnalyticsData,
  Campaign,
  CampaignDailyReport,
  GeoBoundaryRecord,
  SurveillanceAlert,
} from '../../types/opcms';

interface LiveCommandCenterViewProps {
  summary: DashboardSummaryResponse;
  advanced: AdvancedAnalyticsData | null;
  reports: CampaignDailyReport[];
  alerts: SurveillanceAlert[];
  boundaries: GeoBoundaryRecord[];
  activeCampaign: Campaign | undefined;
  selectedDay: number | null;
  selectedZone: string | null;
  sseConnected: boolean;
  syncStatus: 'synchronized' | 'syncing' | 'stale' | 'disconnected';
  lastRefreshedAt: string | null;
  liveAlertBanner: { message: string; actor: string; timestamp: string } | null;
  isWallboard: boolean;
  onToggleWallboard: (next: boolean) => void;
  onManualRefresh: () => void;
  onSelectZone: (zone: string | null) => void;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

function formatAddisTime(iso: string | Date | null): string {
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

export const LiveCommandCenterView: React.FC<LiveCommandCenterViewProps> = ({
  summary,
  advanced,
  reports,
  alerts,
  boundaries,
  activeCampaign,
  selectedDay,
  selectedZone,
  sseConnected,
  syncStatus,
  lastRefreshedAt,
  liveAlertBanner,
  isWallboard,
  onToggleWallboard,
  onManualRefresh,
  onSelectZone,
}) => {
  const [subMode, setSubMode] = useState<'wallboard' | 'advanced'>('wallboard');
  const [addisClock, setAddisClock] = useState<string>(() =>
    formatAddisTime(new Date())
  );
  const [zoneSort, setZoneSort] = useState<'coverage' | 'target' | 'gap' | 'zone'>(
    'coverage'
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const wasNativeFsRef = useRef(false);

  // Live Africa/Addis_Ababa clock
  useEffect(() => {
    const timer = setInterval(() => {
      setAddisClock(formatAddisTime(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Browser Fullscreen + Escape key coordination
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isWallboard) {
        wasNativeFsRef.current = false;
        onToggleWallboard(false);
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && wasNativeFsRef.current) {
        wasNativeFsRef.current = false;
        onToggleWallboard(false);
      }
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 150);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isWallboard, onToggleWallboard]);

  async function enterFullscreenWallboard() {
    onToggleWallboard(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        wasNativeFsRef.current = true;
      }
    } catch {
      wasNativeFsRef.current = false;
    }
    setTimeout(() => mapRef.current?.invalidateSize(), 200);
  }

  async function exitFullscreenWallboard() {
    wasNativeFsRef.current = false;
    onToggleWallboard(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    setTimeout(() => mapRef.current?.invalidateSize(), 200);
  }

  // Re-invalidate Leaflet map size when wallboard or subMode changes
  useEffect(() => {
    if (subMode === 'wallboard') {
      const t = setTimeout(() => mapRef.current?.invalidateSize(), 180);
      return () => clearTimeout(t);
    }
  }, [isWallboard, subMode]);

  const { kpis, zones, dailyTrends, settings, latestImport } = summary;
  const reportingCompletenessPct =
    kpis.expectedReportingWoredas > 0
      ? Math.round(
          (kpis.submittedWoredas / kpis.expectedReportingWoredas) * 1000
        ) / 10
      : 0;

  const isTrulyLive =
    sseConnected && syncStatus === 'synchronized' && lastRefreshedAt !== null;

  const dataSourceLabel = latestImport
    ? latestImport.originalFilename
    : 'Authoritative Baseline Registry (0 daily imports)';

  const dataStatusLabel = !sseConnected
    ? 'Sync Disconnected'
    : syncStatus === 'syncing'
      ? 'Refreshing...'
      : latestImport
        ? 'Synchronized'
        : 'Baseline Ready · Awaiting Daily Import';

  const effectiveDayLabel = selectedDay
    ? `Day ${selectedDay}`
    : summary.availableDays.length > 0
      ? `Days ${summary.availableDays.join(', ')}`
      : 'Day 1 (Baseline)';

  // Map lookup helpers
  const zoneLookup = useMemo(() => {
    const m = new Map<string, (typeof zones)[number]>();
    for (const z of zones) m.set(z.zone.toLowerCase(), z);
    return m;
  }, [zones]);

  const woredaLookup = useMemo(() => {
    const m = new Map<
      string,
      { planned: number; vaccinated: number; afp: number; aefi: number; submitted: boolean }
    >();
    for (const r of reports) {
      const k = r.canonicalWoreda.toLowerCase();
      const prev = m.get(k) ?? {
        planned: r.totalPlannedTarget,
        vaccinated: 0,
        afp: 0,
        aefi: 0,
        submitted: false,
      };
      prev.planned = Math.max(prev.planned, r.totalPlannedTarget);
      prev.vaccinated += r.totalVaccinated0_59;
      prev.afp += r.afpAlertsCount;
      prev.aefi += r.aefiAlertsCount;
      if (r.hasReportedActivity || r.totalVaccinated0_59 > 0 || r.teamsReported > 0) {
        prev.submitted = true;
      }
      m.set(k, prev);
    }
    return m;
  }, [reports]);

  const activeBoundary = useMemo(() => {
    return (
      boundaries.find((b) => b.level === 'woreda') ??
      boundaries.find((b) => b.level === 'zone') ??
      null
    );
  }, [boundaries]);

  // Initialize Leaflet map
  useEffect(() => {
    if (subMode !== 'wallboard') return;
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [7.9, 39.2],
      zoom: 6,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [subMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || subMode !== 'wallboard') return;
    if (geoLayerRef.current) {
      geoLayerRef.current.remove();
      geoLayerRef.current = null;
    }
    if (!activeBoundary) return;

    const nameField = activeBoundary.nameField;
    const layer = L.geoJSON(activeBoundary.geojson, {
      style: (feature) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const key = String(props[nameField] ?? '').trim().toLowerCase();
        let fillColor = '#94A3B8';

        if (activeBoundary.level === 'zone') {
          const z = zoneLookup.get(key);
          if (z) {
            if (z.statusCategory === 'on_target') fillColor = '#16A34A';
            else if (z.statusCategory === 'below_target') fillColor = '#D29441';
            else if (z.statusCategory === 'critical_alert') fillColor = '#DC2626';
          }
        } else {
          const w = woredaLookup.get(key);
          if (w && w.submitted) {
            const cov = w.planned > 0 ? (w.vaccinated / w.planned) * 100 : 0;
            if (w.afp > 0 || w.aefi > 0 || cov < settings.coverageCriticalPct) {
              fillColor = '#DC2626';
            } else if (cov < settings.coverageTargetPct) {
              fillColor = '#D29441';
            } else {
              fillColor = '#16A34A';
            }
          }
        }
        return { color: '#334155', weight: 1, fillColor, fillOpacity: 0.72 };
      },
      onEachFeature: (feature, fLayer) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const label = String(props[nameField] ?? 'Unknown');
        fLayer.bindTooltip(label, { sticky: true });
      },
    }).addTo(map);

    geoLayerRef.current = layer;
    try {
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [12, 12] });
    } catch {
      // ignore
    }
  }, [activeBoundary, zoneLookup, woredaLookup, settings, subMode]);

  const criticalAndAlertZones = useMemo(() => {
    return zones
      .filter(
        (z) =>
          z.statusCategory === 'critical_alert' ||
          z.afpAlerts > 0 ||
          z.aefiAlerts > 0
      )
      .slice(0, 8);
  }, [zones]);

  const sortedZoneAnalytics = useMemo(() => {
    const list = [...(advanced?.zoneAnalytics ?? [])];
    list.sort((a, b) => {
      if (zoneSort === 'coverage') return b.overallCoveragePct - a.overallCoveragePct;
      if (zoneSort === 'target') return b.plannedTarget - a.plannedTarget;
      if (zoneSort === 'gap') return b.targetGap - a.targetGap;
      return a.zone.localeCompare(b.zone);
    });
    return list;
  }, [advanced?.zoneAnalytics, zoneSort]);

  const containerClass = isWallboard
    ? 'fixed inset-0 z-50 bg-slate-50 overflow-y-auto flex flex-col'
    : 'space-y-4';

  return (
    <div className={containerClass}>
      {/* TOP EOC HEADER */}
      <div
        className={`bg-white border border-slate-200 ${
          isWallboard ? 'rounded-none border-x-0 border-t-0 px-6 py-3.5' : 'rounded-lg p-4'
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-bold text-[#485EA9] tracking-tight">
                OROMIA HEALTH BUREAU · EOC
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-slate-900 truncate">
                {activeCampaign?.name ?? 'Round 1 nOPV2 & bOPV2 SIA'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Round: {activeCampaign?.roundCode ?? 'R1-NOV-2026'}</span>
              <span aria-hidden="true">·</span>
              <span>{effectiveDayLabel}</span>
              {selectedZone ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#3A99CF] font-medium">
                    Zone: {selectedZone}
                  </span>
                </>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                {isTrulyLive ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span className="text-emerald-700">LIVE</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-amber-700">
                      {sseConnected ? 'REFRESHING' : 'OFFLINE'}
                    </span>
                  </>
                )}
              </span>
              <span>
                LAST UPDATED:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {formatAddisTime(lastRefreshedAt)} EAT
                </strong>
              </span>
              <span>
                DATA SOURCE:{' '}
                <strong className="text-slate-800">{dataSourceLabel}</strong>
              </span>
              <span>
                LAST IMPORT:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {latestImport
                    ? `${formatAddisTime(latestImport.confirmedAt)} EAT`
                    : 'Pending first import'}
                </strong>
              </span>
              <span>
                DATA STATUS:{' '}
                <strong className="text-slate-800">{dataStatusLabel}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Visible Africa/Addis_Ababa Wallboard Clock */}
            <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono tabular-nums text-slate-900">
              {addisClock} (Africa/Addis_Ababa)
            </div>

            {/* Sub-mode switch preserved in Full-Screen */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSubMode('wallboard')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  subMode === 'wallboard'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Command Wallboard
              </button>
              <button
                type="button"
                onClick={() => setSubMode('advanced')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  subMode === 'advanced'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Advanced Analytics
              </button>
            </div>

            <button
              type="button"
              onClick={onManualRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg whitespace-nowrap"
              title="Synchronize latest server state"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  syncStatus === 'syncing' ? 'animate-spin' : ''
                }`}
              />
              Sync
            </button>

            {isWallboard ? (
              <button
                type="button"
                onClick={exitFullscreenWallboard}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg whitespace-nowrap"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Exit Full-Screen (Esc)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={enterFullscreenWallboard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Full-Screen Mode
                </button>
                <button
                  type="button"
                  onClick={() => onToggleWallboard(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#3A99CF] text-[#3A99CF] hover:bg-[#3A99CF]/10 rounded-lg whitespace-nowrap"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  EOC Wallboard
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Live Alert / Import Notification Banner */}
      {liveAlertBanner ? (
        <div
          className={`${
            isWallboard ? 'mx-6 mt-3' : ''
          } p-3 bg-sky-50 border border-[#3A99CF]/40 rounded-lg text-xs text-slate-900 flex items-center justify-between`}
        >
          <div>
            <strong className="text-[#485EA9]">Live Data Notification:</strong>{' '}
            {liveAlertBanner.message} · {liveAlertBanner.actor} ·{' '}
            <span className="font-mono">
              {formatAddisTime(liveAlertBanner.timestamp)}
            </span>
          </div>
        </div>
      ) : null}

      <div className={isWallboard ? 'p-5 space-y-4 flex-1' : 'space-y-4'}>
        {/* TOP 10 KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 2xl:grid-cols-10 gap-3">
          {[
            {
              label: '1. Planned Target',
              val: fmt(kpis.totalPlannedTarget),
              sub: `Daily: ${fmt(kpis.totalDailyTarget)}`,
              tone: 'text-[#485EA9]',
            },
            {
              label: '2. Vaccinated (0–59m)',
              val: fmt(kpis.totalChildrenVaccinated0_59),
              sub: `60–120m: ${fmt(kpis.totalChildrenVaccinated60_120)}`,
              tone: 'text-[#3A99CF]',
            },
            {
              label: '3. Overall Coverage',
              val: `${kpis.overallVaccinationCoveragePct}%`,
              sub: `Target: ${settings.coverageTargetPct}%`,
              tone:
                kpis.overallVaccinationCoveragePct >= settings.coverageTargetPct
                  ? 'text-emerald-700'
                  : kpis.overallVaccinationCoveragePct > 0
                    ? 'text-[#D29441]'
                    : 'text-slate-900',
            },
            {
              label: '4. Daily Coverage',
              val: `${kpis.dailyVaccinationCoveragePct}%`,
              sub: effectiveDayLabel,
              tone: 'text-[#3A99CF]',
            },
            {
              label: '5. Completeness',
              val: `${reportingCompletenessPct}%`,
              sub: `${kpis.submittedWoredas}/${kpis.expectedReportingWoredas}`,
              tone:
                reportingCompletenessPct >= 90
                  ? 'text-emerald-700'
                  : 'text-[#D29441]',
            },
            {
              label: '6. Reporting Woredas',
              val: fmt(kpis.submittedWoredas),
              sub: `Of ${fmt(kpis.expectedReportingWoredas)} expected`,
              tone: 'text-emerald-700',
            },
            {
              label: '7. Pending Reports',
              val: fmt(kpis.pendingWoredas),
              sub: 'Woredas awaiting',
              tone: kpis.pendingWoredas > 0 ? 'text-[#D29441]' : 'text-emerald-700',
            },
            {
              label: '8. Vaccination Teams',
              val: `${fmt(kpis.reportingVaccinationTeams)} / ${fmt(kpis.totalVaccinationTeams)}`,
              sub: 'Reporting / Deployed',
              tone: 'text-slate-900',
            },
            {
              label: '9. AFP Alerts',
              val: fmt(kpis.afpAlertsTotal),
              sub: `Verified: ${fmt(kpis.afpVerifiedCasesTotal)}`,
              tone: kpis.afpAlertsTotal > 0 ? 'text-red-700' : 'text-slate-900',
            },
            {
              label: '10. AEFI Alerts',
              val: fmt(kpis.aefiAlertsTotal),
              sub: `Verified: ${fmt(kpis.aefiVerifiedCasesTotal)}`,
              tone: kpis.aefiAlertsTotal > 0 ? 'text-[#D29441]' : 'text-slate-900',
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`bg-white border border-slate-200 rounded-lg ${
                isWallboard ? 'p-4' : 'p-3.5'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-500 truncate">
                {card.label}
              </div>
              <div
                className={`mt-1.5 font-semibold tabular-nums tracking-tight ${
                  isWallboard ? 'text-2xl' : 'text-xl'
                } ${card.tone}`}
              >
                {card.val}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 truncate">
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {subMode === 'wallboard' ? (
          <>
            {/* MAIN VISUALIZATION AREA: Left Map + Critical Locations | Right Daily Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* LEFT: Interactive Oromia Map & Critical/Alert Status */}
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Oromia Region Geographic Coverage &amp; Alert Map
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A]" /> Target
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#D29441]" /> Below
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]" /> Critical/Alert
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#94A3B8]" /> No Report
                      </span>
                    </div>
                  </div>
                  {selectedZone ? (
                    <button
                      type="button"
                      onClick={() => onSelectZone(null)}
                      className="text-xs text-[#3A99CF] hover:underline"
                    >
                      Clear Zone Filter
                    </button>
                  ) : null}
                </div>

                <div className="relative rounded-lg overflow-hidden border border-slate-200">
                  <div
                    ref={mapContainerRef}
                    className={isWallboard ? 'h-[340px] w-full' : 'h-[300px] w-full'}
                  />
                  {!activeBoundary ? (
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 z-[400] bg-white/95 border border-slate-200 rounded p-2.5 text-[11px] text-slate-700 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#3A99CF] shrink-0" />
                      <span>
                        Upload GeoJSON/Shapefile in Geographic Performance to shade boundaries. Zone matrix below reflects live imported figures.
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Critical & Alert Locations Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#D29441]" />
                      Critical Performance Zones ({criticalAndAlertZones.length})
                    </div>
                    {criticalAndAlertZones.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No zones flagged critical under current filter.
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-28 overflow-y-auto text-[11px]">
                        {criticalAndAlertZones.map((z) => (
                          <button
                            key={z.zone}
                            type="button"
                            onClick={() => onSelectZone(z.zone)}
                            className="w-full flex justify-between text-left hover:bg-slate-50 px-1 py-0.5 rounded"
                          >
                            <span className="font-medium text-slate-800 truncate">
                              {z.zone}
                            </span>
                            <span className="font-mono tabular-nums text-red-700 shrink-0">
                              {z.overallCoveragePct}% · AFP:{z.afpAlerts} AEFI:{z.aefiAlerts}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                      Active Alert Locations ({alerts.length})
                    </div>
                    {alerts.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No active AFP/AEFI alerts reported.
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-28 overflow-y-auto text-[11px]">
                        {alerts.slice(0, 6).map((a) => (
                          <div key={a.id} className="flex justify-between gap-2">
                            <span className="truncate text-slate-800">
                              {a.alertType} · {a.canonicalWoreda}
                            </span>
                            <span className="font-mono text-red-700 shrink-0">
                              {a.administrativeAlertCount} (Day {a.campaignDayNum})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT: Daily Vaccination, Planned vs Vaccinated, Cumulative Coverage & Reporting Trend */}
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Daily Vaccination, Cumulative Coverage &amp; Reporting Completeness
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Automatically updated upon every confirmed Excel/CSV import
                  </p>
                </div>

                {dailyTrends.length === 0 ? (
                  <div className="flex-1 min-h-[300px] flex items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50 text-xs text-slate-500 text-center px-6">
                    No daily reporting records imported yet. Upload a completed Day 1–4 file in the Data Upload Center to render live vaccination and reporting trends.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    <div className={isWallboard ? 'h-[220px]' : 'h-[190px]'}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dailyTrends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 11 }}
                            unit="%"
                          />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar
                            yAxisId="left"
                            dataKey="dailyTarget"
                            name="Daily Target"
                            fill="#CBD5E1"
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="vaccinated0_59"
                            name="Vaccinated (0–59m)"
                            fill="#3A99CF"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulativeCoveragePct"
                            name="Cumulative Coverage %"
                            stroke="#485EA9"
                            strokeWidth={2.5}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    <div className={isWallboard ? 'h-[190px]' : 'h-[165px]'}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyTrends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Line
                            type="monotone"
                            dataKey="dailyCoveragePct"
                            name="Daily Coverage %"
                            stroke="#D29441"
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="completenessPct"
                            name="Reporting Completeness %"
                            stroke="#16A34A"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM ANALYTICS (7 Operational Panels) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {/* 1. Age-group performance */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Age-Group (0–120m)</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">0–11m:</span>
                    <span className="font-medium">
                      {fmt(advanced?.ageGroups.age0_11Total ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">12–59m:</span>
                    <span className="font-medium">
                      {fmt(advanced?.ageGroups.age12_59Total ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">60–120m:</span>
                    <span className="font-medium">
                      {fmt(advanced?.ageGroups.age60_120Total ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. nOPV2 & bOPV utilization */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Vaccine Utilization</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">nOPV2 Used/Recv:</span>
                    <span className="font-medium">
                      {fmt(kpis.nopv2VialsUsed)}/{fmt(kpis.nopv2VialsReceived)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">bOPV Used/Recv:</span>
                    <span className="font-medium">
                      {fmt(kpis.bopvVialsUsed)}/{fmt(kpis.bopvVialsReceived)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Vaccine wastage */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Vaccine Wastage</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">nOPV2 Wastage:</span>
                    <span className="font-semibold text-[#485EA9]">
                      {kpis.nopv2WastageRatePct !== null
                        ? `${kpis.nopv2WastageRatePct}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">bOPV Wastage:</span>
                    <span className="font-semibold text-[#D29441]">
                      {kpis.bopvWastageRatePct !== null
                        ? `${kpis.bopvWastageRatePct}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Zero-dose performance */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Zero-Dose Reach</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Identified:</span>
                    <span>{fmt(kpis.zeroDoseIdentified)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vaccinated:</span>
                    <span className="font-semibold text-emerald-700">
                      {fmt(kpis.zeroDoseVaccinated)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Conversion:</span>
                    <span>
                      {advanced?.integrationMetrics.zdConversionPct ?? 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Under-vaccinated performance */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Under-Vaccinated</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Identified:</span>
                    <span>{fmt(kpis.underVaccinatedIdentified)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vaccinated:</span>
                    <span className="font-semibold text-[#3A99CF]">
                      {fmt(kpis.underVaccinatedVaccinated)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Conversion:</span>
                    <span>
                      {advanced?.integrationMetrics.uvConversionPct ?? 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 6. Social mobilization */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Social Mobilization</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">HHs Visited:</span>
                    <span>{fmt(kpis.smHhsVisited)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Meetings:</span>
                    <span>{fmt(kpis.smGroupDiscussions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IPC Reached:</span>
                    <span>{fmt(kpis.smIpcReached)}</span>
                  </div>
                </div>
              </div>

              {/* 7. Team reporting */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
                <div className="font-semibold text-slate-800">Team Reporting</div>
                <div className="mt-2 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Deployed:</span>
                    <span>{fmt(kpis.totalVaccinationTeams)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reported:</span>
                    <span className="font-semibold text-emerald-700">
                      {fmt(kpis.reportingVaccinationTeams)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rate:</span>
                    <span>
                      {advanced?.integrationMetrics.teamsReportingPct ?? 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ADVANCED ANALYTICS SUB-VIEW (Preserves Full-Screen Mode) */
          <div className="space-y-5">
            {/* Vaccination Performance Summary */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                A. Vaccination Performance &amp; Target Achievement Analytics
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Planned Target</div>
                  <div className="mt-1 text-base font-semibold tabular-nums">
                    {fmt(advanced?.vaccinationPerformance.totalPlannedTarget)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Vaccinated (0–59m)</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-[#3A99CF]">
                    {fmt(advanced?.vaccinationPerformance.totalVaccinated0_59)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Remaining Target</div>
                  <div className="mt-1 text-base font-semibold tabular-nums">
                    {fmt(advanced?.vaccinationPerformance.remainingTarget)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Daily Coverage</div>
                  <div className="mt-1 text-base font-semibold tabular-nums">
                    {advanced?.vaccinationPerformance.dailyVaccinationCoveragePct ?? 0}%
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Cumulative Coverage</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-[#485EA9]">
                    {advanced?.vaccinationPerformance.cumulativeVaccinationCoveragePct ?? 0}%
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Vaccinated Before</div>
                  <div className="mt-1 text-base font-semibold tabular-nums">
                    {fmt(advanced?.ageGroups.totalVaccinatedBefore)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500">Not Vacc. Before</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-[#D29441]">
                    {fmt(advanced?.ageGroups.totalNotVaccinatedBefore)}
                  </div>
                </div>
              </div>
            </div>

            {/* Age Group & Prior Status Chart + Top/Critical Woredas */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Age-Group &amp; Prior Vaccination Status Matrix
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          cohort: '0–11m',
                          before: advanced?.ageGroups.age0_11Before ?? 0,
                          notBefore: advanced?.ageGroups.age0_11NotBefore ?? 0,
                        },
                        {
                          cohort: '12–59m',
                          before: advanced?.ageGroups.age12_59Before ?? 0,
                          notBefore: advanced?.ageGroups.age12_59NotBefore ?? 0,
                        },
                        {
                          cohort: '60–120m',
                          before: advanced?.ageGroups.age60_120Before ?? 0,
                          notBefore: advanced?.ageGroups.age60_120NotBefore ?? 0,
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="cohort" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar
                        dataKey="before"
                        name="Previously Vaccinated"
                        stackId="a"
                        fill="#485EA9"
                      />
                      <Bar
                        dataKey="notBefore"
                        name="Not Previously Vaccinated"
                        stackId="a"
                        fill="#D29441"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Zone Performance &amp; Target Achievement Analytics ({sortedZoneAnalytics.length})
                  </h3>
                  <select
                    value={zoneSort}
                    onChange={(e) =>
                      setZoneSort(e.target.value as typeof zoneSort)
                    }
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                  >
                    <option value="coverage">Sort: Coverage %</option>
                    <option value="target">Sort: Planned Target</option>
                    <option value="gap">Sort: Remaining Gap</option>
                    <option value="zone">Sort: Zone Name</option>
                  </select>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Zone</th>
                        <th className="text-right font-medium px-2 py-2">Target</th>
                        <th className="text-right font-medium px-2 py-2">Vacc. 0–59m</th>
                        <th className="text-right font-medium px-2 py-2">Coverage</th>
                        <th className="text-right font-medium px-2 py-2">Gap</th>
                        <th className="text-right font-medium px-2 py-2">Prior Vacc %</th>
                        <th className="text-right font-medium px-3 py-2">ZD Conv %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedZoneAnalytics.map((z) => (
                        <tr
                          key={z.zone}
                          onClick={() => onSelectZone(z.zone)}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {z.zone}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {fmt(z.plannedTarget)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium">
                            {fmt(z.vaccinated0_59)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-[#485EA9]">
                            {z.overallCoveragePct}%
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                            {fmt(z.targetGap)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {z.priorVaccinatedSharePct}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {z.zdConversionPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* B. Vaccine Accountability & C. Integration Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  B. Vaccine Accountability (nOPV2 vs bOPV Vials)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Indicator</th>
                        <th className="text-right font-medium px-3 py-2">nOPV2</th>
                        <th className="text-right font-medium px-3 py-2">bOPV</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      <tr>
                        <td className="px-3 py-2 text-slate-700">Vials Received</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {fmt(advanced?.vaccineAccountability.nopv2.received)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {fmt(advanced?.vaccineAccountability.bopv.received)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-slate-700">Vials Used</td>
                        <td className="px-3 py-2 text-right font-medium text-[#485EA9]">
                          {fmt(advanced?.vaccineAccountability.nopv2.used)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-[#3A99CF]">
                          {fmt(advanced?.vaccineAccountability.bopv.used)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-slate-700">Partially Used</td>
                        <td className="px-3 py-2 text-right">
                          {fmt(advanced?.vaccineAccountability.nopv2.partiallyUsed)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmt(advanced?.vaccineAccountability.bopv.partiallyUsed)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-slate-700">Returned Unused (Good)</td>
                        <td className="px-3 py-2 text-right">
                          {fmt(advanced?.vaccineAccountability.nopv2.returnedGood)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmt(advanced?.vaccineAccountability.bopv.returnedGood)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-slate-700">Broken / Bad / Lost</td>
                        <td className="px-3 py-2 text-right">
                          {fmt(
                            (advanced?.vaccineAccountability.nopv2.broken ?? 0) +
                              (advanced?.vaccineAccountability.nopv2.returnedBad ?? 0) +
                              (advanced?.vaccineAccountability.nopv2.lost ?? 0)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmt(
                            (advanced?.vaccineAccountability.bopv.broken ?? 0) +
                              (advanced?.vaccineAccountability.bopv.returnedBad ?? 0) +
                              (advanced?.vaccineAccountability.bopv.lost ?? 0)
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium text-slate-900">Wastage Rate %</td>
                        <td className="px-3 py-2 text-right font-semibold text-[#485EA9]">
                          {advanced?.vaccineAccountability.nopv2.wastagePct !== null &&
                          advanced?.vaccineAccountability.nopv2.wastagePct !== undefined
                            ? `${advanced.vaccineAccountability.nopv2.wastagePct}%`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[#D29441]">
                          {advanced?.vaccineAccountability.bopv.wastagePct !== null &&
                          advanced?.vaccineAccountability.bopv.wastagePct !== undefined
                            ? `${advanced.vaccineAccountability.bopv.wastagePct}%`
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  C. Integration, Equity &amp; Team Performance Metrics
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-slate-500">ZD Conversion</div>
                    <div className="mt-1 text-lg font-semibold text-emerald-700">
                      {advanced?.integrationMetrics.zdConversionPct ?? 0}%
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {fmt(advanced?.integrationMetrics.zdVaccinated)} /{' '}
                      {fmt(advanced?.integrationMetrics.zdIdentified)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-slate-500">UV Conversion</div>
                    <div className="mt-1 text-lg font-semibold text-[#3A99CF]">
                      {advanced?.integrationMetrics.uvConversionPct ?? 0}%
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {fmt(advanced?.integrationMetrics.uvVaccinated)} /{' '}
                      {fmt(advanced?.integrationMetrics.uvIdentified)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-slate-500">Teams Reporting</div>
                    <div className="mt-1 text-lg font-semibold text-[#485EA9]">
                      {advanced?.integrationMetrics.teamsReportingPct ?? 0}%
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {fmt(advanced?.integrationMetrics.teamsReported)} /{' '}
                      {fmt(advanced?.integrationMetrics.teamsTotal)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-slate-500">SM Households</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {fmt(advanced?.integrationMetrics.smHhsVisited)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      IPC: {fmt(advanced?.integrationMetrics.smIpcReached)}
                    </div>
                  </div>
                </div>

                {/* Top & Critical Woreda Highlight */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="font-semibold text-emerald-800 mb-1.5">
                      Top Performing Woredas
                    </div>
                    {(advanced?.topWoredas ?? []).length === 0 ? (
                      <div className="text-slate-500 text-[11px]">Awaiting daily imports</div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {(advanced?.topWoredas ?? []).slice(0, 5).map((w) => (
                          <div key={`${w.zone}-${w.woreda}`} className="flex justify-between gap-2">
                            <span className="truncate text-slate-800">
                              {w.woreda} ({w.zone})
                            </span>
                            <span className="font-mono tabular-nums text-emerald-700 shrink-0">
                              {w.coveragePct}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="font-semibold text-red-700 mb-1.5">
                      Critical / Priority Woredas
                    </div>
                    {(advanced?.criticalWoredas ?? []).length === 0 ? (
                      <div className="text-slate-500 text-[11px]">No critical woredas flagged</div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {(advanced?.criticalWoredas ?? []).slice(0, 5).map((w) => (
                          <div key={`${w.zone}-${w.woreda}`} className="flex justify-between gap-2">
                            <span className="truncate text-slate-800">
                              {w.woreda} ({w.zone})
                            </span>
                            <span className="font-mono tabular-nums text-red-700 shrink-0">
                              {w.coveragePct}% · A:{w.afpAlerts + w.aefiAlerts}
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
        )}
      </div>
    </div>
  );
};
