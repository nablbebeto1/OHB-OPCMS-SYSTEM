import React, { useMemo, useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { api, type DashboardSummaryResponse, type FilterParams } from '../../api/client';

interface ReportsAnalyticsViewProps {
  summary: DashboardSummaryResponse;
  filter: FilterParams;
}

const REPORT_CARDS = [
  {
    key: 'executive_summary',
    title: 'Executive Campaign Summary',
    desc: 'All 16 central command KPIs with threshold comparison.',
  },
  {
    key: 'daily_campaign',
    title: 'Daily Campaign Performance Report',
    desc: 'Day-by-day target, vaccinated 0–59m, cumulative coverage & teams.',
  },
  {
    key: 'zone_performance',
    title: 'Zone Performance Report',
    desc: 'Zone & town administration completeness, coverage, and alerts.',
  },
  {
    key: 'woreda_performance',
    title: 'Woreda Performance Report',
    desc: 'Granular woreda age cohorts, vaccination history & coverage.',
  },
  {
    key: 'vaccine_utilization',
    title: 'Vaccine Utilization Report',
    desc: 'Separate nOPV2 and bOPV vial receipt, usage, loss & wastage.',
  },
  {
    key: 'afp_aefi_alerts',
    title: 'AFP & AEFI Alert Report',
    desc: 'Administrative tally counts vs. clinical investigation status.',
  },
  {
    key: 'social_mobilization',
    title: 'Social Mobilization Report',
    desc: 'Households visited, community meetings, and home-to-home IPC.',
  },
  {
    key: 'zero_dose_under_vaccinated',
    title: 'Zero-Dose & Under-Vaccinated Report',
    desc: 'Identified/linked vs. vaccinated children and conversion gaps.',
  },
  {
    key: 'reporting_completeness',
    title: 'Reporting Completeness Report',
    desc: 'Submitted vs. missing woredas with upload & source timestamps.',
  },
];

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({
  summary,
  filter,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const warnings = useMemo(() => {
    if (categoryFilter === 'all') return summary.dataQualityWarnings;
    return summary.dataQualityWarnings.filter((w) => w.category === categoryFilter);
  }, [summary.dataQualityWarnings, categoryFilter]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of summary.dataQualityWarnings) {
      counts.set(w.category, (counts.get(w.category) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [summary.dataQualityWarnings]);

  return (
    <div className="space-y-6">
      {/* Report Generation & Export Center */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Campaign Report Generator &amp; Exports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Downloads apply your active Campaign Round, Day, Date, Zone, and Woreda filters and embed generation metadata automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_CARDS.map((rep) => (
            <div
              key={rep.key}
              className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{rep.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{rep.desc}</p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                {(['xlsx', 'csv', 'pdf'] as const).map((fmt) => (
                  <a
                    key={fmt}
                    href={api.exportUrl(rep.key, fmt, filter)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:border-[#3A99CF] hover:text-[#3A99CF] rounded-md transition-colors uppercase"
                  >
                    <Download className="w-3 h-3" />
                    {fmt}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Automatic Data Quality Diagnostics (Strictly Separated from Public Health Alerts) */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D29441]" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Automatic Data Quality &amp; Consistency Diagnostics ({warnings.length})
              </h2>
              <p className="text-xs text-slate-500">
                Source data is never altered automatically. Flags are computed dynamically against configurable thresholds and kept separate from clinical AFP/AEFI alerts.
              </p>
            </div>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">
              All Diagnostic Categories ({summary.dataQualityWarnings.length})
            </option>
            {categories.map(([cat, cnt]) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')} ({cnt})
              </option>
            ))}
          </select>
        </div>

        {warnings.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No data quality anomalies detected under current filters and thresholds.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[440px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Severity</th>
                  <th className="text-left font-medium px-3 py-2.5">Category</th>
                  <th className="text-left font-medium px-3 py-2.5">Zone</th>
                  <th className="text-left font-medium px-3 py-2.5">Woreda</th>
                  <th className="text-left font-medium px-3 py-2.5">Day</th>
                  <th className="text-left font-medium px-3 py-2.5">Observed / Threshold</th>
                  <th className="text-left font-medium px-4 py-2.5">Diagnostic Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warnings.slice(0, 200).map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium uppercase">
                      <span
                        className={
                          w.severity === 'critical'
                            ? 'text-red-700'
                            : w.severity === 'warning'
                              ? 'text-[#D29441]'
                              : 'text-[#3A99CF]'
                        }
                      >
                        {w.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {w.category.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{w.zone}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{w.woreda}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {w.campaignDayNum ? `Day ${w.campaignDayNum}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {w.metricValue} ({w.thresholdValue})
                    </td>
                    <td className="px-4 py-2 text-slate-600">{w.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
