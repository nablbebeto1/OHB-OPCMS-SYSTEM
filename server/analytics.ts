import { db } from './db.ts';
import type {
  AdminLocation,
  AdvancedAnalyticsData,
  AlertSeverity,
  Campaign,
  CampaignDailyReport,
  CommandRoomAlertSummary,
  CommandRoomStateResponse,
  CommandRoomZoneVaccine,
  DailyTrendPoint,
  DashboardKPIs,
  DataQualityWarning,
  LatestImportMeta,
  SurveillanceAlert,
  SystemSettings,
  WoredaPerformanceMetric,
  ZoneAnalyticsDetail,
  ZoneSummary,
} from '../src/types/opcms.ts';

export interface AnalyticsFilter {
  campaignId?: number;
  dayNum?: number | null;
  reportDate?: string | null;
  zone?: string | null;
  woreda?: string | null;
  vaccineType?: 'all' | 'nopv2' | 'bopv';
}

let analyticsCacheVersion = 1;
const commandRoomCache = new Map<
  string,
  { version: number; payload: CommandRoomStateResponse }
>();

export function invalidateAnalyticsCache(): void {
  analyticsCacheVersion += 1;
  commandRoomCache.clear();
}

export function getAnalyticsCacheVersion(): number {
  return analyticsCacheVersion;
}

export function getSystemSettings(): SystemSettings {
  const rows = db
    .prepare('SELECT key, value FROM system_settings')
    .all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const overrideRaw = map.get('expectedWoredasOverride') ?? '';
  const enabledRaw = map.get('commandRoomEnabledScreens') ?? '1,2,3,4,5';
  const enabledScreens = enabledRaw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);

  const intervalSec = Math.min(
    120,
    Math.max(5, Number(map.get('commandRoomIntervalSec') ?? 15) || 15)
  );
  const refreshSec = Math.min(
    300,
    Math.max(10, Number(map.get('commandRoomDataRefreshSec') ?? 30) || 30)
  );
  const defaultScreenRaw = Number(map.get('commandRoomDefaultScreen') ?? 1);
  const defaultScreen =
    enabledScreens.includes(defaultScreenRaw)
      ? defaultScreenRaw
      : enabledScreens[0] ?? 1;

  return {
    coverageTargetPct: Number(map.get('coverageTargetPct') ?? 95),
    coverageCriticalPct: Number(map.get('coverageCriticalPct') ?? 80),
    maxWastagePct: Number(map.get('maxWastagePct') ?? 15),
    overTargetAlertPct: Number(map.get('overTargetAlertPct') ?? 105),
    dailyDeviationPct: Number(map.get('dailyDeviationPct') ?? 35),
    expectedWoredasOverride: overrideRaw ? Number(overrideRaw) : null,
    googleDriveSyncStatus: 'manual_upload_active',
    guestPublicOverviewEnabled: map.get('guestPublicOverviewEnabled') === 'true',
    commandRoomAutoRotate: (map.get('commandRoomAutoRotate') ?? 'true') !== 'false',
    commandRoomIntervalSec: intervalSec,
    commandRoomEnabledScreens:
      enabledScreens.length > 0 ? enabledScreens : [1, 2, 3, 4, 5],
    commandRoomDefaultScreen: defaultScreen,
    commandRoomFullscreenStartup:
      (map.get('commandRoomFullscreenStartup') ?? 'false') === 'true',
    commandRoomDataRefreshSec: refreshSec,
    commandRoomDisplayTitle:
      map.get('commandRoomDisplayTitle') ||
      'Oromia Health Bureau – Polio Campaign Command Room',
  };
}

export function mapReportRow(row: Record<string, unknown>): CampaignDailyReport {
  return {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    importBatchId: Number(row.import_batch_id),
    serialNo: row.serial_no !== null ? Number(row.serial_no) : null,
    rawRegion: String(row.raw_region),
    rawZone: String(row.raw_zone),
    rawWoreda: String(row.raw_woreda),
    canonicalZone: String(row.canonical_zone),
    canonicalWoreda: String(row.canonical_woreda),
    campaignDayLabel: String(row.campaign_day_label),
    campaignDayNum: Number(row.campaign_day_num),
    reportDate: row.report_date ? String(row.report_date) : null,
    totalPlannedTarget: Number(row.total_planned_target),
    dailyTarget: Number(row.daily_target),
    vacc0_11Before: Number(row.vacc_0_11_before),
    vacc0_11NotBefore: Number(row.vacc_0_11_not_before),
    vacc12_59Before: Number(row.vacc_12_59_before),
    vacc12_59NotBefore: Number(row.vacc_12_59_not_before),
    vacc60_120Before: Number(row.vacc_60_120_before),
    vacc60_120NotBefore: Number(row.vacc_60_120_not_before),
    totalVaccinated0_59: Number(row.total_vaccinated_0_59),
    dailyCoveredPct: Number(row.daily_covered_pct),
    coveredFromTotalPct: Number(row.covered_from_total_pct),
    nopv2VialsReceived:
      row.nopv2_vials_received !== null ? Number(row.nopv2_vials_received) : null,
    nopv2VialsUsed:
      row.nopv2_vials_used !== null ? Number(row.nopv2_vials_used) : null,
    nopv2VialsPartiallyUsed:
      row.nopv2_vials_partially_used !== null
        ? Number(row.nopv2_vials_partially_used)
        : null,
    nopv2VialsReturnedUnusedGood:
      row.nopv2_vials_returned_unused_good !== null
        ? Number(row.nopv2_vials_returned_unused_good)
        : null,
    nopv2VialsBroken:
      row.nopv2_vials_broken !== null ? Number(row.nopv2_vials_broken) : null,
    nopv2VialsReturnedBad:
      row.nopv2_vials_returned_bad !== null
        ? Number(row.nopv2_vials_returned_bad)
        : null,
    nopv2VialsLost:
      row.nopv2_vials_lost !== null ? Number(row.nopv2_vials_lost) : null,
    nopv2WastageRatePct:
      row.nopv2_wastage_rate_pct !== null
        ? Number(row.nopv2_wastage_rate_pct)
        : null,
    bopvVialsReceived:
      row.bopv_vials_received !== null ? Number(row.bopv_vials_received) : null,
    bopvVialsUsed:
      row.bopv_vials_used !== null ? Number(row.bopv_vials_used) : null,
    bopvVialsPartiallyUsed:
      row.bopv_vials_partially_used !== null
        ? Number(row.bopv_vials_partially_used)
        : null,
    bopvVialsReturnedUnusedGood:
      row.bopv_vials_returned_unused_good !== null
        ? Number(row.bopv_vials_returned_unused_good)
        : null,
    bopvVialsBroken:
      row.bopv_vials_broken !== null ? Number(row.bopv_vials_broken) : null,
    bopvVialsReturnedBad:
      row.bopv_vials_returned_bad !== null
        ? Number(row.bopv_vials_returned_bad)
        : null,
    bopvVialsLost:
      row.bopv_vials_lost !== null ? Number(row.bopv_vials_lost) : null,
    bopvWastageRatePct:
      row.bopv_wastage_rate_pct !== null
        ? Number(row.bopv_wastage_rate_pct)
        : null,
    afpAlertsCount: Number(row.afp_alerts_count),
    aefiAlertsCount: Number(row.aefi_alerts_count),
    smHhsVisited: Number(row.sm_hhs_visited),
    smGroupDiscussions: Number(row.sm_group_discussions),
    smIpcReached: Number(row.sm_ipc_reached),
    zdIdentifiedLinked: Number(row.zd_identified_linked),
    zdVaccinated: Number(row.zd_vaccinated),
    uvIdentifiedLinked: Number(row.uv_identified_linked),
    uvVaccinated: Number(row.uv_vaccinated),
    teamsTotal: Number(row.teams_total),
    teamsReported: Number(row.teams_reported),
    remarks: String(row.remarks ?? ''),
    hasReportedActivity: Number(row.has_reported_activity) === 1,
    sourceSubmittedAt: row.source_submitted_at
      ? String(row.source_submitted_at)
      : null,
    uploadedAt: String(row.uploaded_at),
    version: Number(row.version),
    isActive: Number(row.is_active) === 1,
  };
}

