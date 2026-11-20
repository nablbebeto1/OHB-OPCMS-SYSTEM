import React, { useMemo, useState } from 'react';
import { Search, Edit3, X } from 'lucide-react';
import type { DashboardSummaryResponse } from '../../api/client';
import { api } from '../../api/client';
import type { CampaignDailyReport, UserRole } from '../../types/opcms';

interface CampaignOverviewViewProps {
  summary: DashboardSummaryResponse;
  reports: CampaignDailyReport[];
  userRole: UserRole;
  onSelectZone: (zone: string) => void;
  onRefresh: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export const CampaignOverviewView: React.FC<CampaignOverviewViewProps> = ({
  summary,
  reports,
  userRole,
  onSelectZone,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'zone' | 'coverage' | 'target' | 'completeness'>('zone');
  const [editingReport, setEditingReport] = useState<CampaignDailyReport | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCorrect =
    userRole === 'system_admin' ||
    userRole === 'command_center' ||
    userRole === 'central_command' ||
    userRole === 'zone_officer';

  const sortedZones = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = summary.zones.filter((z) =>
      q ? z.zone.toLowerCase().includes(q) : true
    );
    return list.sort((a, b) => {
      if (sortBy === 'coverage') return b.overallCoveragePct - a.overallCoveragePct;
      if (sortBy === 'target') return b.plannedTarget - a.plannedTarget;
      if (sortBy === 'completeness') return b.completenessPct - a.completenessPct;
      return a.zone.localeCompare(b.zone);
    });
  }, [summary.zones, search, sortBy]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) =>
      q
        ? r.canonicalZone.toLowerCase().includes(q) ||
          r.canonicalWoreda.toLowerCase().includes(q)
        : true
    );
  }, [reports, search]);

  const ageTotals = useMemo(() => {
    return reports.reduce(
      (acc, r) => {
        acc.m0_11Before += r.vacc0_11Before;
        acc.m0_11Not += r.vacc0_11NotBefore;
        acc.m12_59Before += r.vacc12_59Before;
        acc.m12_59Not += r.vacc12_59NotBefore;
        acc.m60_120Before += r.vacc60_120Before;
        acc.m60_120Not += r.vacc60_120NotBefore;
        return acc;
      },
      {
        m0_11Before: 0,
        m0_11Not: 0,
        m12_59Before: 0,
        m12_59Not: 0,
        m60_120Before: 0,
        m60_120Not: 0,
      }
    );
  }, [reports]);

  function openEditModal(r: CampaignDailyReport) {
    setEditingReport(r);
    setEditForm({
      vacc0_11Before: r.vacc0_11Before,
      vacc0_11NotBefore: r.vacc0_11NotBefore,
      vacc12_59Before: r.vacc12_59Before,
      vacc12_59NotBefore: r.vacc12_59NotBefore,
      vacc60_120Before: r.vacc60_120Before,
      vacc60_120NotBefore: r.vacc60_120NotBefore,
      totalVaccinated0_59: r.totalVaccinated0_59,
      teamsTotal: r.teamsTotal,
      teamsReported: r.teamsReported,
      remarks: r.remarks,
      correctionReason: '',
    });
    setError(null);
  }

  async function saveCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReport) return;
    setSaving(true);
    setError(null);
    try {
      await api.correctDailyReport(editingReport.id, editForm);
      setEditingReport(null);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Age Group & Vaccination History Matrix */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Age-Cohort &amp; Prior Polio Vaccination Status Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">0–11 Months</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {fmt(ageTotals.m0_11Before + ageTotals.m0_11Not)}
            </div>
            <div className="mt-2 text-xs text-slate-600 flex justify-between tabular-nums">
              <span>Vaccinated before: {fmt(ageTotals.m0_11Before)}</span>
              <span>Not before: {fmt(ageTotals.m0_11Not)}</span>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">12–59 Months</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {fmt(ageTotals.m12_59Before + ageTotals.m12_59Not)}
            </div>
            <div className="mt-2 text-xs text-slate-600 flex justify-between tabular-nums">
              <span>Vaccinated before: {fmt(ageTotals.m12_59Before)}</span>
              <span>Not before: {fmt(ageTotals.m12_59Not)}</span>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">
              60–120 Months (Out-of-target / Extended)
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {fmt(ageTotals.m60_120Before + ageTotals.m60_120Not)}
            </div>
            <div className="mt-2 text-xs text-slate-600 flex justify-between tabular-nums">
              <span>Vaccinated before: {fmt(ageTotals.m60_120Before)}</span>
              <span>Not before: {fmt(ageTotals.m60_120Not)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Zone Performance Table */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Zone &amp; Town Administration Performance ({sortedZones.length})
            </h2>
            <p className="text-xs text-slate-500">
              Click any zone row to filter the entire command center
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search zone or woreda..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#3A99CF]"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="zone">Sort: Name</option>
              <option value="target">Sort: Planned Target</option>
              <option value="coverage">Sort: Coverage %</option>
              <option value="completeness">Sort: Completeness %</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Zone / City</th>
                <th className="text-right font-medium px-3 py-2.5">Woredas</th>
                <th className="text-right font-medium px-3 py-2.5">Submitted</th>
                <th className="text-right font-medium px-3 py-2.5">Completeness</th>
                <th className="text-right font-medium px-3 py-2.5">Planned Target</th>
                <th className="text-right font-medium px-3 py-2.5">Vaccinated 0–59m</th>
                <th className="text-right font-medium px-3 py-2.5">Coverage %</th>
                <th className="text-right font-medium px-3 py-2.5">AFP / AEFI</th>
                <th className="text-right font-medium px-4 py-2.5">Zero-Dose Vacc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedZones.map((z) => (
                <tr
                  key={z.zone}
                  onClick={() => onSelectZone(z.zone)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-900">{z.zone}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                    {z.woredaCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {z.submittedWoredas}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {z.completenessPct}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {fmt(z.plannedTarget)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                    {fmt(z.vaccinated0_59)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    <span
                      className={
                        z.statusCategory === 'on_target'
                          ? 'text-emerald-700'
                          : z.statusCategory === 'below_target'
                            ? 'text-[#D29441]'
                            : z.statusCategory === 'critical_alert'
                              ? 'text-red-700'
                              : 'text-slate-400'
                      }
                    >
                      {z.overallCoveragePct}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {z.afpAlerts} / {z.aefiAlerts}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {fmt(z.zdVaccinated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Imported Woreda Daily Records (with Audited Correction Workflow) */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Active Woreda Campaign Records ({filteredReports.length})
            </h2>
            <p className="text-xs text-slate-500">
              Versioned source records · Corrections create an audited new version without silent overwriting
            </p>
          </div>
        </div>
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No imported daily records match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Zone</th>
                  <th className="text-left font-medium px-3 py-2.5">Woreda</th>
                  <th className="text-left font-medium px-3 py-2.5">Day</th>
                  <th className="text-right font-medium px-3 py-2.5">Daily Target</th>
                  <th className="text-right font-medium px-3 py-2.5">Vacc. 0–59m</th>
                  <th className="text-right font-medium px-3 py-2.5">Daily %</th>
                  <th className="text-right font-medium px-3 py-2.5">Teams</th>
                  <th className="text-right font-medium px-3 py-2.5">Ver.</th>
                  {canCorrect ? (
                    <th className="text-right font-medium px-4 py-2.5">Action</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReports.slice(0, 150).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{r.canonicalZone}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {r.canonicalWoreda}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.campaignDayLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(r.dailyTarget)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {fmt(r.totalVaccinated0_59)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.dailyCoveredPct}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.teamsReported}/{r.teamsTotal}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                      v{r.version}
                    </td>
                    {canCorrect ? (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#3A99CF] hover:text-[#2c7ca8]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Correct
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Correction Modal */}
      {editingReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                Audited Record Correction · {editingReport.canonicalWoreda} (Day{' '}
                {editingReport.campaignDayNum})
              </h3>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={saveCorrection} className="p-5 space-y-3 text-xs">
              {error ? (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded">
                  {error}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['vacc0_11Before', '0–11m Vaccinated Before'],
                  ['vacc0_11NotBefore', '0–11m Not Vacc. Before'],
                  ['vacc12_59Before', '12–59m Vaccinated Before'],
                  ['vacc12_59NotBefore', '12–59m Not Vacc. Before'],
                  ['totalVaccinated0_59', 'Total Vaccinated (0–59m)'],
                  ['teamsReported', 'Teams Reported'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="block font-medium text-slate-700 mb-1">
                      {label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm[key] ?? 0}
                      onChange={(e) =>
                        setEditForm({ ...editForm, [key]: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Correction Reason (Recorded in Audit Log)
                </label>
                <input
                  type="text"
                  required
                  value={String(editForm.correctionReason ?? '')}
                  onChange={(e) =>
                    setEditForm({ ...editForm, correctionReason: e.target.value })
                  }
                  placeholder="e.g. Verified woreda tally sheet resubmission"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReport(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#485EA9] text-white rounded-lg hover:bg-[#3a4d8f]"
                >
                  {saving ? 'Saving New Version...' : 'Save Audited Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
