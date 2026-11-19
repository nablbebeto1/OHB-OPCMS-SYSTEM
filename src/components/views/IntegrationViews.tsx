import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Search } from 'lucide-react';
import type { DashboardSummaryResponse } from '../../api/client';
import type { AdminLocation, CampaignDailyReport } from '../../types/opcms';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export const SocialMobilizationView: React.FC<{
  summary: DashboardSummaryResponse;
  reports: CampaignDailyReport[];
}> = ({ summary, reports }) => {
  const { kpis } = summary;
  const zoneChart = useMemo(() => {
    const map = new Map<
      string,
      { zone: string; hhs: number; meetings: number; ipc: number }
    >();
    for (const r of reports) {
      const entry = map.get(r.canonicalZone) ?? {
        zone: r.canonicalZone.replace(' Zone', '').replace(' City', ''),
        hhs: 0,
        meetings: 0,
        ipc: 0,
      };
      entry.hhs += r.smHhsVisited;
      entry.meetings += r.smGroupDiscussions;
      entry.ipc += r.smIpcReached;
      map.set(r.canonicalZone, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => b.hhs + b.meetings + b.ipc - (a.hhs + a.meetings + a.ipc))
      .slice(0, 12);
  }, [reports]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Households Visited</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {fmt(kpis.smHhsVisited)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Group Discussion Participants</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-[#3A99CF]">
            {fmt(kpis.smGroupDiscussions)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Home-to-Home IPC Reached</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-[#485EA9]">
            {fmt(kpis.smIpcReached)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Mobilization Reach</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
            {fmt(kpis.smTotalActivities)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Social Mobilization Reach by Top Zones
        </h2>
        {zoneChart.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No social mobilization figures imported for current filter.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneChart} margin={{ bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="zone"
                  tick={{ fontSize: 11 }}
                  angle={-24}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="hhs" name="HHs Visited" fill="#3A99CF" />
                <Bar dataKey="meetings" name="Community Meetings" fill="#485EA9" />
                <Bar dataKey="ipc" name="Home-to-Home IPC" fill="#D29441" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export const ZeroDoseView: React.FC<{
  summary: DashboardSummaryResponse;
  reports: CampaignDailyReport[];
}> = ({ summary, reports }) => {
  const { kpis } = summary;
  const zdGap = Math.max(0, kpis.zeroDoseIdentified - kpis.zeroDoseVaccinated);
  const uvGap = Math.max(
    0,
    kpis.underVaccinatedIdentified - kpis.underVaccinatedVaccinated
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Zero-Dose Identified &amp; Linked</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {fmt(kpis.zeroDoseIdentified)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Zero-Dose Vaccinated</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
            {fmt(kpis.zeroDoseVaccinated)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Unvaccinated gap: {fmt(zdGap)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Under-Vaccinated Identified</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {fmt(kpis.underVaccinatedIdentified)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Under-Vaccinated Vaccinated</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-[#3A99CF]">
            {fmt(kpis.underVaccinatedVaccinated)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Unvaccinated gap: {fmt(uvGap)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Zone Zero-Dose &amp; Under-Vaccinated Integration Performance
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Zone</th>
                <th className="text-right font-medium px-3 py-2.5">ZD Identified</th>
                <th className="text-right font-medium px-3 py-2.5">ZD Vaccinated</th>
                <th className="text-right font-medium px-3 py-2.5">ZD Gap</th>
                <th className="text-right font-medium px-3 py-2.5">UV Identified</th>
                <th className="text-right font-medium px-3 py-2.5">UV Vaccinated</th>
                <th className="text-right font-medium px-4 py-2.5">UV Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.zones.map((z) => (
                <tr key={z.zone} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{z.zone}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmt(z.zdIdentified)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-emerald-700">
                    {fmt(z.zdVaccinated)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#D29441]">
                    {fmt(Math.max(0, z.zdIdentified - z.zdVaccinated))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmt(z.uvIdentified)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3A99CF]">
                    {fmt(z.uvVaccinated)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#D29441]">
                    {fmt(Math.max(0, z.uvIdentified - z.uvVaccinated))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reports.length === 0 ? (
        <p className="text-xs text-slate-500 text-center">
          No woreda zero-dose records uploaded yet.
        </p>
      ) : null}
    </div>
  );
};

export const ReportingCompletenessView: React.FC<{
  summary: DashboardSummaryResponse;
  locations: AdminLocation[];
  reports: CampaignDailyReport[];
  selectedDay: number | null;
}> = ({ summary, locations, reports, selectedDay }) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'pending'>('all');
  const [search, setSearch] = useState('');

  const effectiveDay =
    selectedDay ??
    (summary.availableDays.length > 0
      ? summary.availableDays[summary.availableDays.length - 1]
      : 1);

  const dayReportsByLoc = useMemo(() => {
    const map = new Map<string, CampaignDailyReport>();
    for (const r of reports.filter((rep) => rep.campaignDayNum === effectiveDay)) {
      map.set(
        `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`,
        r
      );
    }
    return map;
  }, [reports, effectiveDay]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations
      .map((loc) => {
        const rep = dayReportsByLoc.get(
          `${loc.canonicalZone.toLowerCase()}|${loc.canonicalWoreda.toLowerCase()}`
        );
        const submitted = Boolean(
          rep &&
            (rep.hasReportedActivity ||
              rep.teamsReported > 0 ||
              rep.totalVaccinated0_59 > 0)
        );
        return {
          loc,
          rep,
          submitted,
        };
      })
      .filter((item) => {
        if (statusFilter === 'submitted' && !item.submitted) return false;
        if (statusFilter === 'pending' && item.submitted) return false;
        if (
          q &&
          !item.loc.canonicalZone.toLowerCase().includes(q) &&
          !item.loc.canonicalWoreda.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }, [locations, dayReportsByLoc, statusFilter, search]);

  const { kpis } = summary;
  const completenessPct =
    kpis.expectedReportingWoredas > 0
      ? Math.round((kpis.submittedWoredas / kpis.expectedReportingWoredas) * 1000) /
        10
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Expected Reporting Locations</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {fmt(kpis.expectedReportingWoredas)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Reference Day {effectiveDay}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Reports Received</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
            {fmt(kpis.submittedWoredas)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Reports Pending (Missing)</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-[#D29441]">
            {fmt(kpis.pendingWoredas)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Reporting Completeness</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-[#3A99CF]">
            {completenessPct}%
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Location Reporting Accountability · Day {effectiveDay} ({rows.length})
            </h2>
            <p className="text-xs text-slate-500">
              Server upload timestamps and source submission timestamps are recorded separately without inference from day labels.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter zone or woreda..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'pending', 'submitted'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs font-medium rounded capitalize ${
                    statusFilter === s
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">S/N</th>
                <th className="text-left font-medium px-3 py-2.5">Zone</th>
                <th className="text-left font-medium px-3 py-2.5">Woreda</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-right font-medium px-3 py-2.5">Vacc. 0–59m</th>
                <th className="text-left font-medium px-3 py-2.5">Server Upload Time</th>
                <th className="text-left font-medium px-4 py-2.5">Source Submission Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ loc, rep, submitted }) => (
                <tr key={loc.id || `${loc.canonicalZone}-${loc.canonicalWoreda}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2 tabular-nums text-slate-500">
                    {loc.serialNo ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{loc.canonicalZone}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {loc.canonicalWoreda}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        submitted
                          ? 'text-emerald-700 font-medium'
                          : 'text-[#D29441] font-medium'
                      }
                    >
                      {submitted ? 'Received' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {rep ? fmt(rep.totalVaccinated0_59) : '0'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                    {rep ? new Date(rep.uploadedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                    {rep?.sourceSubmittedAt ?? 'Not provided in source'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
