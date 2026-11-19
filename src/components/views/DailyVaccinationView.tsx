import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import type { DashboardSummaryResponse } from '../../api/client';

interface DailyVaccinationViewProps {
  summary: DashboardSummaryResponse;
  vaccineFilter: 'all' | 'nopv2' | 'bopv';
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export const DailyVaccinationView: React.FC<DailyVaccinationViewProps> = ({
  summary,
  vaccineFilter,
}) => {
  const trends = summary.dailyTrends;
  const [compareDayA, setCompareDayA] = useState<number>(trends[0]?.campaignDayNum ?? 1);
  const [compareDayB, setCompareDayB] = useState<number>(
    trends[trends.length - 1]?.campaignDayNum ?? 2
  );

  const comparison = useMemo(() => {
    const a = trends.find((t) => t.campaignDayNum === compareDayA);
    const b = trends.find((t) => t.campaignDayNum === compareDayB);
    return { a, b };
  }, [trends, compareDayA, compareDayB]);

  if (trends.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
        <h2 className="text-base font-semibold text-slate-900">
          No Daily Campaign Reports Imported Yet
        </h2>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
          Upload daily administrative reports (.xlsx or .csv) in the Data Upload Center to unlock daily coverage, age-cohort, prior-status, team reporting, and day-to-day comparison charts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Day-to-Day Comparison Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Campaign Day-to-Day Performance Comparison
            </h2>
            <p className="text-xs text-slate-500">
              Compare any two campaign days side-by-side without double-counting targets
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={compareDayA}
              onChange={(e) => setCompareDayA(Number(e.target.value))}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            >
              {trends.map((t) => (
                <option key={t.campaignDayNum} value={t.campaignDayNum}>
                  Baseline: {t.campaignDayLabel}
                </option>
              ))}
            </select>
            <span className="text-slate-400">vs.</span>
            <select
              value={compareDayB}
              onChange={(e) => setCompareDayB(Number(e.target.value))}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            >
              {trends.map((t) => (
                <option key={t.campaignDayNum} value={t.campaignDayNum}>
                  Compare: {t.campaignDayLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {comparison.a && comparison.b ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Vaccinated (0–59m)</div>
              <div className="mt-1 font-semibold tabular-nums text-slate-900 text-sm">
                {fmt(comparison.a.vaccinated0_59)} vs {fmt(comparison.b.vaccinated0_59)}
              </div>
              <div className="mt-1 text-slate-500 tabular-nums">
                Delta: {fmt(comparison.b.vaccinated0_59 - comparison.a.vaccinated0_59)}
              </div>
            </div>
            <div className="p-3 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Daily Coverage %</div>
              <div className="mt-1 font-semibold tabular-nums text-slate-900 text-sm">
                {comparison.a.dailyCoveragePct}% vs {comparison.b.dailyCoveragePct}%
              </div>
              <div className="mt-1 text-slate-500 tabular-nums">
                Delta:{' '}
                {(comparison.b.dailyCoveragePct - comparison.a.dailyCoveragePct).toFixed(2)}%
              </div>
            </div>
            <div className="p-3 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Reporting Completeness</div>
              <div className="mt-1 font-semibold tabular-nums text-slate-900 text-sm">
                {comparison.a.completenessPct}% vs {comparison.b.completenessPct}%
              </div>
              <div className="mt-1 text-slate-500 tabular-nums">
                {comparison.a.submittedWoredas} vs {comparison.b.submittedWoredas} woredas
              </div>
            </div>
            <div className="p-3 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Teams Reporting</div>
              <div className="mt-1 font-semibold tabular-nums text-slate-900 text-sm">
                {fmt(comparison.a.teamsReported)} vs {fmt(comparison.b.teamsReported)}
              </div>
              <div className="mt-1 text-slate-500 tabular-nums">
                Deployed: {fmt(comparison.b.teamsTotal)}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Planned vs Vaccinated & Daily/Cumulative Coverage */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Planned vs. Vaccinated &amp; Coverage Trend (%)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="dailyTarget" name="Daily Target" fill="#CBD5E1" />
                <Bar
                  yAxisId="left"
                  dataKey="vaccinated0_59"
                  name="Vaccinated (0–59m)"
                  fill="#3A99CF"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="dailyCoveragePct"
                  name="Daily Coverage %"
                  stroke="#D29441"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativeCoveragePct"
                  name="Cumulative Coverage %"
                  stroke="#485EA9"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Age-Group Vaccination Distribution */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Age-Group Vaccination Distribution (0–11m, 12–59m, 60–120m)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="vacc0_11" name="0–11 Months" stackId="age" fill="#3A99CF" />
                <Bar dataKey="vacc12_59" name="12–59 Months" stackId="age" fill="#485EA9" />
                <Bar dataKey="vacc60_120" name="60–120 Months" stackId="age" fill="#D29441" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Vaccinated Before vs Not Vaccinated Before */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Prior Status: Vaccinated Before vs. Not Vaccinated Before
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="vaccinatedBefore"
                  name="Vaccinated Before"
                  fill="#485EA9"
                />
                <Bar
                  dataKey="notVaccinatedBefore"
                  name="Not Vaccinated Before (First Dose)"
                  fill="#D29441"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. nOPV2 vs bOPV Utilization & Wastage Trends */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            nOPV2 vs. bOPV Vials Used &amp; Wastage Rate (%)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {vaccineFilter !== 'bopv' ? (
                  <Bar
                    yAxisId="left"
                    dataKey="nopv2Used"
                    name="nOPV2 Vials Used"
                    fill="#3A99CF"
                  />
                ) : null}
                {vaccineFilter !== 'nopv2' ? (
                  <Bar
                    yAxisId="left"
                    dataKey="bopvUsed"
                    name="bOPV Vials Used"
                    fill="#485EA9"
                  />
                ) : null}
                {vaccineFilter !== 'bopv' ? (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="nopv2WastagePct"
                    name="nOPV2 Wastage %"
                    stroke="#D29441"
                    strokeWidth={2}
                  />
                ) : null}
                {vaccineFilter !== 'nopv2' ? (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="bopvWastagePct"
                    name="bOPV Wastage %"
                    stroke="#DC2626"
                    strokeWidth={2}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 5. Vaccination Teams vs Reporting Teams */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Vaccination Teams Deployed vs. Reporting Teams
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="teamsTotal" name="Total Teams" fill="#CBD5E1" />
                <Bar dataKey="teamsReported" name="Reporting Teams" fill="#16A34A" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 6. Daily Reporting Completeness */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Daily Reporting Completeness (%)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="campaignDayLabel" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="completenessPct"
                  name="Completeness %"
                  stroke="#3A99CF"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
