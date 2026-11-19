import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  computeDashboardSummary,
  getActiveAlerts,
  getFilteredLocations,
  getFilteredReports,
  type AnalyticsFilter,
} from './analytics.ts';
import { db } from './db.ts';

export type ReportType =
  | 'daily_campaign'
  | 'zone_performance'
  | 'woreda_performance'
  | 'vaccine_utilization'
  | 'afp_aefi_alerts'
  | 'social_mobilization'
  | 'zero_dose_under_vaccinated'
  | 'reporting_completeness'
  | 'executive_summary';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

export const REPORT_TITLES: Record<ReportType, string> = {
  daily_campaign: 'Daily Campaign Performance Report',
  zone_performance: 'Zone Performance Report',
  woreda_performance: 'Woreda Performance Report',
  vaccine_utilization: 'Vaccine Utilization Report (nOPV2 & bOPV)',
  afp_aefi_alerts: 'AFP and AEFI Alert Surveillance Report',
  social_mobilization: 'Social Mobilization Activity Report',
  zero_dose_under_vaccinated: 'Zero-Dose and Under-Vaccinated Integration Report',
  reporting_completeness: 'Reporting Completeness & Accountability Report',
  executive_summary: 'Executive Campaign Summary Report',
};

function buildReportDataset(
  reportType: ReportType,
  filter: AnalyticsFilter
): {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
} {
  const summary = computeDashboardSummary(filter);
  const reports = getFilteredReports(filter);
  const alerts = getActiveAlerts(filter);
  const locations = getFilteredLocations(filter);
  const title = REPORT_TITLES[reportType];

  switch (reportType) {
    case 'daily_campaign':
      return {
        title,
        headers: [
          'Day',
          'Report Date',
          'Daily Target',
          'Vaccinated (0-59m)',
          'Daily Coverage (%)',
          'Cumulative (0-59m)',
          'Cumulative Coverage (%)',
          '0-11m',
          '12-59m',
          '60-120m',
          'Teams Reported / Total',
          'Woredas Submitted / Expected',
        ],
        rows: summary.dailyTrends.map((d) => [
          d.campaignDayLabel,
          d.reportDate ?? 'Not specified',
          d.dailyTarget,
          d.vaccinated0_59,
          `${d.dailyCoveragePct}%`,
          d.cumulativeVaccinated0_59,
          `${d.cumulativeCoveragePct}%`,
          d.vacc0_11,
          d.vacc12_59,
          d.vacc60_120,
          `${d.teamsReported} / ${d.teamsTotal}`,
          `${d.submittedWoredas} / ${d.expectedWoredas}`,
        ]),
      };

    case 'zone_performance':
      return {
        title,
        headers: [
          'Zone / Town / City',
          'Expected Woredas',
          'Submitted',
          'Pending',
          'Completeness (%)',
          'Planned Target',
          'Vaccinated (0-59m)',
          'Overall Coverage (%)',
          'Vaccinated (60-120m)',
          'AFP Alerts',
          'AEFI Alerts',
          'Zero Dose Vaccinated',
        ],
        rows: summary.zones.map((z) => [
          z.zone,
          z.woredaCount,
          z.submittedWoredas,
          z.pendingWoredas,
          `${z.completenessPct}%`,
          z.plannedTarget,
          z.vaccinated0_59,
          `${z.overallCoveragePct}%`,
          z.vaccinated60_120,
          z.afpAlerts,
          z.aefiAlerts,
          z.zdVaccinated,
        ]),
      };

    case 'woreda_performance':
      return {
        title,
        headers: [
          'Zone',
          'Woreda',
          'Day',
          'Planned Target',
          'Daily Target',
          '0-11m Vacc Before',
          '0-11m Not Vacc',
          '12-59m Vacc Before',
          '12-59m Not Vacc',
          'Total 0-59m',
          'Daily Coverage (%)',
          'Total Coverage (%)',
          'Teams Reported / Total',
        ],
        rows: reports.map((r) => [
          r.canonicalZone,
          r.canonicalWoreda,
          r.campaignDayLabel,
          r.totalPlannedTarget,
          r.dailyTarget,
          r.vacc0_11Before,
          r.vacc0_11NotBefore,
          r.vacc12_59Before,
          r.vacc12_59NotBefore,
          r.totalVaccinated0_59,
          `${r.dailyCoveredPct}%`,
          `${r.coveredFromTotalPct}%`,
          `${r.teamsReported} / ${r.teamsTotal}`,
        ]),
      };

    case 'vaccine_utilization':
      return {
        title,
        headers: [
          'Zone',
          'Woreda',
          'Day',
          'nOPV2 Recv',
          'nOPV2 Used',
          'nOPV2 Part.',
          'nOPV2 Ret. Good',
          'nOPV2 Broken/Bad/Lost',
          'nOPV2 Wastage (%)',
          'bOPV Recv',
          'bOPV Used',
          'bOPV Part.',
          'bOPV Ret. Good',
          'bOPV Broken/Bad/Lost',
          'bOPV Wastage (%)',
        ],
        rows: reports.map((r) => [
          r.canonicalZone,
          r.canonicalWoreda,
          r.campaignDayLabel,
          r.nopv2VialsReceived ?? 'N/A',
          r.nopv2VialsUsed ?? 'N/A',
          r.nopv2VialsPartiallyUsed ?? 'N/A',
          r.nopv2VialsReturnedUnusedGood ?? 'N/A',
          (r.nopv2VialsBroken ?? 0) +
            (r.nopv2VialsReturnedBad ?? 0) +
            (r.nopv2VialsLost ?? 0),
          r.nopv2WastageRatePct !== null ? `${r.nopv2WastageRatePct}%` : 'N/A',
          r.bopvVialsReceived ?? 'N/A',
          r.bopvVialsUsed ?? 'N/A',
          r.bopvVialsPartiallyUsed ?? 'N/A',
          r.bopvVialsReturnedUnusedGood ?? 'N/A',
          (r.bopvVialsBroken ?? 0) +
            (r.bopvVialsReturnedBad ?? 0) +
            (r.bopvVialsLost ?? 0),
          r.bopvWastageRatePct !== null ? `${r.bopvWastageRatePct}%` : 'N/A',
        ]),
      };

    case 'afp_aefi_alerts':
      return {
        title,
        headers: [
          'Alert ID',
          'Type',
          'Zone',
          'Woreda',
          'Campaign Day',
          'Admin Alert Count',
          'Verified Clinical Cases',
          'Clinical Follow-up Status',
          'Investigator',
          'Remarks',
          'Updated At',
        ],
        rows: alerts.map((a) => [
          a.id,
          a.alertType,
          a.canonicalZone,
          a.canonicalWoreda,
          `Day ${a.campaignDayNum}`,
          a.administrativeAlertCount,
          a.verifiedClinicalCases,
          a.clinicalStatus,
          a.assignedInvestigator || 'Unassigned',
          a.sourceRemarks || a.followUpNotes || '-',
          a.updatedAt,
        ]),
      };

    case 'social_mobilization':
      return {
        title,
        headers: [
          'Zone',
          'Woreda',
          'Day',
          'Households Visited',
          'Community Meeting Participants',
          'Home-to-Home IPC Reached',
          'Total Reached',
        ],
        rows: reports.map((r) => [
          r.canonicalZone,
          r.canonicalWoreda,
          r.campaignDayLabel,
          r.smHhsVisited,
          r.smGroupDiscussions,
          r.smIpcReached,
          r.smHhsVisited + r.smGroupDiscussions + r.smIpcReached,
        ]),
      };

    case 'zero_dose_under_vaccinated':
      return {
        title,
        headers: [
          'Zone',
          'Woreda',
          'Day',
          'Zero-Dose Identified & Linked',
          'Zero-Dose Vaccinated',
          'ZD Gap',
          'Under-Vaccinated Identified & Linked',
          'Under-Vaccinated Vaccinated',
          'UV Gap',
        ],
        rows: reports.map((r) => [
          r.canonicalZone,
          r.canonicalWoreda,
          r.campaignDayLabel,
          r.zdIdentifiedLinked,
          r.zdVaccinated,
          Math.max(0, r.zdIdentifiedLinked - r.zdVaccinated),
          r.uvIdentifiedLinked,
          r.uvVaccinated,
          Math.max(0, r.uvIdentifiedLinked - r.uvVaccinated),
        ]),
      };

    case 'reporting_completeness': {
      const latestDay =
        filter.dayNum ??
        (summary.availableDays.length > 0
          ? summary.availableDays[summary.availableDays.length - 1]
          : 1);
      const dayReportsMap = new Map<string, (typeof reports)[number]>();
      for (const r of reports.filter((rep) => rep.campaignDayNum === latestDay)) {
        dayReportsMap.set(
          `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`,
          r
        );
      }
      return {
        title,
        headers: [
          'Zone',
          'Woreda',
          'Type',
          'Campaign Day',
          'Status',
          'Upload Timestamp',
          'Source Submission Timestamp',
          'Vaccinated (0-59m)',
        ],
        rows: locations.map((loc) => {
          const rep = dayReportsMap.get(
            `${loc.canonicalZone.toLowerCase()}|${loc.canonicalWoreda.toLowerCase()}`
          );
          const submitted = Boolean(
            rep &&
              (rep.hasReportedActivity ||
                rep.teamsReported > 0 ||
                rep.totalVaccinated0_59 > 0)
          );
          return [
            loc.canonicalZone,
            loc.canonicalWoreda,
            loc.locationType,
            `Day ${latestDay}`,
            submitted ? 'Submitted' : 'Pending',
            rep?.uploadedAt ?? '-',
            rep?.sourceSubmittedAt ?? 'Not provided in source',
            rep?.totalVaccinated0_59 ?? 0,
          ];
        }),
      };
    }

    case 'executive_summary':
    default: {
      const k = summary.kpis;
      return {
        title,
        headers: ['Indicator', 'Value', 'Notes'],
        rows: [
          ['Total Planned Target (0-59m)', k.totalPlannedTarget, 'Baseline target across reporting units'],
          ['Total Children Vaccinated (0-59m)', k.totalChildrenVaccinated0_59, 'Cumulative across filtered days'],
          ['Overall Vaccination Coverage (%)', `${k.overallVaccinationCoveragePct}%`, `Target: ${summary.settings.coverageTargetPct}%`],
          ['Daily Vaccination Coverage (%)', `${k.dailyVaccinationCoveragePct}%`, 'Latest filtered campaign day'],
          ['Expected Reporting Woredas', k.expectedReportingWoredas, 'Authoritative baseline locations'],
          ['Submitted Woredas', k.submittedWoredas, 'With reported activity'],
          ['Pending Woredas', k.pendingWoredas, 'Awaiting daily submission'],
          ['Total Vaccination Teams', k.totalVaccinationTeams, 'Latest campaign day'],
          ['Reporting Vaccination Teams', k.reportingVaccinationTeams, 'Latest campaign day'],
          ['nOPV2 Vials Received / Used', `${k.nopv2VialsReceived} / ${k.nopv2VialsUsed}`, k.nopv2WastageRatePct !== null ? `Wastage: ${k.nopv2WastageRatePct}%` : 'No wastage data'],
          ['bOPV Vials Received / Used', `${k.bopvVialsReceived} / ${k.bopvVialsUsed}`, k.bopvWastageRatePct !== null ? `Wastage: ${k.bopvWastageRatePct}%` : 'No wastage data'],
          ['Zero-Dose Identified / Vaccinated', `${k.zeroDoseIdentified} / ${k.zeroDoseVaccinated}`, 'Routine immunization linkage'],
          ['Under-Vaccinated Identified / Vaccinated', `${k.underVaccinatedIdentified} / ${k.underVaccinatedVaccinated}`, 'Catch-up integration'],
          ['AFP Alerts (Admin / Verified)', `${k.afpAlertsTotal} / ${k.afpVerifiedCasesTotal}`, 'Administrative vs verified clinical cases'],
          ['AEFI Alerts (Admin / Verified)', `${k.aefiAlertsTotal} / ${k.aefiVerifiedCasesTotal}`, 'Administrative vs verified clinical cases'],
          ['Social Mobilization Total Reach', k.smTotalActivities, `HHs: ${k.smHhsVisited}, Meetings: ${k.smGroupDiscussions}, IPC: ${k.smIpcReached}`],
        ],
      };
    }
  }
}

