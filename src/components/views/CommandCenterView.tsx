import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend,
} from 'recharts';
import { Upload, AlertTriangle, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import { KpiCard } from '../KpiCard';
import type { DashboardSummaryResponse } from '../../api/client';
import type { ImportBatch, SurveillanceAlert } from '../../types/opcms';

interface CommandCenterViewProps {
  summary: DashboardSummaryResponse;
  alerts: SurveillanceAlert[];
  imports: ImportBatch[];
  canUpload?: boolean;
  onNavigate: (tab: string) => void;
  onSelectZone: (zone: string) => void;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  summary,
  alerts,
  imports,
  canUpload = false,
  onNavigate,
  onSelectZone,
}) => {
  const { kpis, zones, dailyTrends, dataQualityWarnings, settings } = summary;
  const hasAnyImports =
    Boolean(summary.latestImport) || imports.some((b) => b.status === 'confirmed');

  const topZonesChart = [...zones]
    .sort((a, b) => b.plannedTarget - a.plannedTarget)
    .slice(0, 14)
    .map((z) => ({
      zone: z.zone.replace(' Zone', '').replace(' City', ''),
      fullZone: z.zone,
      planned: z.plannedTarget,
      vaccinated: z.vaccinated0_59,
      coverage: z.overallCoveragePct,
    }));

  return (
    <div className="space-y-6">
      {!hasAnyImports ? (
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Baseline Reporting Registry Loaded ({kpis.expectedReportingWoredas} Woredas &amp; Towns)
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Authoritative targets ({fmt(kpis.totalPlannedTarget)} children 0–59m) are initialized from the Oromia Round 1 template.{' '}
              {canUpload
                ? 'Upload a completed Day 1–4 Excel or CSV report in the Data Upload Center to populate live campaign coverage.'
                : 'Awaiting System Administrator campaign report ingestion to populate live coverage metrics.'}
            </p>
          </div>
          {canUpload ? (
            <button
              type="button"
              onClick={() => onNavigate('data_upload')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#3A99CF] hover:bg-[#2f86b8] rounded-lg whitespace-nowrap shrink-0 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Campaign Report
            </button>
          ) : null}
        </div>
      ) : null}

      {/* All 16 Executive KPI Cards */}
      <section aria-label="Executive Campaign KPIs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Executive Command Indicators
          </h2>
          <span className="text-xs text-slate-500">
            Target Threshold: {settings.coverageTargetPct}% · Critical &lt; {settings.coverageCriticalPct}%
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1 */}
          <KpiCard
            label="1. Total Planned Target"
            value={fmt(kpis.totalPlannedTarget)}
            subtext={`Daily target: ${fmt(kpis.totalDailyTarget)}`}
            tone="deep"
          />
          {/* 2 */}
          <KpiCard
            label="2. Total Children Vaccinated (0–59m)"
            value={fmt(kpis.totalChildrenVaccinated0_59)}
            subtext={`60–120m: ${fmt(kpis.totalChildrenVaccinated60_120)}`}
            tone="blue"
          />
          {/* 3 */}
          <KpiCard
            label="3. Overall Vaccination Coverage"
            value={`${kpis.overallVaccinationCoveragePct}%`}
            subtext={`Target: ${settings.coverageTargetPct}%`}
            tone={
              kpis.overallVaccinationCoveragePct >= settings.coverageTargetPct
                ? 'green'
                : kpis.overallVaccinationCoveragePct > 0
                  ? 'orange'
                  : 'neutral'
            }
          />
          {/* 4 */}
          <KpiCard
            label="4. Daily Vaccination Coverage"
            value={`${kpis.dailyVaccinationCoveragePct}%`}
            subtext="Latest filtered campaign day"
            tone={
              kpis.dailyVaccinationCoveragePct >= settings.coverageTargetPct
                ? 'green'
                : kpis.dailyVaccinationCoveragePct > 0
                  ? 'blue'
                  : 'neutral'
            }
          />

          {/* 5 */}
          <KpiCard
            label="5. Reporting Woredas (Expected)"
            value={fmt(kpis.expectedReportingWoredas)}
            subtext={`${zones.length} Zones / City Administrations`}
            onClick={() => onNavigate('reporting_completeness')}
          />
          {/* 6 */}
          <KpiCard
            label="6. Woredas Submitted Reports"
            value={fmt(kpis.submittedWoredas)}
            subtext={`${
              kpis.expectedReportingWoredas > 0
                ? Math.round(
                    (kpis.submittedWoredas / kpis.expectedReportingWoredas) *
                      1000
                  ) / 10
                : 0
            }% reporting completeness`}
            tone="green"
            onClick={() => onNavigate('reporting_completeness')}
          />
          {/* 7 */}
          <KpiCard
            label="7. Woredas Pending Reports"
            value={fmt(kpis.pendingWoredas)}
            subtext="Awaiting daily submission"
            tone={kpis.pendingWoredas > 0 ? 'orange' : 'green'}
            onClick={() => onNavigate('reporting_completeness')}
          />
          {/* 8 */}
          <KpiCard
            label="8. Total Vaccination Teams"
            value={fmt(kpis.totalVaccinationTeams)}
            subtext="Deployed field teams"
          />

          {/* 9 */}
          <KpiCard
            label="9. Reporting Vaccination Teams"
            value={fmt(kpis.reportingVaccinationTeams)}
            subtext={
              kpis.totalVaccinationTeams > 0
                ? `${Math.round((kpis.reportingVaccinationTeams / kpis.totalVaccinationTeams) * 1000) / 10}% of deployed teams`
                : 'No team counts submitted'
            }
            tone="blue"
          />
          {/* 10 */}
          <KpiCard
            label="10. nOPV2 Vaccine Utilization"
            value={`${fmt(kpis.nopv2VialsUsed)} / ${fmt(kpis.nopv2VialsReceived)}`}
            subtext={
              kpis.nopv2WastageRatePct !== null
                ? `Vials used / recv · Wastage ${kpis.nopv2WastageRatePct}%`
                : 'Vials used / received'
            }
            tone="deep"
            onClick={() => onNavigate('vaccine_utilization')}
          />
          {/* 11 */}
          <KpiCard
            label="11. bOPV Vaccine Utilization"
            value={`${fmt(kpis.bopvVialsUsed)} / ${fmt(kpis.bopvVialsReceived)}`}
            subtext={
              kpis.bopvWastageRatePct !== null
                ? `Vials used / recv · Wastage ${kpis.bopvWastageRatePct}%`
                : 'Vials used / received'
            }
            tone="deep"
            onClick={() => onNavigate('vaccine_utilization')}
          />
          {/* 12 */}
          <KpiCard
            label="12. Zero-Dose Identified / Vaccinated"
            value={`${fmt(kpis.zeroDoseIdentified)} / ${fmt(kpis.zeroDoseVaccinated)}`}
            subtext="Routine immunization linkage"
            tone="blue"
            onClick={() => onNavigate('zero_dose')}
          />

          {/* 13 */}
          <KpiCard
            label="13. Under-Vaccinated Identified / Vacc."
            value={`${fmt(kpis.underVaccinatedIdentified)} / ${fmt(kpis.underVaccinatedVaccinated)}`}
            subtext="Catch-up immunization linkage"
            tone="blue"
            onClick={() => onNavigate('zero_dose')}
          />
          {/* 14 */}
          <KpiCard
            label="14. AFP Alerts"
            value={fmt(kpis.afpAlertsTotal)}
            subtext={`Verified cases: ${fmt(kpis.afpVerifiedCasesTotal)}`}
            tone={kpis.afpAlertsTotal > 0 ? 'red' : 'neutral'}
            onClick={() => onNavigate('alerts')}
          />
          {/* 15 */}
          <KpiCard
            label="15. AEFI Alerts"
            value={fmt(kpis.aefiAlertsTotal)}
            subtext={`Verified cases: ${fmt(kpis.aefiVerifiedCasesTotal)}`}
            tone={kpis.aefiAlertsTotal > 0 ? 'orange' : 'neutral'}
            onClick={() => onNavigate('alerts')}
          />
          {/* 16 */}
          <KpiCard
            label="16. Social Mobilization Activities"
            value={fmt(kpis.smTotalActivities)}
            subtext={`HHs ${fmt(kpis.smHhsVisited)} · Mtgs ${fmt(kpis.smGroupDiscussions)} · IPC ${fmt(kpis.smIpcReached)}`}
            tone="green"
            onClick={() => onNavigate('social_mobilization')}
          />
        </div>
      </section>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Zone Target vs. Vaccinated Children (0–59m)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Top 14 zones/towns by planned target · Click bar to filter zone
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('campaign_overview')}
              className="text-xs font-medium text-[#3A99CF] hover:underline"
            >
              View All {zones.length} Zones
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topZonesChart}
                margin={{ top: 8, right: 12, left: 0, bottom: 32 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="zone"
                  tick={{ fontSize: 11, fill: '#475569' }}
                  angle={-28}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(value) => fmt(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar
                  dataKey="planned"
                  name="Planned Target"
                  fill="#CBD5E1"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="vaccinated"
                  name="Vaccinated (0–59m)"
                  fill="#3A99CF"
                  radius={[3, 3, 0, 0]}
                  onClick={(entry) => {
                    const data = entry as unknown as {
                      fullZone?: string;
                      payload?: { fullZone?: string };
                    };
                    const z = data?.payload?.fullZone ?? data?.fullZone;
                    if (z) onSelectZone(String(z));
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Daily Campaign Trajectory
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily target vs. vaccinated &amp; cumulative coverage
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('daily_vaccination')}
              className="text-xs font-medium text-[#3A99CF] hover:underline"
            >
              Daily Analytics
            </button>
          </div>

          {dailyTrends.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-lg bg-slate-50">
              <FileSpreadsheet className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700">
                No Daily Submissions Imported Yet
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Daily trends will populate automatically as soon as Day 1–4 reports are confirmed in the Data Upload Center.
              </p>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={dailyTrends}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="campaignDayLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#485EA9' }}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="dailyTarget"
                    name="Daily Target"
                    fill="#E2E8F0"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="vaccinated0_59"
                    name="Vaccinated (0–59m)"
                    fill="#3A99CF"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulativeCoveragePct"
                    name="Cumulative %"
                    stroke="#485EA9"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Operational Row: Public Health Alerts | Data Quality Warnings | Import History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Surveillance Alerts */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                AFP &amp; AEFI Surveillance Alerts
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-[#3A99CF] hover:underline"
            >
              Alert Center
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No AFP or AEFI alerts reported in current filter scope.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {alerts.slice(0, 5).map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">
                      {a.alertType} · {a.canonicalWoreda} ({a.canonicalZone})
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Day {a.campaignDayNum} · Status: {a.clinicalStatus.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="text-xs font-mono tabular-nums font-semibold text-red-700 shrink-0">
                    {a.administrativeAlertCount} alert{a.administrativeAlertCount > 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Data Quality Warnings (Separated from Public Health Alerts) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D29441]" />
              <h3 className="text-sm font-semibold text-slate-900">
                Automatic Data Quality Flags
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports_analytics')}
              className="text-xs font-medium text-[#3A99CF] hover:underline"
            >
              Inspect ({dataQualityWarnings.length})
            </button>
          </div>
          {dataQualityWarnings.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No data quality anomalies detected for active records.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {dataQualityWarnings.slice(0, 5).map((w) => (
                <div key={w.id} className="py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-900 truncate">
                      {w.woreda} · {w.zone}
                    </span>
                    <span className="font-mono text-[11px] text-[#D29441] shrink-0">
                      {w.metricValue}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                    {w.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Data Imports */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Recent Data Imports
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('data_upload')}
              className="text-xs font-medium text-[#3A99CF] hover:underline"
            >
              Upload Center
            </button>
          </div>
          {imports.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No campaign reporting files imported yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {imports.slice(0, 5).map((b) => (
                <div key={b.id} className="py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-900 truncate max-w-[190px]">
                      {b.originalFilename}
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        b.status === 'rolled_back'
                          ? 'text-slate-400 line-through'
                          : 'text-emerald-700'
                      }`}
                    >
                      +{b.importedRecords} / ~{b.updatedRecords}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {b.uploadedByName} · {new Date(b.uploadedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