export function getFilteredLocations(filter: AnalyticsFilter): AdminLocation[] {
  const clauses: string[] = ['is_active = 1'];
  const params: Array<string | number> = [];
  if (filter.zone) {
    clauses.push('lower(canonical_zone) = lower(?)');
    params.push(filter.zone);
  }
  if (filter.woreda) {
    clauses.push('lower(canonical_woreda) = lower(?)');
    params.push(filter.woreda);
  }
  const rows = db
    .prepare(
      `SELECT * FROM admin_locations WHERE ${clauses.join(' AND ')} ORDER BY serial_no ASC, canonical_zone ASC, canonical_woreda ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    serialNo: r.serial_no !== null ? Number(r.serial_no) : null,
    rawRegion: String(r.raw_region),
    rawZone: String(r.raw_zone),
    rawWoreda: String(r.raw_woreda),
    canonicalRegion: String(r.canonical_region),
    canonicalZone: String(r.canonical_zone),
    canonicalWoreda: String(r.canonical_woreda),
    locationType: r.location_type as AdminLocation['locationType'],
    plannedTarget: Number(r.planned_target),
    dailyTarget: Number(r.daily_target),
    isActive: Number(r.is_active) === 1,
  }));
}

export function getFilteredReports(
  filter: AnalyticsFilter
): CampaignDailyReport[] {
  const clauses: string[] = ['is_active = 1'];
  const params: Array<string | number> = [];
  if (filter.campaignId) {
    clauses.push('campaign_id = ?');
    params.push(filter.campaignId);
  }
  if (filter.dayNum) {
    clauses.push('campaign_day_num = ?');
    params.push(filter.dayNum);
  }
  if (filter.reportDate) {
    clauses.push('report_date = ?');
    params.push(filter.reportDate);
  }
  if (filter.zone) {
    clauses.push('lower(canonical_zone) = lower(?)');
    params.push(filter.zone);
  }
  if (filter.woreda) {
    clauses.push('lower(canonical_woreda) = lower(?)');
    params.push(filter.woreda);
  }

  const rows = db
    .prepare(
      `SELECT * FROM campaign_daily_reports
       WHERE ${clauses.join(' AND ')}
       ORDER BY campaign_day_num ASC, serial_no ASC, canonical_zone ASC, canonical_woreda ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapReportRow);
}

