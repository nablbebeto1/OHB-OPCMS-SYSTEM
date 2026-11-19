import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CampaignDailyReport, SystemSettings } from '../../types/opcms';

interface VaccineUtilizationViewProps {
  reports: CampaignDailyReport[];
  settings: SystemSettings;
}

function fmt(n: number | null): string {
  return n === null ? 'Not Reported' : n.toLocaleString('en-US');
}

export const VaccineUtilizationView: React.FC<VaccineUtilizationViewProps> = ({
  reports,
  settings,
}) => {
  const [activeVaccine, setActiveVaccine] = useState<'nopv2' | 'bopv'>('nopv2');

  const aggregates = useMemo(() => {
    const sumNullable = (getter: (r: CampaignDailyReport) => number | null) => {
      const present = reports.filter((r) => getter(r) !== null);
      if (present.length === 0) return null;
      return present.reduce((a, r) => a + (getter(r) ?? 0), 0);
    };

    const buildStats = (prefix: 'nopv2' | 'bopv') => {
      const received = sumNullable((r) =>
        prefix === 'nopv2' ? r.nopv2VialsReceived : r.bopvVialsReceived
      );
      const used = sumNullable((r) =>
        prefix === 'nopv2' ? r.nopv2VialsUsed : r.bopvVialsUsed
      );
      const partiallyUsed = sumNullable((r) =>
        prefix === 'nopv2' ? r.nopv2VialsPartiallyUsed : r.bopvVialsPartiallyUsed
      );
      const returnedUnusedGood = sumNullable((r) =>
        prefix === 'nopv2'
          ? r.nopv2VialsReturnedUnusedGood
          : r.bopvVialsReturnedUnusedGood
      );
      const broken = sumNullable((r) =>
        prefix === 'nopv2' ? r.nopv2VialsBroken : r.bopvVialsBroken
      );
      const returnedBad = sumNullable((r) =>
        prefix === 'nopv2' ? r.nopv2VialsReturnedBad : r.bopvVialsReturnedBad
      );
      const lost = sumNullable((r) =>
        prefix === 'nopv2' ? r.nopv2VialsLost : r.bopvVialsLost
      );

      const wastageValues = reports
        .map((r) =>
          prefix === 'nopv2' ? r.nopv2WastageRatePct : r.bopvWastageRatePct
        )
        .filter((v): v is number => v !== null);

      const avgWastage =
        wastageValues.length > 0
          ? Math.round(
              (wastageValues.reduce((a, b) => a + b, 0) / wastageValues.length) *
                100
            ) / 100
          : null;

      return {
        received,
        used,
        partiallyUsed,
        returnedUnusedGood,
        broken,
        returnedBad,
        lost,
        avgWastage,
      };
    };

    return {
      nopv2: buildStats('nopv2'),
      bopv: buildStats('bopv'),
    };
  }, [reports]);

  const current = aggregates[activeVaccine];
  const label = activeVaccine === 'nopv2' ? 'nOPV2' : 'bOPV';

  // Detect stock discrepancies & unusual wastage without inventing stock balances
  const stockWarnings = useMemo(() => {
    const list: Array<{
      id: number;
      zone: string;
      woreda: string;
      day: number;
      message: string;
    }> = [];
    for (const r of reports) {
      const recv =
        activeVaccine === 'nopv2' ? r.nopv2VialsReceived : r.bopvVialsReceived;
      const used =
        activeVaccine === 'nopv2' ? r.nopv2VialsUsed : r.bopvVialsUsed;
      const part =
        activeVaccine === 'nopv2'
          ? r.nopv2VialsPartiallyUsed
          : r.bopvVialsPartiallyUsed;
      const retGood =
        activeVaccine === 'nopv2'
          ? r.nopv2VialsReturnedUnusedGood
          : r.bopvVialsReturnedUnusedGood;
      const broken =
        activeVaccine === 'nopv2' ? r.nopv2VialsBroken : r.bopvVialsBroken;
      const retBad =
        activeVaccine === 'nopv2'
          ? r.nopv2VialsReturnedBad
          : r.bopvVialsReturnedBad;
      const lost =
        activeVaccine === 'nopv2' ? r.nopv2VialsLost : r.bopvVialsLost;
      const wastage =
        activeVaccine === 'nopv2'
          ? r.nopv2WastageRatePct
          : r.bopvWastageRatePct;

      if (r.hasReportedActivity && recv === null && used === null) {
        list.push({
          id: r.id,
          zone: r.canonicalZone,
          woreda: r.canonicalWoreda,
          day: r.campaignDayNum,
          message: `Missing ${label} stock accountability figures despite vaccination activity.`,
        });
      } else if (
        recv !== null &&
        (used ?? 0) +
          (part ?? 0) +
          (retGood ?? 0) +
          (broken ?? 0) +
          (retBad ?? 0) +
          (lost ?? 0) >
          recv
      ) {
        list.push({
          id: r.id,
          zone: r.canonicalZone,
          woreda: r.canonicalWoreda,
          day: r.campaignDayNum,
          message: `${label} accounted vials exceed vials received (${recv}).`,
        });
      }
      if (wastage !== null && wastage > settings.maxWastagePct) {
        list.push({
          id: r.id,
          zone: r.canonicalZone,
          woreda: r.canonicalWoreda,
          day: r.campaignDayNum,
          message: `${label} wastage rate (${wastage}%) exceeds threshold (${settings.maxWastagePct}%).`,
        });
      }
    }
    return list;
  }, [reports, activeVaccine, label, settings.maxWastagePct]);

  return (
    <div className="space-y-6">
      {/* Segmented Switch between nOPV2 and bOPV (Separate Monitoring) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Vaccine Utilization &amp; Vial Accountability ({label})
          </h2>
          <p className="text-xs text-slate-500">
            nOPV2 and bOPV are tracked independently; missing stock cells are preserved as Not Reported without fabricated balances.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setActiveVaccine('nopv2')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeVaccine === 'nopv2'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            nOPV2 Vaccine
          </button>
          <button
            type="button"
            onClick={() => setActiveVaccine('bopv')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeVaccine === 'bopv'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            bOPV Vaccine
          </button>
        </div>
      </div>

      {/* 8-Indicator Vial Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {[
          ['Vials Received', fmt(current.received)],
          ['Vials Used', fmt(current.used)],
          ['Vials Partially Used', fmt(current.partiallyUsed)],
          ['Returned Unused (Good)', fmt(current.returnedUnusedGood)],
          ['Vials Broken', fmt(current.broken)],
          ['Returned Bad (Stage 3 & 4)', fmt(current.returnedBad)],
          ['Vials Lost', fmt(current.lost)],
          [
            'Reported Wastage Rate',
            current.avgWastage !== null ? `${current.avgWastage}%` : 'Not Reported',
          ],
        ].map(([lbl, val]) => (
          <div key={lbl} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">{lbl}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-slate-900">
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* Stock Discrepancy & Wastage Warnings */}
      {stockWarnings.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#D29441]" />
            <h3 className="text-sm font-semibold text-slate-900">
              {label} Stock &amp; Wastage Alerts ({stockWarnings.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs">
            {stockWarnings.slice(0, 40).map((w, idx) => (
              <div key={`${w.id}-${idx}`} className="py-2 flex justify-between gap-4">
                <span className="font-medium text-slate-800">
                  {w.zone} · {w.woreda} (Day {w.day})
                </span>
                <span className="text-[#D29441]">{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Detailed Woreda Vial Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            {label} Woreda-Level Vial Ledger ({reports.length} records)
          </h3>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No daily reports imported for current filter.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Zone</th>
                  <th className="text-left font-medium px-3 py-2.5">Woreda</th>
                  <th className="text-left font-medium px-3 py-2.5">Day</th>
                  <th className="text-right font-medium px-3 py-2.5">Recv</th>
                  <th className="text-right font-medium px-3 py-2.5">Used</th>
                  <th className="text-right font-medium px-3 py-2.5">Part.</th>
                  <th className="text-right font-medium px-3 py-2.5">Ret. Good</th>
                  <th className="text-right font-medium px-3 py-2.5">Broken</th>
                  <th className="text-right font-medium px-3 py-2.5">Bad (3&amp;4)</th>
                  <th className="text-right font-medium px-3 py-2.5">Lost</th>
                  <th className="text-right font-medium px-4 py-2.5">Wastage %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.slice(0, 150).map((r) => {
                  const recv =
                    activeVaccine === 'nopv2'
                      ? r.nopv2VialsReceived
                      : r.bopvVialsReceived;
                  const used =
                    activeVaccine === 'nopv2' ? r.nopv2VialsUsed : r.bopvVialsUsed;
                  const part =
                    activeVaccine === 'nopv2'
                      ? r.nopv2VialsPartiallyUsed
                      : r.bopvVialsPartiallyUsed;
                  const good =
                    activeVaccine === 'nopv2'
                      ? r.nopv2VialsReturnedUnusedGood
                      : r.bopvVialsReturnedUnusedGood;
                  const brk =
                    activeVaccine === 'nopv2'
                      ? r.nopv2VialsBroken
                      : r.bopvVialsBroken;
                  const bad =
                    activeVaccine === 'nopv2'
                      ? r.nopv2VialsReturnedBad
                      : r.bopvVialsReturnedBad;
                  const lost =
                    activeVaccine === 'nopv2' ? r.nopv2VialsLost : r.bopvVialsLost;
                  const waste =
                    activeVaccine === 'nopv2'
                      ? r.nopv2WastageRatePct
                      : r.bopvWastageRatePct;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{r.canonicalZone}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {r.canonicalWoreda}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.campaignDayLabel}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{recv ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{used ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{part ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{good ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{brk ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{bad ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{lost ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {waste !== null ? `${waste}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
