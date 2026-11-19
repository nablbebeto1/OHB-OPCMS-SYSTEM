import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import type {
  CommandRoomStateResponse,
  GeoBoundaryRecord,
} from '../types/opcms';

interface CommandRoomMapProps {
  state: CommandRoomStateResponse;
  boundaries: GeoBoundaryRecord[];
  mode: 'coverage' | 'reporting';
  heightClass?: string;
}

export const CommandRoomMap: React.FC<CommandRoomMapProps> = ({
  state,
  boundaries,
  mode,
  heightClass = 'h-[320px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);

  const activeBoundary = useMemo(() => {
    return (
      boundaries.find((b) => b.level === 'woreda') ??
      boundaries.find((b) => b.level === 'zone') ??
      null
    );
  }, [boundaries]);

  const zoneLookup = useMemo(() => {
    const m = new Map<string, (typeof state.zones)[number]>();
    for (const z of state.zones) {
      m.set(z.zone.toLowerCase(), z);
    }
    return m;
  }, [state.zones]);

  const woredaLookup = useMemo(() => {
    const m = new Map<string, (typeof state.woredaStatuses)[number]>();
    for (const w of state.woredaStatuses) {
      m.set(w.woreda.toLowerCase(), w);
    }
    return m;
  }, [state.woredaStatuses]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [7.85, 39.25],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }

    if (!activeBoundary) {
      setTimeout(() => map.invalidateSize(), 120);
      return;
    }

    const field = activeBoundary.nameField;
    const layer = L.geoJSON(activeBoundary.geojson, {
      style: (feature) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const key = String(props[field] ?? '').trim().toLowerCase();
        let fillColor = '#94A3B8'; // Gray: No data available

        if (activeBoundary.level === 'zone') {
          const z = zoneLookup.get(key);
          if (z) {
            if (mode === 'reporting') {
              if (z.completenessPct >= 95) fillColor = '#16A34A';
              else if (z.completenessPct >= 75) fillColor = '#D29441';
              else if (z.submittedWoredas > 0) fillColor = '#DC2626';
              else fillColor = '#94A3B8';
            } else {
              if (z.statusCategory === 'on_target') fillColor = '#16A34A';
              else if (z.statusCategory === 'below_target') fillColor = '#D29441';
              else if (z.statusCategory === 'critical_alert') fillColor = '#DC2626';
            }
          }
        } else {
          const w = woredaLookup.get(key);
          if (w) {
            if (mode === 'reporting') {
              if (w.submitted) fillColor = '#16A34A';
              else fillColor = '#D29441';
            } else if (w.submitted) {
              if (w.statusCategory === 'on_target') fillColor = '#16A34A';
              else if (w.statusCategory === 'below_target') fillColor = '#D29441';
              else if (w.statusCategory === 'critical_alert') fillColor = '#DC2626';
            }
          }
        }

        return {
          color: '#334155',
          weight: 1,
          fillColor,
          fillOpacity: 0.74,
        };
      },
      onEachFeature: (feature, fLayer) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const label = String(props[field] ?? 'Unknown');
        const key = label.trim().toLowerCase();
        if (activeBoundary.level === 'zone') {
          const z = zoneLookup.get(key);
          fLayer.bindTooltip(
            z
              ? `${z.zone}: ${z.overallCoveragePct}% coverage · ${z.completenessPct}% reported`
              : label,
            { sticky: true }
          );
        } else {
          const w = woredaLookup.get(key);
          fLayer.bindTooltip(
            w
              ? `${w.woreda} (${w.zone}): ${w.coveragePct}% · ${
                  w.submitted ? 'Submitted' : 'Pending'
                }`
              : label,
            { sticky: true }
          );
        }
      },
    }).addTo(map);

    layerRef.current = layer;
    try {
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [14, 14] });
    } catch {
      // ignore
    }
    setTimeout(() => map.invalidateSize(), 150);
  }, [activeBoundary, zoneLookup, woredaLookup, mode]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      {!activeBoundary ? (
        <div className="absolute bottom-3 left-3 right-3 z-[400] bg-white/95 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#3A99CF] shrink-0" />
          <span>
            Oromia Region map ready. Upload administrative GeoJSON or zipped Shapefile boundaries in Geographic Performance to shade woreda/zone polygons.
          </span>
        </div>
      ) : null}
    </div>
  );
};
