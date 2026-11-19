import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Upload, MapPin } from 'lucide-react';
import { api, type DashboardSummaryResponse } from '../../api/client';
import type {
  CampaignDailyReport,
  GeoBoundaryRecord,
  UserRole,
} from '../../types/opcms';

interface GeographicMapViewProps {
  summary: DashboardSummaryResponse;
  reports: CampaignDailyReport[];
  boundaries: GeoBoundaryRecord[];
  userRole: UserRole;
  onSelectZone: (zone: string) => void;
  onSelectWoreda: (zone: string, woreda: string) => void;
  onBoundaryUploaded: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export const GeographicMapView: React.FC<GeographicMapViewProps> = ({
  summary,
  reports,
  boundaries,
  userRole,
  onSelectZone,
  onSelectWoreda,
  onBoundaryUploaded,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);

  const [level, setLevel] = useState<'zone' | 'woreda'>('woreda');
  const [selectedFeatureDetail, setSelectedFeatureDetail] = useState<{
    title: string;
    subtitle: string;
    plannedTarget: number;
    vaccinated: number;
    coveragePct: number;
    afp: number;
    aefi: number;
    zdVacc: number;
    uvVacc: number;
    status: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canUploadGeo =
    userRole === 'system_admin' || userRole === 'central_command';

  // Build lookup maps for zone and woreda metrics
  const zoneLookup = useMemo(() => {
    const m = new Map<string, (typeof summary.zones)[number]>();
    for (const z of summary.zones) {
      m.set(z.zone.toLowerCase(), z);
    }
    return m;
  }, [summary.zones]);

  const woredaLookup = useMemo(() => {
    const m = new Map<
      string,
      {
        zone: string;
        woreda: string;
        planned: number;
        vaccinated: number;
        afp: number;
        aefi: number;
        zdVacc: number;
        uvVacc: number;
        submitted: boolean;
      }
    >();
    for (const r of reports) {
      const k = r.canonicalWoreda.toLowerCase();
      const prev = m.get(k) ?? {
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        planned: r.totalPlannedTarget,
        vaccinated: 0,
        afp: 0,
        aefi: 0,
        zdVacc: 0,
        uvVacc: 0,
        submitted: false,
      };
      prev.planned = Math.max(prev.planned, r.totalPlannedTarget);
      prev.vaccinated += r.totalVaccinated0_59;
      prev.afp += r.afpAlertsCount;
      prev.aefi += r.aefiAlertsCount;
      prev.zdVacc += r.zdVaccinated;
      prev.uvVacc += r.uvVaccinated;
      if (r.hasReportedActivity || r.totalVaccinated0_59 > 0 || r.teamsReported > 0) {
        prev.submitted = true;
      }
      m.set(k, prev);
    }
    return m;
  }, [reports]);

  const activeBoundary = useMemo(() => {
    return (
      boundaries.find((b) => b.level === level) ?? boundaries[0] ?? null
    );
  }, [boundaries, level]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [7.9, 39.2], // Oromia geographic center
      zoom: 6,
      zoomControl: true,
    });

    // Offline-safe Carto/OSM tile layer with graceful degradation
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render supplied GeoJSON/Shapefile layer when available
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (geoLayerRef.current) {
      geoLayerRef.current.remove();
      geoLayerRef.current = null;
    }

    if (!activeBoundary) return;

    const { coverageTargetPct, coverageCriticalPct } = summary.settings;
    const nameField = activeBoundary.nameField;

    const layer = L.geoJSON(activeBoundary.geojson, {
      style: (feature) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const rawName = String(props[nameField] ?? '').trim();
        const key = rawName.toLowerCase();

        let fillColor = '#94A3B8'; // Gray: No report received
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
            if (w.afp > 0 || w.aefi > 0 || cov < coverageCriticalPct) {
              fillColor = '#DC2626';
            } else if (cov < coverageTargetPct) {
              fillColor = '#D29441';
            } else {
              fillColor = '#16A34A';
            }
          }
        }

        return {
          color: '#334155',
          weight: 1,
          fillColor,
          fillOpacity: 0.7,
        };
      },
      onEachFeature: (feature, fLayer) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const rawName = String(props[nameField] ?? 'Unknown Location').trim();
        const key = rawName.toLowerCase();

        fLayer.on('click', () => {
          if (activeBoundary.level === 'zone') {
            const z = zoneLookup.get(key);
            if (z) {
              setSelectedFeatureDetail({
                title: z.zone,
                subtitle: `${z.submittedWoredas}/${z.woredaCount} woredas reported`,
                plannedTarget: z.plannedTarget,
                vaccinated: z.vaccinated0_59,
                coveragePct: z.overallCoveragePct,
                afp: z.afpAlerts,
                aefi: z.aefiAlerts,
                zdVacc: z.zdVaccinated,
                uvVacc: z.uvVaccinated,
                status: z.statusCategory.replace(/_/g, ' '),
              });
              onSelectZone(z.zone);
            }
          } else {
            const w = woredaLookup.get(key);
            const cov =
              w && w.planned > 0
                ? Math.round((w.vaccinated / w.planned) * 10000) / 100
                : 0;
            setSelectedFeatureDetail({
              title: w?.woreda ?? rawName,
              subtitle: w ? `Zone: ${w.zone}` : 'Boundary Feature',
              plannedTarget: w?.planned ?? 0,
              vaccinated: w?.vaccinated ?? 0,
              coveragePct: cov,
              afp: w?.afp ?? 0,
              aefi: w?.aefi ?? 0,
              zdVacc: w?.zdVacc ?? 0,
              uvVacc: w?.uvVacc ?? 0,
              status: w?.submitted ? 'Reported' : 'No report received',
            });
            if (w) onSelectWoreda(w.zone, w.woreda);
          }
        });