export function generateExportBuffer(params: {
  reportType: ReportType;
  format: ExportFormat;
  filter: AnalyticsFilter;
}): { buffer: Buffer; mimeType: string; filename: string } {
  const { reportType, format, filter } = params;
  const campaign = filter.campaignId
    ? (db
        .prepare('SELECT name, round_code FROM campaigns WHERE id = ?')
        .get(filter.campaignId) as { name: string; round_code: string } | undefined)
    : undefined;

  const dataset = buildReportDataset(reportType, filter);
  const generatedAt = new Date().toISOString();
  const filterDesc = [
    `Campaign: ${campaign?.name ?? 'All Active Campaigns'}`,
    `Day: ${filter.dayNum ? `Day ${filter.dayNum}` : 'All Days'}`,
    `Report Date: ${filter.reportDate ?? 'All Dates'}`,
    `Zone: ${filter.zone ?? 'All Zones'}`,
    `Woreda: ${filter.woreda ?? 'All Woredas'}`,
    `Generated: ${generatedAt}`,
  ].join(' | ');

  const stamp = generatedAt.slice(0, 10);
  const baseFilename = `OHB_OPCMS_${reportType}_${stamp}`;

  if (format === 'csv') {
    const metaLines = [
      `"${dataset.title}"`,
      `"${filterDesc}"`,
      '',
    ];
    const ws = XLSX.utils.aoa_to_sheet([dataset.headers, ...dataset.rows]);
    const csvBody = XLSX.utils.sheet_to_csv(ws);
    return {
      buffer: Buffer.from(metaLines.join('\n') + csvBody, 'utf8'),
      mimeType: 'text/csv; charset=utf-8',
      filename: `${baseFilename}.csv`,
    };
  }

  if (format === 'xlsx') {
    const aoa: Array<Array<string | number>> = [
      ['Oromia Health Bureau – Polio Campaign Management System (OHB-OPCMS)'],
      [dataset.title],
      [filterDesc],
      [],
      dataset.headers,
      ...dataset.rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      buffer: out,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${baseFilename}.xlsx`,
    };
  }

  // PDF generation via jsPDF + jspdf-autotable
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFillColor(58, 153, 207); // #3A99CF
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 54, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('OROMIA HEALTH BUREAU – POLIO CAMPAIGN MANAGEMENT SYSTEM', 36, 24);
  doc.setFontSize(10);
  doc.text(dataset.title, 36, 42);

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8.5);
  doc.text(filterDesc, 36, 72, {
    maxWidth: doc.internal.pageSize.getWidth() - 72,
  });

  autoTable(doc, {
    startY: 88,
    head: [dataset.headers],
    body: dataset.rows.map((r) => r.map((c) => String(c))),
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [72, 94, 169], textColor: 255 }, // #485EA9
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 36, right: 36 },
  });

  const arrayBuf = doc.output('arraybuffer');
  return {
    buffer: Buffer.from(arrayBuf),
    mimeType: 'application/pdf',
    filename: `${baseFilename}.pdf`,
  };
}