export function getActiveAlerts(filter: AnalyticsFilter): SurveillanceAlert[] {
  const clauses: string[] = ['is_active = 1'];
  const params: Array<string | number> = [];
  if (filter.campaignId) {
    clauses.push('campaign_id = ?');
    params.push(filter.campaignId);
  }
  if (filter.dayNum) {
    clauses.push('campaign_day_num = ?');
    params.push(filter.dayNum);
  }
  if (filter.zone) {
    clauses.push('lower(canonical_zone) = lower(?)');
    params.push(filter.zone);
  }
  if (filter.woreda) {
    clauses.push('lower(canonical_woreda) = lower(?)');
    params.push(filter.woreda);
  }

  const rows = db
    .prepare(
      `SELECT * FROM surveillance_alerts WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC, id DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    campaignId: Number(r.campaign_id),
    reportId: Number(r.report_id),
    alertType: r.alert_type as 'AFP' | 'AEFI',
    canonicalZone: String(r.canonical_zone),
    canonicalWoreda: String(r.canonical_woreda),
    campaignDayNum: Number(r.campaign_day_num),
    reportDate: r.report_date ? String(r.report_date) : null,
    administrativeAlertCount: Number(r.administrative_alert_count),
    verifiedClinicalCases: Number(r.verified_clinical_cases),
    clinicalStatus: r.clinical_status as SurveillanceAlert['clinicalStatus'],
    sourceRemarks: String(r.source_remarks ?? ''),
    followUpNotes: String(r.follow_up_notes ?? ''),
    assignedInvestigator: String(r.assigned_investigator ?? ''),
    updatedByName: r.updated_by_name ? String(r.updated_by_name) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getLatestConfirmedImport(campaignId?: number): LatestImportMeta | null {
  const row = campaignId
    ? (db
        .prepare(
          `SELECT id, original_filename, uploaded_by_name, confirmed_at, uploaded_at, imported_records, updated_records, import_mode
           FROM import_batches
           WHERE campaign_id = ? AND status = 'confirmed'
           ORDER BY id DESC LIMIT 1`
        )
        .get(campaignId) as Record<string, unknown> | undefined)
    : (db
        .prepare(
          `SELECT id, original_filename, uploaded_by_name, confirmed_at, uploaded_at, imported_records, updated_records, import_mode
           FROM import_batches
           WHERE status = 'confirmed'
           ORDER BY id DESC LIMIT 1`
        )
        .get() as Record<string, unknown> | undefined);

  if (!row) return null;
  return {
    id: Number(row.id),
    originalFilename: String(row.original_filename),
    uploadedByName: String(row.uploaded_by_name),
    confirmedAt: String(row.confirmed_at ?? row.uploaded_at),
    importedRecords: Number(row.imported_records),
    updatedRecords: Number(row.updated_records),
    importMode: String(row.import_mode),
  };
}

export function computeDashboardSummary(filter: AnalyticsFilter): {
  kpis: DashboardKPIs;
  zones: ZoneSummary[];
  dailyTrends: DailyTrendPoint[];
  dataQualityWarnings: DataQualityWarning[];
  settings: SystemSettings;
  availableDays: number[];
  availableDates: string[];
  latestImport: LatestImportMeta | null;
  serverTimestamp: string;
} {
  const settings = getSystemSettings();
  const locations = getFilteredLocations(filter);
  const reports = getFilteredReports(filter);
  const alerts = getActiveAlerts(filter);

  // Build baseline target map per (zone, woreda) — never double count across days!
  const locMap = new Map<string, AdminLocation>();
  for (const loc of locations) {
    locMap.set(
      `${loc.canonicalZone.toLowerCase()}|${loc.canonicalWoreda.toLowerCase()}`,
      loc
    );
  }

  // Also include any dynamically imported woreda not yet in locMap
  for (const rep of reports) {
    const key = `${rep.canonicalZone.toLowerCase()}|${rep.canonicalWoreda.toLowerCase()}`;
    if (!locMap.has(key)) {
      locMap.set(key, {
        id: 0,
        serialNo: rep.serialNo,
        rawRegion: rep.rawRegion,
        rawZone: rep.rawZone,
        rawWoreda: rep.rawWoreda,
        canonicalRegion: 'Oromia',
        canonicalZone: rep.canonicalZone,
        canonicalWoreda: rep.canonicalWoreda,
        locationType: 'Zone Woreda',
        plannedTarget: rep.totalPlannedTarget,
        dailyTarget: rep.dailyTarget,
        isActive: true,
      });
    } else {
      // Update target from most recent report if baseline was 0
      const existing = locMap.get(key)!;
      if (existing.plannedTarget === 0 && rep.totalPlannedTarget > 0) {
        existing.plannedTarget = rep.totalPlannedTarget;
      }
      if (existing.dailyTarget === 0 && rep.dailyTarget > 0) {
        existing.dailyTarget = rep.dailyTarget;
      }
    }
  }

  const allLocs = Array.from(locMap.values());
  const totalPlannedTarget = allLocs.reduce((acc, l) => acc + l.plannedTarget, 0);
  const baseDailyTarget = allLocs.reduce((acc, l) => acc + l.dailyTarget, 0);

  const expectedReportingWoredas =
    !filter.zone && !filter.woreda && settings.expectedWoredasOverride
      ? settings.expectedWoredasOverride
      : allLocs.length;

  // Determine latest day present in reports if no day filter specified for daily KPIs
  const allReportsForCampaign = getFilteredReports({
    campaignId: filter.campaignId,
    zone: filter.zone,
    woreda: filter.woreda,
  });
  const availableDays = Array.from(
    new Set(allReportsForCampaign.map((r) => r.campaignDayNum))
  ).sort((a, b) => a - b);
  const availableDates = Array.from(
    new Set(
      allReportsForCampaign
        .map((r) => r.reportDate)
        .filter((d): d is string => Boolean(d))
    )
  ).sort();

  const latestDay =
    filter.dayNum ??
    (availableDays.length > 0 ? availableDays[availableDays.length - 1] : null);

  // Track submitted woredas (woredas with an active report containing activity or submitted record)
  const submittedWoredaKeys = new Set<string>();
  const latestDayReports = latestDay
    ? reports.filter((r) => r.campaignDayNum === latestDay)
    : reports;

  for (const r of latestDayReports) {
    if (r.hasReportedActivity || r.teamsReported > 0 || r.totalVaccinated0_59 > 0) {
      submittedWoredaKeys.add(
        `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`
      );
    }
  }

  // Note: If a file has been uploaded where some rows are blank activity, only count rows with reported activity
  // unless an entire batch explicitly submitted 0-activity reports; checking hasReportedActivity prevents template blanks from counting as submitted!
  const submittedWoredas = submittedWoredaKeys.size;
  const pendingWoredas = Math.max(0, expectedReportingWoredas - submittedWoredas);

  const totalChildrenVaccinated0_59 = reports.reduce(
    (acc, r) => acc + r.totalVaccinated0_59,
    0
  );
  const totalChildrenVaccinated60_120 = reports.reduce(
    (acc, r) => acc + r.vacc60_120Before + r.vacc60_120NotBefore,
    0
  );

  const dailyVaccinated = latestDayReports.reduce(
    (acc, r) => acc + r.totalVaccinated0_59,
    0
  );
  const dailyTargetForLatest =
    latestDayReports.length > 0
      ? latestDayReports.reduce((acc, r) => acc + r.dailyTarget, 0) || baseDailyTarget
      : baseDailyTarget;

  const overallVaccinationCoveragePct =
    totalPlannedTarget > 0
      ? round2((totalChildrenVaccinated0_59 / totalPlannedTarget) * 100)
      : 0;
  const dailyVaccinationCoveragePct =
    dailyTargetForLatest > 0
      ? round2((dailyVaccinated / dailyTargetForLatest) * 100)
      : 0;

  // Teams: take latest day's team totals (avoid summing teams across 4 days!)
  const teamsSource = latestDayReports.length > 0 ? latestDayReports : reports;
  const totalVaccinationTeams = teamsSource.reduce((acc, r) => acc + r.teamsTotal, 0);
  const reportingVaccinationTeams = teamsSource.reduce(
    (acc, r) => acc + r.teamsReported,
    0
  );

  // Vaccine utilization (sum across filtered period)
  const nopv2VialsReceived = reports.reduce(
    (acc, r) => acc + (r.nopv2VialsReceived ?? 0),
    0
  );
  const nopv2VialsUsed = reports.reduce(
    (acc, r) => acc + (r.nopv2VialsUsed ?? 0),
    0
  );
  const nopv2WastageRows = reports.filter((r) => r.nopv2WastageRatePct !== null);
  const nopv2LostSum = reports.reduce(
    (acc, r) =>
      acc +
      (r.nopv2VialsBroken ?? 0) +
      (r.nopv2VialsReturnedBad ?? 0) +
      (r.nopv2VialsLost ?? 0),
    0
  );
  const nopv2WastageRatePct =
    nopv2VialsReceived > 0 && nopv2VialsUsed > 0
      ? round2(
          ((nopv2LostSum + Math.max(0, nopv2VialsUsed * 20 - totalChildrenVaccinated0_59)) /
            Math.max(1, nopv2VialsUsed * 20)) *
            100
        )
      : nopv2WastageRows.length > 0
        ? round2(
            nopv2WastageRows.reduce((a, r) => a + (r.nopv2WastageRatePct ?? 0), 0) /
              nopv2WastageRows.length
          )
        : null;

  const bopvVialsReceived = reports.reduce(
    (acc, r) => acc + (r.bopvVialsReceived ?? 0),
    0
  );
  const bopvVialsUsed = reports.reduce(
    (acc, r) => acc + (r.bopvVialsUsed ?? 0),
    0
  );
  const bopvWastageRows = reports.filter((r) => r.bopvWastageRatePct !== null);
  const bopvLostSum = reports.reduce(
    (acc, r) =>
      acc +
      (r.bopvVialsBroken ?? 0) +
      (r.bopvVialsReturnedBad ?? 0) +
      (r.bopvVialsLost ?? 0),
    0
  );
  const bopvWastageRatePct =
    bopvVialsReceived > 0 && bopvVialsUsed > 0
      ? round2(
          ((bopvLostSum + Math.max(0, bopvVialsUsed * 20 - totalChildrenVaccinated0_59)) /
            Math.max(1, bopvVialsUsed * 20)) *
            100
        )
      : bopvWastageRows.length > 0
        ? round2(
            bopvWastageRows.reduce((a, r) => a + (r.bopvWastageRatePct ?? 0), 0) /
              bopvWastageRows.length
          )
        : null;

  const zeroDoseIdentified = reports.reduce(
    (acc, r) => acc + r.zdIdentifiedLinked,
    0
  );
  const zeroDoseVaccinated = reports.reduce((acc, r) => acc + r.zdVaccinated, 0);
  const underVaccinatedIdentified = reports.reduce(
    (acc, r) => acc + r.uvIdentifiedLinked,
    0
  );
  const underVaccinatedVaccinated = reports.reduce(
    (acc, r) => acc + r.uvVaccinated,
    0
  );

  const afpAlertsTotal = reports.reduce((acc, r) => acc + r.afpAlertsCount, 0);
  const aefiAlertsTotal = reports.reduce((acc, r) => acc + r.aefiAlertsCount, 0);
  const afpVerifiedCasesTotal = alerts
    .filter((a) => a.alertType === 'AFP')
    .reduce((acc, a) => acc + a.verifiedClinicalCases, 0);
  const aefiVerifiedCasesTotal = alerts
    .filter((a) => a.alertType === 'AEFI')
    .reduce((acc, a) => acc + a.verifiedClinicalCases, 0);

  const smHhsVisited = reports.reduce((acc, r) => acc + r.smHhsVisited, 0);
  const smGroupDiscussions = reports.reduce(
    (acc, r) => acc + r.smGroupDiscussions,
    0
  );
  const smIpcReached = reports.reduce((acc, r) => acc + r.smIpcReached, 0);
  const smTotalActivities = smHhsVisited + smGroupDiscussions + smIpcReached;

  const kpis: DashboardKPIs = {
    totalPlannedTarget,
    totalDailyTarget: dailyTargetForLatest,
    totalChildrenVaccinated0_59,
    totalChildrenVaccinated60_120,
    overallVaccinationCoveragePct,
    dailyVaccinationCoveragePct,
    expectedReportingWoredas,
    submittedWoredas,
    pendingWoredas,
    totalVaccinationTeams,
    reportingVaccinationTeams,
    nopv2VialsReceived,
    nopv2VialsUsed,
    nopv2WastageRatePct,
    bopvVialsReceived,
    bopvVialsUsed,
    bopvWastageRatePct,
    zeroDoseIdentified,
    zeroDoseVaccinated,
    underVaccinatedIdentified,
    underVaccinatedVaccinated,
    afpAlertsTotal,
    aefiAlertsTotal,
    afpVerifiedCasesTotal,
    aefiVerifiedCasesTotal,
    smHhsVisited,
    smGroupDiscussions,
    smIpcReached,
    smTotalActivities,
  };

  // Zone breakdown
  const zoneGroups = new Map<string, AdminLocation[]>();
  for (const loc of allLocs) {
    const arr = zoneGroups.get(loc.canonicalZone) ?? [];
    arr.push(loc);
    zoneGroups.set(loc.canonicalZone, arr);
  }

  const zones: ZoneSummary[] = [];
  for (const [zoneName, zLocs] of zoneGroups.entries()) {
    const zReports = reports.filter((r) => r.canonicalZone === zoneName);
    const zLatest = latestDay
      ? zReports.filter((r) => r.campaignDayNum === latestDay)
      : zReports;
    const zSubmitted = new Set(
      zLatest
        .filter(
          (r) =>
            r.hasReportedActivity || r.teamsReported > 0 || r.totalVaccinated0_59 > 0
        )
        .map((r) => r.canonicalWoreda.toLowerCase())
    ).size;

    const plannedTarget = zLocs.reduce((a, l) => a + l.plannedTarget, 0);
    const dailyTarget = zLocs.reduce((a, l) => a + l.dailyTarget, 0);
    const vaccinated0_59 = zReports.reduce((a, r) => a + r.totalVaccinated0_59, 0);
    const vaccinated60_120 = zReports.reduce(
      (a, r) => a + r.vacc60_120Before + r.vacc60_120NotBefore,
      0
    );
    const dailyVacc = zLatest.reduce((a, r) => a + r.totalVaccinated0_59, 0);
    const overallCoveragePct =
      plannedTarget > 0 ? round2((vaccinated0_59 / plannedTarget) * 100) : 0;
    const dailyCoveragePct =
      dailyTarget > 0 ? round2((dailyVacc / dailyTarget) * 100) : 0;
    const afpAlerts = zReports.reduce((a, r) => a + r.afpAlertsCount, 0);
    const aefiAlerts = zReports.reduce((a, r) => a + r.aefiAlertsCount, 0);
    const completenessPct =
      zLocs.length > 0 ? round2((zSubmitted / zLocs.length) * 100) : 0;

    let statusCategory: ZoneSummary['statusCategory'] = 'no_report';
    if (zSubmitted === 0) {
      statusCategory = 'no_report';
    } else if (
      afpAlerts > 0 ||
      aefiAlerts > 0 ||
      overallCoveragePct < settings.coverageCriticalPct
    ) {
      statusCategory = 'critical_alert';
    } else if (overallCoveragePct < settings.coverageTargetPct) {
      statusCategory = 'below_target';
    } else {
      statusCategory = 'on_target';
    }

    zones.push({
      zone: zoneName,
      woredaCount: zLocs.length,
      submittedWoredas: zSubmitted,
      pendingWoredas: Math.max(0, zLocs.length - zSubmitted),
      completenessPct,
      plannedTarget,
      dailyTarget,
      vaccinated0_59,
      vaccinated60_120,
      overallCoveragePct,
      dailyCoveragePct,
      nopv2Received: zReports.reduce((a, r) => a + (r.nopv2VialsReceived ?? 0), 0),
      nopv2Used: zReports.reduce((a, r) => a + (r.nopv2VialsUsed ?? 0), 0),
      bopvReceived: zReports.reduce((a, r) => a + (r.bopvVialsReceived ?? 0), 0),
      bopvUsed: zReports.reduce((a, r) => a + (r.bopvVialsUsed ?? 0), 0),
      afpAlerts,
      aefiAlerts,
      zdIdentified: zReports.reduce((a, r) => a + r.zdIdentifiedLinked, 0),
      zdVaccinated: zReports.reduce((a, r) => a + r.zdVaccinated, 0),
      uvIdentified: zReports.reduce((a, r) => a + r.uvIdentifiedLinked, 0),
      uvVaccinated: zReports.reduce((a, r) => a + r.uvVaccinated, 0),
      teamsTotal: (zLatest.length > 0 ? zLatest : zReports).reduce(
        (a, r) => a + r.teamsTotal,
        0
      ),
      teamsReported: (zLatest.length > 0 ? zLatest : zReports).reduce(
        (a, r) => a + r.teamsReported,
        0
      ),
      statusCategory,
    });
  }

  zones.sort((a, b) => a.zone.localeCompare(b.zone));

  // Daily trends (calculated across days in availableDays without double-counting plannedTarget)
  const dailyTrends: DailyTrendPoint[] = [];
  let runningCumulative = 0;
  for (const day of availableDays) {
    const dayReports = allReportsForCampaign.filter((r) => r.campaignDayNum === day);
    const dayVacc = dayReports.reduce((a, r) => a + r.totalVaccinated0_59, 0);
    runningCumulative += dayVacc;
    const dayTarget =
      dayReports.reduce((a, r) => a + r.dailyTarget, 0) || baseDailyTarget;
    const submittedDayWoredas = new Set(
      dayReports
        .filter(
          (r) =>
            r.hasReportedActivity || r.teamsReported > 0 || r.totalVaccinated0_59 > 0
        )
        .map((r) => `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`)
    ).size;

    const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
    const nopv2WastageVals = dayReports
      .map((r) => r.nopv2WastageRatePct)
      .filter((v): v is number => v !== null);
    const bopvWastageVals = dayReports
      .map((r) => r.bopvWastageRatePct)
      .filter((v): v is number => v !== null);

    dailyTrends.push({
      campaignDayNum: day,
      campaignDayLabel: `${day}${suffix} day`,
      reportDate: dayReports.find((r) => r.reportDate)?.reportDate ?? null,
      dailyTarget: dayTarget,
      plannedTarget: totalPlannedTarget,
      vaccinated0_59: dayVacc,
      cumulativeVaccinated0_59: runningCumulative,
      dailyCoveragePct: dayTarget > 0 ? round2((dayVacc / dayTarget) * 100) : 0,
      cumulativeCoveragePct:
        totalPlannedTarget > 0
          ? round2((runningCumulative / totalPlannedTarget) * 100)
          : 0,
      vacc0_11: dayReports.reduce(
        (a, r) => a + r.vacc0_11Before + r.vacc0_11NotBefore,
        0
      ),
      vacc12_59: dayReports.reduce(
        (a, r) => a + r.vacc12_59Before + r.vacc12_59NotBefore,
        0
      ),
      vacc60_120: dayReports.reduce(
        (a, r) => a + r.vacc60_120Before + r.vacc60_120NotBefore,
        0
      ),
      vaccinatedBefore: dayReports.reduce(
        (a, r) => a + r.vacc0_11Before + r.vacc12_59Before + r.vacc60_120Before,
        0
      ),
      notVaccinatedBefore: dayReports.reduce(
        (a, r) =>
          a + r.vacc0_11NotBefore + r.vacc12_59NotBefore + r.vacc60_120NotBefore,
        0
      ),
      nopv2Used: dayReports.reduce((a, r) => a + (r.nopv2VialsUsed ?? 0), 0),
      bopvUsed: dayReports.reduce((a, r) => a + (r.bopvVialsUsed ?? 0), 0),
      nopv2WastagePct:
        nopv2WastageVals.length > 0
          ? round2(
              nopv2WastageVals.reduce((a, b) => a + b, 0) / nopv2WastageVals.length
            )
          : null,
      bopvWastagePct:
        bopvWastageVals.length > 0
          ? round2(
              bopvWastageVals.reduce((a, b) => a + b, 0) / bopvWastageVals.length
            )
          : null,
      teamsTotal: dayReports.reduce((a, r) => a + r.teamsTotal, 0),
      teamsReported: dayReports.reduce((a, r) => a + r.teamsReported, 0),
      submittedWoredas: submittedDayWoredas,
      expectedWoredas: expectedReportingWoredas,
      completenessPct:
        expectedReportingWoredas > 0
          ? round2((submittedDayWoredas / expectedReportingWoredas) * 100)
          : 0,
    });
  }

  // Automatic Data Quality Warnings (strictly separated from Public Health Alerts!)
  const dataQualityWarnings = runDataQualityChecks({
    locations: allLocs,
    reports,
    latestDay,
    settings,
  });

  return {
    kpis,
    zones,
    dailyTrends,
    dataQualityWarnings,
    settings,
    availableDays,
    availableDates,
    latestImport: getLatestConfirmedImport(filter.campaignId),
    serverTimestamp: new Date().toISOString(),
  };
}

export function computeAdvancedAnalytics(
  filter: AnalyticsFilter
): AdvancedAnalyticsData {
  const summary = computeDashboardSummary(filter);
  const reports = getFilteredReports(filter);
  const locations = getFilteredLocations(filter);
  const { kpis, zones, settings, latestImport, serverTimestamp } = summary;

  let age0_11Before = 0;
  let age0_11NotBefore = 0;
  let age12_59Before = 0;
  let age12_59NotBefore = 0;
  let age60_120Before = 0;
  let age60_120NotBefore = 0;

  for (const r of reports) {
    age0_11Before += r.vacc0_11Before;
    age0_11NotBefore += r.vacc0_11NotBefore;
    age12_59Before += r.vacc12_59Before;
    age12_59NotBefore += r.vacc12_59NotBefore;
    age60_120Before += r.vacc60_120Before;
    age60_120NotBefore += r.vacc60_120NotBefore;
  }

  const age0_11Total = age0_11Before + age0_11NotBefore;
  const age12_59Total = age12_59Before + age12_59NotBefore;
  const age60_120Total = age60_120Before + age60_120NotBefore;
  const totalVaccinatedBefore = age0_11Before + age12_59Before + age60_120Before;
  const totalNotVaccinatedBefore =
    age0_11NotBefore + age12_59NotBefore + age60_120NotBefore;

  const zoneAnalytics: ZoneAnalyticsDetail[] = zones.map((z) => {
    const zReps = reports.filter((r) => r.canonicalZone === z.zone);
    const z0_11 = zReps.reduce(
      (a, r) => a + r.vacc0_11Before + r.vacc0_11NotBefore,
      0
    );
    const z12_59 = zReps.reduce(
      (a, r) => a + r.vacc12_59Before + r.vacc12_59NotBefore,
      0
    );
    const zPriorYes = zReps.reduce(
      (a, r) => a + r.vacc0_11Before + r.vacc12_59Before + r.vacc60_120Before,
      0
    );
    const zPriorNo = zReps.reduce(
      (a, r) =>
        a + r.vacc0_11NotBefore + r.vacc12_59NotBefore + r.vacc60_120NotBefore,
      0
    );
    const zPriorTot = zPriorYes + zPriorNo;

    const nopv2Wastes = zReps
      .map((r) => r.nopv2WastageRatePct)
      .filter((v): v is number => v !== null);
    const bopvWastes = zReps
      .map((r) => r.bopvWastageRatePct)
      .filter((v): v is number => v !== null);

    return {
      ...z,
      age0_11: z0_11,
      age12_59: z12_59,
      vaccinatedBefore: zPriorYes,
      notVaccinatedBefore: zPriorNo,
      priorVaccinatedSharePct:
        zPriorTot > 0 ? round2((zPriorYes / zPriorTot) * 100) : 0,
      zdConversionPct:
        z.zdIdentified > 0 ? round2((z.zdVaccinated / z.zdIdentified) * 100) : 0,
      uvConversionPct:
        z.uvIdentified > 0 ? round2((z.uvVaccinated / z.uvIdentified) * 100) : 0,
      nopv2WastageRatePct:
        nopv2Wastes.length > 0
          ? round2(nopv2Wastes.reduce((a, b) => a + b, 0) / nopv2Wastes.length)
          : null,
      bopvWastageRatePct:
        bopvWastes.length > 0
          ? round2(bopvWastes.reduce((a, b) => a + b, 0) / bopvWastes.length)
          : null,
      targetGap: Math.max(0, z.plannedTarget - z.vaccinated0_59),
    };
  });

  // Woreda-level metrics
  const woredaMap = new Map<string, WoredaPerformanceMetric>();
  for (const loc of locations) {
    const key = `${loc.canonicalZone.toLowerCase()}|${loc.canonicalWoreda.toLowerCase()}`;
    woredaMap.set(key, {
      zone: loc.canonicalZone,
      woreda: loc.canonicalWoreda,
      plannedTarget: loc.plannedTarget,
      dailyTarget: loc.dailyTarget,
      vaccinated0_59: 0,
      coveragePct: 0,
      afpAlerts: 0,
      aefiAlerts: 0,
      submitted: false,
      statusCategory: 'no_report',
    });
  }

  for (const r of reports) {
    const key = `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`;
    const entry = woredaMap.get(key) ?? {
      zone: r.canonicalZone,
      woreda: r.canonicalWoreda,
      plannedTarget: r.totalPlannedTarget,
      dailyTarget: r.dailyTarget,
      vaccinated0_59: 0,
      coveragePct: 0,
      afpAlerts: 0,
      aefiAlerts: 0,
      submitted: false,
      statusCategory: 'no_report' as const,
    };
    entry.plannedTarget = Math.max(entry.plannedTarget, r.totalPlannedTarget);
    entry.dailyTarget = Math.max(entry.dailyTarget, r.dailyTarget);
    entry.vaccinated0_59 += r.totalVaccinated0_59;
    entry.afpAlerts += r.afpAlertsCount;
    entry.aefiAlerts += r.aefiAlertsCount;
    if (
      r.hasReportedActivity ||
      r.totalVaccinated0_59 > 0 ||
      r.teamsReported > 0
    ) {
      entry.submitted = true;
    }
    woredaMap.set(key, entry);
  }

  const allWoredas = Array.from(woredaMap.values()).map((w) => {
    const coveragePct =
      w.plannedTarget > 0 ? round2((w.vaccinated0_59 / w.plannedTarget) * 100) : 0;
    let statusCategory: WoredaPerformanceMetric['statusCategory'] = 'no_report';
    if (!w.submitted) {
      statusCategory = 'no_report';
    } else if (
      w.afpAlerts > 0 ||
      w.aefiAlerts > 0 ||
      coveragePct < settings.coverageCriticalPct
    ) {
      statusCategory = 'critical_alert';
    } else if (coveragePct < settings.coverageTargetPct) {
      statusCategory = 'below_target';
    } else {
      statusCategory = 'on_target';
    }
    return { ...w, coveragePct, statusCategory };
  });

  const submittedWoredasList = allWoredas.filter((w) => w.submitted);
  const topWoredas = [...submittedWoredasList]
    .sort((a, b) => b.coveragePct - a.coveragePct)
    .slice(0, 10);
  const criticalWoredas = [...allWoredas]
    .filter(
      (w) =>
        w.statusCategory === 'critical_alert' ||
        w.afpAlerts > 0 ||
        w.aefiAlerts > 0
    )
    .sort(
      (a, b) =>
        b.afpAlerts +
        b.aefiAlerts -
        (a.afpAlerts + a.aefiAlerts) || a.coveragePct - b.coveragePct
    )
    .slice(0, 15);

  const sumNullable = (getter: (r: CampaignDailyReport) => number | null) => {
    const present = reports.filter((r) => getter(r) !== null);
    if (present.length === 0) return null;
    return present.reduce((a, r) => a + (getter(r) ?? 0), 0);
  };

  return {
    serverTimestamp,
    latestImport,
    vaccinationPerformance: {
      totalPlannedTarget: kpis.totalPlannedTarget,
      totalDailyTarget: kpis.totalDailyTarget,
      totalVaccinated0_59: kpis.totalChildrenVaccinated0_59,
      totalVaccinated60_120: kpis.totalChildrenVaccinated60_120,
      dailyVaccinationCoveragePct: kpis.dailyVaccinationCoveragePct,
      cumulativeVaccinationCoveragePct: kpis.overallVaccinationCoveragePct,
      targetAchievementPct: kpis.overallVaccinationCoveragePct,
      remainingTarget: Math.max(
        0,
        kpis.totalPlannedTarget - kpis.totalChildrenVaccinated0_59
      ),
    },
    ageGroups: {
      age0_11Before,
      age0_11NotBefore,
      age0_11Total,
      age12_59Before,
      age12_59NotBefore,
      age12_59Total,
      age60_120Before,
      age60_120NotBefore,
      age60_120Total,
      totalVaccinatedBefore,
      totalNotVaccinatedBefore,
    },
    zoneAnalytics,
    topWoredas,
    criticalWoredas,
    allWoredas,
    vaccineAccountability: {
      nopv2: {
        received: sumNullable((r) => r.nopv2VialsReceived),
        used: sumNullable((r) => r.nopv2VialsUsed),
        partiallyUsed: sumNullable((r) => r.nopv2VialsPartiallyUsed),
        returnedGood: sumNullable((r) => r.nopv2VialsReturnedUnusedGood),
        broken: sumNullable((r) => r.nopv2VialsBroken),
        returnedBad: sumNullable((r) => r.nopv2VialsReturnedBad),
        lost: sumNullable((r) => r.nopv2VialsLost),
        wastagePct: kpis.nopv2WastageRatePct,
      },
      bopv: {
        received: sumNullable((r) => r.bopvVialsReceived),
        used: sumNullable((r) => r.bopvVialsUsed),
        partiallyUsed: sumNullable((r) => r.bopvVialsPartiallyUsed),
        returnedGood: sumNullable((r) => r.bopvVialsReturnedUnusedGood),
        broken: sumNullable((r) => r.bopvVialsBroken),
        returnedBad: sumNullable((r) => r.bopvVialsReturnedBad),
        lost: sumNullable((r) => r.bopvVialsLost),
        wastagePct: kpis.bopvWastageRatePct,
      },
    },
    integrationMetrics: {
      zdIdentified: kpis.zeroDoseIdentified,
      zdVaccinated: kpis.zeroDoseVaccinated,
      zdConversionPct:
        kpis.zeroDoseIdentified > 0
          ? round2((kpis.zeroDoseVaccinated / kpis.zeroDoseIdentified) * 100)
          : 0,
      uvIdentified: kpis.underVaccinatedIdentified,
      uvVaccinated: kpis.underVaccinatedVaccinated,
      uvConversionPct:
        kpis.underVaccinatedIdentified > 0
          ? round2(
              (kpis.underVaccinatedVaccinated / kpis.underVaccinatedIdentified) *
                100
            )
          : 0,
      smHhsVisited: kpis.smHhsVisited,
      smGroupDiscussions: kpis.smGroupDiscussions,
      smIpcReached: kpis.smIpcReached,
      teamsTotal: kpis.totalVaccinationTeams,
      teamsReported: kpis.reportingVaccinationTeams,
      teamsReportingPct:
        kpis.totalVaccinationTeams > 0
          ? round2(
              (kpis.reportingVaccinationTeams / kpis.totalVaccinationTeams) * 100
            )
          : 0,
    },
  };
}

export function getCommandRoomState(
  filter: AnalyticsFilter
): CommandRoomStateResponse {
  const cacheKey = JSON.stringify({
    campaignId: filter.campaignId ?? 1,
    dayNum: filter.dayNum ?? null,
    reportDate: filter.reportDate ?? null,
    zone: filter.zone ?? null,
    woreda: filter.woreda ?? null,
    vaccineType: filter.vaccineType ?? 'all',
  });

  const cached = commandRoomCache.get(cacheKey);
  if (cached && cached.version === analyticsCacheVersion) {
    return {
      ...cached.payload,
      serverTimestamp: new Date().toISOString(),
    };
  }

  const summary = computeDashboardSummary(filter);
  const advanced = computeAdvancedAnalytics(filter);
  const reports = getFilteredReports(filter);

  const campRow = db
    .prepare('SELECT * FROM campaigns WHERE id = ?')
    .get(filter.campaignId ?? 1) as Record<string, unknown> | undefined;
  const activeCampaign: Campaign | null = campRow
    ? {
        id: Number(campRow.id),
        name: String(campRow.name),
        roundCode: String(campRow.round_code),
        vaccines: String(campRow.vaccines),
        startDate: String(campRow.start_date),
        endDate: String(campRow.end_date),
        expectedDays: Number(campRow.expected_days),
        status: campRow.status as Campaign['status'],
        createdAt: String(campRow.created_at),
      }
    : null;

  const submittedWoredasList = advanced.allWoredas.filter((w) => w.submitted);
  const top10Woredas = [...submittedWoredasList]
    .sort((a, b) => b.coveragePct - a.coveragePct)
    .slice(0, 10);
  const bottom10Woredas = [...submittedWoredasList]
    .sort((a, b) => a.coveragePct - b.coveragePct)
    .slice(0, 10);

  const zoneVaccines: CommandRoomZoneVaccine[] = advanced.zoneAnalytics.map(
    (z) => ({
      zone: z.zone,
      nopv2Received: z.nopv2Received,
      nopv2Used: z.nopv2Used,
      nopv2WastagePct: z.nopv2WastageRatePct,
      bopvReceived: z.bopvReceived,
      bopvUsed: z.bopvUsed,
      bopvWastagePct: z.bopvWastageRatePct,
    })
  );

  // Build non-PII zone & woreda surveillance + equity follow-up severity list
  const survMap = new Map<string, CommandRoomAlertSummary>();
  for (const r of reports) {
    const key = `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`;
    const prev = survMap.get(key) ?? {
      zone: r.canonicalZone,
      woreda: r.canonicalWoreda,
      afpAlerts: 0,
      aefiAlerts: 0,
      zdGap: 0,
      uvGap: 0,
      severity: 'informational' as AlertSeverity,
      latestDay: r.campaignDayNum,
    };
    prev.afpAlerts += r.afpAlertsCount;
    prev.aefiAlerts += r.aefiAlertsCount;
    prev.zdGap += Math.max(0, r.zdIdentifiedLinked - r.zdVaccinated);
    prev.uvGap += Math.max(0, r.uvIdentifiedLinked - r.uvVaccinated);
    prev.latestDay = Math.max(prev.latestDay ?? 0, r.campaignDayNum);
    survMap.set(key, prev);
  }

  const severityRank: Record<AlertSeverity, number> = {
    critical: 4,
    high: 3,
    moderate: 2,
    informational: 1,
  };

  const surveillanceLocations: CommandRoomAlertSummary[] = Array.from(
    survMap.values()
  )
    .map((item) => {
      let severity: AlertSeverity = 'informational';
      if (item.afpAlerts > 0 || item.aefiAlerts >= 3) {
        severity = 'critical';
      } else if (item.aefiAlerts > 0 || item.zdGap >= 20) {
        severity = 'high';
      } else if (item.zdGap > 0 || item.uvGap > 0) {
        severity = 'moderate';
      }
      return { ...item, severity };
    })
    .filter(
      (item) =>
        item.afpAlerts > 0 ||
        item.aefiAlerts > 0 ||
        item.zdGap > 0 ||
        item.uvGap > 0
    )
    .sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        b.afpAlerts +
          b.aefiAlerts -
          (a.afpAlerts + a.aefiAlerts) ||
        b.zdGap + b.uvGap - (a.zdGap + a.uvGap)
    );

  const woredaStatuses = advanced.allWoredas.map((w) => ({
    zone: w.zone,
    woreda: w.woreda,
    coveragePct: w.coveragePct,
    submitted: w.submitted,
    afpAlerts: w.afpAlerts,
    aefiAlerts: w.aefiAlerts,
    statusCategory: w.statusCategory,
  }));

  const payload: CommandRoomStateResponse = {
    serverTimestamp: summary.serverTimestamp,
    cacheVersion: analyticsCacheVersion,
    activeCampaign,
    latestImport: summary.latestImport,
    availableDays: summary.availableDays,
    latestReportingDay:
      summary.availableDays.length > 0
        ? summary.availableDays[summary.availableDays.length - 1]
        : null,
    settings: summary.settings,
    kpis: summary.kpis,
    zones: summary.zones,
    dailyTrends: summary.dailyTrends,
    vaccinationPerformance: advanced.vaccinationPerformance,
    ageGroups: advanced.ageGroups,
    vaccineAccountability: advanced.vaccineAccountability,
    integrationMetrics: advanced.integrationMetrics,
    top10Woredas,
    bottom10Woredas,
    zoneVaccines,
    surveillanceLocations,
    woredaStatuses,
  };

  commandRoomCache.set(cacheKey, {
    version: analyticsCacheVersion,
    payload,
  });

  return payload;
}

export function getPaginatedWoredaStatuses(params: {
  filter: AnalyticsFilter;
  page?: number;
  pageSize?: number;
  status?: string;
}): {
  items: WoredaPerformanceMetric[];
  total: number;
  page: number;
  pageSize: number;
} {
  const state = getCommandRoomState(params.filter);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));

  const filtered = params.status
    ? state.woredaStatuses.filter((w) => w.statusCategory === params.status)
    : state.woredaStatuses;

  // Map back full WoredaPerformanceMetric cleanly from cached woreda list
  const adv = computeAdvancedAnalytics(params.filter);
  const advMap = new Map(
    adv.allWoredas.map((w) => [`${w.zone}|${w.woreda}`, w])
  );
  const matched = filtered
    .map((w) => advMap.get(`${w.zone}|${w.woreda}`))
    .filter((w): w is WoredaPerformanceMetric => Boolean(w));

  const start = (page - 1) * pageSize;
  return {
    items: matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
  };
}

function runDataQualityChecks(params: {
  locations: AdminLocation[];
  reports: CampaignDailyReport[];
  latestDay: number | null;
  settings: SystemSettings;
}): DataQualityWarning[] {
  const warnings: DataQualityWarning[] = [];
  const { locations, reports, latestDay, settings } = params;

  if (reports.length === 0) {
    return warnings;
  }

  // 1. Missing reports for latest active day
  if (latestDay !== null) {
    const submittedLatest = new Set(
      reports
        .filter(
          (r) =>
            r.campaignDayNum === latestDay &&
            (r.hasReportedActivity || r.teamsReported > 0 || r.totalVaccinated0_59 > 0)
        )
        .map((r) => `${r.canonicalZone.toLowerCase()}|${r.canonicalWoreda.toLowerCase()}`)
    );

    for (const loc of locations) {
      const key = `${loc.canonicalZone.toLowerCase()}|${loc.canonicalWoreda.toLowerCase()}`;
      if (!submittedLatest.has(key)) {
        warnings.push({
          id: `missing-${latestDay}-${key}`,
          category: 'missing_report',
          severity: 'warning',
          zone: loc.canonicalZone,
          woreda: loc.canonicalWoreda,
          campaignDayNum: latestDay,
          metricValue: 'Not Submitted',
          thresholdValue: `Day ${latestDay} Expected`,
          description: `No active report received for Day ${latestDay}.`,
        });
      }
    }
  }

  // 2. Row-level checks on active reports
  for (const r of reports) {
    const baseId = `r-${r.id}`;

    if (!r.rawZone || !r.rawWoreda) {
      warnings.push({
        id: `${baseId}-admin`,
        category: 'missing_admin_info',
        severity: 'critical',
        zone: r.canonicalZone || '(Missing)',
        woreda: r.canonicalWoreda || '(Missing)',
        campaignDayNum: r.campaignDayNum,
        metricValue: 'Incomplete Admin Info',
        thresholdValue: 'Zone & Woreda Required',
        description: 'Source record has blank administrative zone or woreda field.',
      });
    }

    if (r.hasReportedActivity && r.dailyTarget > 0) {
      const pct = (r.totalVaccinated0_59 / r.dailyTarget) * 100;
      if (pct < settings.coverageCriticalPct) {
        warnings.push({
          id: `${baseId}-lowcov`,
          category: 'low_coverage',
          severity: 'warning',
          zone: r.canonicalZone,
          woreda: r.canonicalWoreda,
          campaignDayNum: r.campaignDayNum,
          metricValue: `${round2(pct)}%`,
          thresholdValue: `< ${settings.coverageCriticalPct}%`,
          description: `Daily vaccination coverage (${round2(pct)}%) is below critical threshold.`,
        });
      }
      const deviation = Math.abs(pct - 100);
      if (deviation > settings.dailyDeviationPct && pct > 100) {
        warnings.push({
          id: `${baseId}-dailydev`,
          category: 'daily_target_anomaly',
          severity: 'info',
          zone: r.canonicalZone,
          woreda: r.canonicalWoreda,
          campaignDayNum: r.campaignDayNum,
          metricValue: `${r.totalVaccinated0_59.toLocaleString()} vs ${r.dailyTarget.toLocaleString()}`,
          thresholdValue: `±${settings.dailyDeviationPct}%`,
          description: `Daily vaccinations deviate by ${round2(deviation)}% from daily target.`,
        });
      }
    }

    if (
      r.totalPlannedTarget > 0 &&
      (r.totalVaccinated0_59 / r.totalPlannedTarget) * 100 >
        settings.overTargetAlertPct
    ) {
      const pct = round2((r.totalVaccinated0_59 / r.totalPlannedTarget) * 100);
      warnings.push({
        id: `${baseId}-overtarget`,
        category: 'exceeds_target',
        severity: 'warning',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${pct}%`,
        thresholdValue: `> ${settings.overTargetAlertPct}%`,
        description: `Reported vaccinations exceed total planned target (${pct}%). Verify denominator or duplicate tally.`,
      });
    }

    const sum0_59 =
      r.vacc0_11Before +
      r.vacc0_11NotBefore +
      r.vacc12_59Before +
      r.vacc12_59NotBefore;
    if (sum0_59 > 0 && r.totalVaccinated0_59 !== sum0_59) {
      warnings.push({
        id: `${baseId}-mismatch`,
        category: 'inconsistent_totals',
        severity: 'critical',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${r.totalVaccinated0_59} vs ${sum0_59}`,
        thresholdValue: 'Exact Match',
        description: `Total 0–59m (${r.totalVaccinated0_59}) does not equal sum of 0–11m and 12–59m columns (${sum0_59}).`,
      });
    }

    if (
      r.nopv2WastageRatePct !== null &&
      r.nopv2WastageRatePct > settings.maxWastagePct
    ) {
      warnings.push({
        id: `${baseId}-nopv2waste`,
        category: 'high_wastage',
        severity: 'warning',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${r.nopv2WastageRatePct}% (nOPV2)`,
        thresholdValue: `> ${settings.maxWastagePct}%`,
        description: `Unusually high nOPV2 vaccine wastage rate reported (${r.nopv2WastageRatePct}%).`,
      });
    }

    if (
      r.bopvWastageRatePct !== null &&
      r.bopvWastageRatePct > settings.maxWastagePct
    ) {
      warnings.push({
        id: `${baseId}-bopvwaste`,
        category: 'high_wastage',
        severity: 'warning',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${r.bopvWastageRatePct}% (bOPV)`,
        thresholdValue: `> ${settings.maxWastagePct}%`,
        description: `Unusually high bOPV vaccine wastage rate reported (${r.bopvWastageRatePct}%).`,
      });
    }

    if (r.zdIdentifiedLinked > r.zdVaccinated) {
      warnings.push({
        id: `${baseId}-zdgap`,
        category: 'zd_unvaccinated_gap',
        severity: 'warning',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${r.zdIdentifiedLinked - r.zdVaccinated} unreached`,
        thresholdValue: '0 gap',
        description: `${r.zdIdentifiedLinked} zero-dose children identified/linked but only ${r.zdVaccinated} vaccinated.`,
      });
    }

    if (r.uvIdentifiedLinked > r.uvVaccinated) {
      warnings.push({
        id: `${baseId}-uvgap`,
        category: 'uv_unvaccinated_gap',
        severity: 'info',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${r.uvIdentifiedLinked - r.uvVaccinated} unreached`,
        thresholdValue: '0 gap',
        description: `${r.uvIdentifiedLinked} under-vaccinated children identified/linked but only ${r.uvVaccinated} vaccinated.`,
      });
    }

    if (r.teamsTotal > r.teamsReported) {
      warnings.push({
        id: `${baseId}-teams`,
        category: 'teams_not_reporting',
        severity: 'warning',
        zone: r.canonicalZone,
        woreda: r.canonicalWoreda,
        campaignDayNum: r.campaignDayNum,
        metricValue: `${r.teamsReported}/${r.teamsTotal} teams`,
        thresholdValue: '100% reporting',
        description: `${r.teamsTotal - r.teamsReported} vaccination team(s) deployed did not submit daily reports.`,
      });
    }
  }

  return warnings;
}