        fLayer.bindTooltip(rawName, { sticky: true });
      },
    }).addTo(map);

    geoLayerRef.current = layer;
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] });
    } catch {
      // ignore invalid bounds
    }
  }, [activeBoundary, zoneLookup, woredaLookup, summary.settings]);

  async function handleBoundaryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadGeoBoundary(file, level);
      onBoundaryUploaded();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-5">
      {/* Map Controls & Legend */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setLevel('woreda')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                level === 'woreda'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Woreda Level
            </button>
            <button
              type="button"
              onClick={() => setLevel('zone')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                level === 'zone'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Zone Level
            </button>
          </div>

          {/* Required Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#16A34A] inline-block" />
              Meeting Target (&ge;{summary.settings.coverageTargetPct}%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#D29441] inline-block" />
              Below Target
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#DC2626] inline-block" />
              Critical / Alert
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#94A3B8] inline-block" />
              No Report Received
            </span>
          </div>
        </div>

        {canUploadGeo ? (
          <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg cursor-pointer shrink-0">
            <Upload className="w-3.5 h-3.5" />
            {uploading
              ? 'Importing Boundary...'
              : 'Import GeoJSON / Shapefile (.zip)'}
            <input
              type="file"
              accept=".geojson,.json,.zip"
              onChange={handleBoundaryUpload}
              className="hidden"
            />
          </label>
        ) : null}
      </div>

      {uploadError ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {uploadError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden relative">
          <div ref={mapContainerRef} className="h-[480px] w-full" />
          {!activeBoundary ? (
            <div className="absolute bottom-4 left-4 right-4 z-[400] bg-white/95 border border-slate-200 rounded-lg p-3.5 shadow-sm flex items-start gap-3">
              <MapPin className="w-4 h-4 text-[#3A99CF] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">
                  Official Geographic Boundary Files Not Yet Imported.
                </span>{' '}
                To preserve strict spatial accuracy, OHB-OPCMS never fabricates zone or woreda polygons. Upload an official Oromia GeoJSON (`.geojson`) or zipped Shapefile (`.zip`) above to activate polygon shading, or click any Zone in the adjacent performance panel.
              </div>
            </div>
          ) : null}
        </div>

        {/* Drill-down Panel */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 flex flex-col max-h-[480px]">
          {selectedFeatureDetail ? (
            <div className="mb-4 pb-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedFeatureDetail.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedFeatureDetail(null)}
                  className="text-xs text-[#3A99CF] hover:underline"
                >
                  All Zones
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedFeatureDetail.subtitle} · {selectedFeatureDetail.status}
              </p>
              <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs">
                <div className="p-2.5 bg-slate-50 rounded">
                  <div className="text-slate-500">Planned Target</div>
                  <div className="font-semibold tabular-nums mt-0.5">
                    {fmt(selectedFeatureDetail.plannedTarget)}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded">
                  <div className="text-slate-500">Vaccinated 0–59m</div>
                  <div className="font-semibold tabular-nums mt-0.5">
                    {fmt(selectedFeatureDetail.vaccinated)} (
                    {selectedFeatureDetail.coveragePct}%)
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded">
                  <div className="text-slate-500">AFP / AEFI Alerts</div>
                  <div className="font-semibold tabular-nums mt-0.5">
                    {selectedFeatureDetail.afp} / {selectedFeatureDetail.aefi}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded">
                  <div className="text-slate-500">Zero-Dose / UV Vacc.</div>
                  <div className="font-semibold tabular-nums mt-0.5">
                    {fmt(selectedFeatureDetail.zdVacc)} /{' '}
                    {fmt(selectedFeatureDetail.uvVacc)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <h3 className="text-xs font-semibold text-slate-700 mb-2">
            Oromia Zones &amp; City Administrations ({summary.zones.length})
          </h3>
          <div className="overflow-y-auto divide-y divide-slate-100 flex-1 pr-1">
            {summary.zones.map((z) => {
              const dotColor =
                z.statusCategory === 'on_target'
                  ? 'bg-[#16A34A]'
                  : z.statusCategory === 'below_target'
                    ? 'bg-[#D29441]'
                    : z.statusCategory === 'critical_alert'
                      ? 'bg-[#DC2626]'
                      : 'bg-[#94A3B8]';
              return (
                <button
                  key={z.zone}
                  type="button"
                  onClick={() => {
                    setSelectedFeatureDetail({
                      title: z.zone,
                      subtitle: `${z.submittedWoredas}/${z.woredaCount} woredas reported`,
                      plannedTarget: z.plannedTarget,
                      vaccinated: z.vaccinated0_59,
                      coveragePct: z.overallCoveragePct,
                      afp: z.afpAlerts,
                      aefi: z.aefiAlerts,
                      zdVacc: z.zdVaccinated,
                      uvVacc: z.uvVaccinated,
                      status: z.statusCategory.replace(/_/g, ' '),
                    });
                    onSelectZone(z.zone);
                  }}
                  className="w-full py-2.5 px-2 text-left hover:bg-slate-50 rounded flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-900 truncate">
                      <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${dotColor}`} />
                      <span className="truncate">{z.zone}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {z.submittedWoredas}/{z.woredaCount} woredas · Target{' '}
                      {fmt(z.plannedTarget)}
                    </div>
                  </div>
                  <div className="text-xs font-mono tabular-nums font-semibold text-slate-800 shrink-0">
                    {z.overallCoveragePct}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
