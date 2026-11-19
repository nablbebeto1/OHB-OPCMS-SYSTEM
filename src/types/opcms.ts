export type UserRole =
  | 'system_admin'
  | 'central_command'
  | 'zone_officer'
  | 'woreda_officer'
  | 'viewer'
  | 'command_room_viewer';

export interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  assignedZone: string | null;
  assignedWoreda: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Campaign {
  id: number;
  name: string;
  roundCode: string;
  vaccines: string;
  startDate: string;
  endDate: string;
  expectedDays: number;
  status: 'active' | 'completed' | 'planned';
  createdAt: string;
}

export interface AdminLocation {
  id: number;
  serialNo: number | null;
  rawRegion: string;
  rawZone: string;
  rawWoreda: string;
  canonicalRegion: string;
  canonicalZone: string;
  canonicalWoreda: string;
  locationType: 'Zone Woreda' | 'Town Administration' | 'City Sub-City';
  plannedTarget: number;
  dailyTarget: number;
  isActive: boolean;
}

export interface ParsedCampaignRow {
  rowNumber: number;
  serialNo: number | null;
  rawRegion: string;
  rawZone: string;
  rawWoreda: string;
  canonicalRegion: string;
  canonicalZone: string;
  canonicalWoreda: string;
  campaignDayLabel: string;
  campaignDayNum: number | null;
  reportDate: string | null;

  // B. Target vs coverage
  totalPlannedTarget: number;
  dailyTarget: number;
  vacc0_11Before: number;
  vacc0_11NotBefore: number;
  vacc12_59Before: number;
  vacc12_59NotBefore: number;
  vacc60_120Before: number;
  vacc60_120NotBefore: number;
  totalVaccinated0_59: number;
  dailyCoveredPct: number | null;
  coveredFromTotalPct: number | null;

  // C. nOPV2 vaccine utilization
  nopv2VialsReceived: number | null;
  nopv2VialsUsed: number | null;
  nopv2VialsPartiallyUsed: number | null;
  nopv2VialsReturnedUnusedGood: number | null;
  nopv2VialsBroken: number | null;
  nopv2VialsReturnedBad: number | null;
  nopv2VialsLost: number | null;
  nopv2WastageRatePct: number | null;

  // D. bOPV vaccine utilization
  bopvVialsReceived: number | null;
  bopvVialsUsed: number | null;
  bopvVialsPartiallyUsed: number | null;
  bopvVialsReturnedUnusedGood: number | null;
  bopvVialsBroken: number | null;
  bopvVialsReturnedBad: number | null;
  bopvVialsLost: number | null;
  bopvWastageRatePct: number | null;

  // E. Surveillance
  afpAlertsCount: number;
  aefiAlertsCount: number;

  // F. Social mobilization
  smHhsVisited: number;
  smGroupDiscussions: number;
  smIpcReached: number;

  // G. Zero Dose integration
  zdIdentifiedLinked: number;
  zdVaccinated: number;

  // H. Under-vaccinated children
  uvIdentifiedLinked: number;
  uvVaccinated: number;

  // I. Vaccination teams
  teamsTotal: number;
  teamsReported: number;

  // J. Remarks
  remarks: string;

  // Derived metadata during parsing
  hasReportedActivity: boolean;
  rowStatus: 'valid' | 'warning' | 'error';
  duplicateAction?: 'new' | 'duplicate_existing' | 'duplicate_in_file';
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  rowNumber: number;
  field: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ImportPreviewPayload {
  stagingId: string;
  originalFilename: string;
  fileSizeBytes: number;
  fileFormat: 'xlsx' | 'csv';
  detectedTemplate: string;
  headerRowsDetected: number;
  unexpectedColumns: string[];
  totalRowsDetected: number;
  totalSummaryRowsSkipped: number;
  validRowsCount: number;
  warningRowsCount: number;
  rejectedRowsCount: number;
  duplicateRowsCount: number;
  newRowsCount: number;
  validationStatus: 'passed' | 'passed_with_warnings' | 'failed';
  issues: ValidationIssue[];
  previewRows: ParsedCampaignRow[];
  detectedDays: number[];
}

export type ImportMode = 'incremental_skip' | 'incremental_update' | 'replace_period';

export interface ImportBatch {
  id: number;
  campaignId: number;
  originalFilename: string;
  storedPath: string;
  fileSizeBytes: number;
  fileFormat: string;
  detectedTemplate: string;
  importMode: ImportMode;
  validationStatus: string;
  detectedRecords: number;
  importedRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  rejectedRecords: number;
  uploadedByUserId: number;
  uploadedByName: string;
  uploadedAt: string;
  confirmedAt: string | null;
  status: 'confirmed' | 'rolled_back';
  rolledBackAt: string | null;
  rolledBackByName: string | null;
  notes: string | null;
}

export interface CampaignDailyReport {
  id: number;
  campaignId: number;
  importBatchId: number;
  serialNo: number | null;
  rawRegion: string;
  rawZone: string;
  rawWoreda: string;
  canonicalZone: string;
  canonicalWoreda: string;
  campaignDayLabel: string;
  campaignDayNum: number;
  reportDate: string | null;

  totalPlannedTarget: number;
  dailyTarget: number;
  vacc0_11Before: number;
  vacc0_11NotBefore: number;
  vacc12_59Before: number;
  vacc12_59NotBefore: number;
  vacc60_120Before: number;
  vacc60_120NotBefore: number;
  totalVaccinated0_59: number;
  dailyCoveredPct: number;
  coveredFromTotalPct: number;

  nopv2VialsReceived: number | null;
  nopv2VialsUsed: number | null;
  nopv2VialsPartiallyUsed: number | null;
  nopv2VialsReturnedUnusedGood: number | null;
  nopv2VialsBroken: number | null;
  nopv2VialsReturnedBad: number | null;
  nopv2VialsLost: number | null;
  nopv2WastageRatePct: number | null;

  bopvVialsReceived: number | null;
  bopvVialsUsed: number | null;
  bopvVialsPartiallyUsed: number | null;
  bopvVialsReturnedUnusedGood: number | null;
  bopvVialsBroken: number | null;
  bopvVialsReturnedBad: number | null;
  bopvVialsLost: number | null;
  bopvWastageRatePct: number | null;

  afpAlertsCount: number;
  aefiAlertsCount: number;

  smHhsVisited: number;
  smGroupDiscussions: number;
  smIpcReached: number;

  zdIdentifiedLinked: number;
  zdVaccinated: number;

  uvIdentifiedLinked: number;
  uvVaccinated: number;

  teamsTotal: number;
  teamsReported: number;
  remarks: string;

  hasReportedActivity: boolean;
  sourceSubmittedAt: string | null;
  uploadedAt: string;
  version: number;
  isActive: boolean;
}

export type AlertType = 'AFP' | 'AEFI';
export type ClinicalCaseStatus =
  | 'reported_pending'
  | 'under_investigation'
  | 'sample_collected'
  | 'verified_confirmed'
  | 'discarded';

export interface SurveillanceAlert {
  id: number;
  campaignId: number;
  reportId: number;
  alertType: AlertType;
  canonicalZone: string;
  canonicalWoreda: string;
  campaignDayNum: number;
  reportDate: string | null;
  administrativeAlertCount: number;
  verifiedClinicalCases: number;
  clinicalStatus: ClinicalCaseStatus;
  sourceRemarks: string;
  followUpNotes: string;
  assignedInvestigator: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualityWarning {
  id: string;
  category:
    | 'low_coverage'
    | 'missing_report'
    | 'high_wastage'
    | 'inconsistent_totals'
    | 'exceeds_target'
    | 'daily_target_anomaly'
    | 'zd_unvaccinated_gap'
    | 'uv_unvaccinated_gap'
    | 'teams_not_reporting'
    | 'missing_admin_info';
  severity: 'critical' | 'warning' | 'info';
  zone: string;
  woreda: string;
  campaignDayNum: number | null;
  metricValue: string;
  thresholdValue: string;
  description: string;
}

export interface DashboardKPIs {
  totalPlannedTarget: number;
  totalDailyTarget: number;
  totalChildrenVaccinated0_59: number;
  totalChildrenVaccinated60_120: number;
  overallVaccinationCoveragePct: number;
  dailyVaccinationCoveragePct: number;
  expectedReportingWoredas: number;
  submittedWoredas: number;
  pendingWoredas: number;
  totalVaccinationTeams: number;
  reportingVaccinationTeams: number;
  nopv2VialsReceived: number;
  nopv2VialsUsed: number;
  nopv2WastageRatePct: number | null;
  bopvVialsReceived: number;
  bopvVialsUsed: number;
  bopvWastageRatePct: number | null;
  zeroDoseIdentified: number;
  zeroDoseVaccinated: number;
  underVaccinatedIdentified: number;
  underVaccinatedVaccinated: number;
  afpAlertsTotal: number;
  aefiAlertsTotal: number;
  afpVerifiedCasesTotal: number;
  aefiVerifiedCasesTotal: number;
  smHhsVisited: number;
  smGroupDiscussions: number;
  smIpcReached: number;
  smTotalActivities: number;
}

export interface ZoneSummary {
  zone: string;
  woredaCount: number;
  submittedWoredas: number;
  pendingWoredas: number;
  completenessPct: number;
  plannedTarget: number;
  dailyTarget: number;
  vaccinated0_59: number;
  vaccinated60_120: number;
  overallCoveragePct: number;
  dailyCoveragePct: number;
  nopv2Received: number;
  nopv2Used: number;
  bopvReceived: number;
  bopvUsed: number;
  afpAlerts: number;
  aefiAlerts: number;
  zdIdentified: number;
  zdVaccinated: number;
  uvIdentified: number;
  uvVaccinated: number;
  teamsTotal: number;
  teamsReported: number;
  statusCategory: 'on_target' | 'below_target' | 'critical_alert' | 'no_report';
}

export interface DailyTrendPoint {
  campaignDayNum: number;
  campaignDayLabel: string;
  reportDate: string | null;
  dailyTarget: number;
  plannedTarget: number;
  vaccinated0_59: number;
  cumulativeVaccinated0_59: number;
  dailyCoveragePct: number;
  cumulativeCoveragePct: number;
  vacc0_11: number;
  vacc12_59: number;
  vacc60_120: number;
  vaccinatedBefore: number;
  notVaccinatedBefore: number;
  nopv2Used: number;
  bopvUsed: number;
  nopv2WastagePct: number | null;
  bopvWastagePct: number | null;
  teamsTotal: number;
  teamsReported: number;
  submittedWoredas: number;
  expectedWoredas: number;
  completenessPct: number;
}

export interface SystemSettings {
  coverageTargetPct: number;
  coverageCriticalPct: number;
  maxWastagePct: number;
  overTargetAlertPct: number;
  dailyDeviationPct: number;
  expectedWoredasOverride: number | null;
  googleDriveSyncStatus: 'manual_upload_active';
  guestPublicOverviewEnabled: boolean;
  commandRoomAutoRotate: boolean;
  commandRoomIntervalSec: number;
  commandRoomEnabledScreens: number[];
  commandRoomDefaultScreen: number;
  commandRoomFullscreenStartup: boolean;
  commandRoomDataRefreshSec: number;
  commandRoomDisplayTitle: string;
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  username: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface GeoBoundaryRecord {
  id: number;
  level: 'zone' | 'woreda';
  nameField: string;
  featureCount: number;
  uploadedByName: string;
  uploadedAt: string;
  geojson: GeoJSON.FeatureCollection;
}

export interface LatestImportMeta {
  id: number;
  originalFilename: string;
  uploadedByName: string;
  confirmedAt: string;
  importedRecords: number;
  updatedRecords: number;
  importMode: string;
}

export interface WoredaPerformanceMetric {
  zone: string;
  woreda: string;
  plannedTarget: number;
  dailyTarget: number;
  vaccinated0_59: number;
  coveragePct: number;
  afpAlerts: number;
  aefiAlerts: number;
  submitted: boolean;
  statusCategory: 'on_target' | 'below_target' | 'critical_alert' | 'no_report';
}

export interface ZoneAnalyticsDetail extends ZoneSummary {
  age0_11: number;
  age12_59: number;
  vaccinatedBefore: number;
  notVaccinatedBefore: number;
  priorVaccinatedSharePct: number;
  zdConversionPct: number;
  uvConversionPct: number;
  nopv2WastageRatePct: number | null;
  bopvWastageRatePct: number | null;
  targetGap: number;
}

export interface AdvancedAnalyticsData {
  serverTimestamp: string;
  latestImport: LatestImportMeta | null;
  vaccinationPerformance: {
    totalPlannedTarget: number;
    totalDailyTarget: number;
    totalVaccinated0_59: number;
    totalVaccinated60_120: number;
    dailyVaccinationCoveragePct: number;
    cumulativeVaccinationCoveragePct: number;
    targetAchievementPct: number;
    remainingTarget: number;
  };
  ageGroups: {
    age0_11Before: number;
    age0_11NotBefore: number;
    age0_11Total: number;
    age12_59Before: number;
    age12_59NotBefore: number;
    age12_59Total: number;
    age60_120Before: number;
    age60_120NotBefore: number;
    age60_120Total: number;
    totalVaccinatedBefore: number;
    totalNotVaccinatedBefore: number;
  };
  zoneAnalytics: ZoneAnalyticsDetail[];
  topWoredas: WoredaPerformanceMetric[];
  criticalWoredas: WoredaPerformanceMetric[];
  allWoredas: WoredaPerformanceMetric[];
  vaccineAccountability: {
    nopv2: {
      received: number | null;
      used: number | null;
      partiallyUsed: number | null;
      returnedGood: number | null;
      broken: number | null;
      returnedBad: number | null;
      lost: number | null;
      wastagePct: number | null;
    };
    bopv: {
      received: number | null;
      used: number | null;
      partiallyUsed: number | null;
      returnedGood: number | null;
      broken: number | null;
      returnedBad: number | null;
      lost: number | null;
      wastagePct: number | null;
    };
  };
  integrationMetrics: {
    zdIdentified: number;
    zdVaccinated: number;
    zdConversionPct: number;
    uvIdentified: number;
    uvVaccinated: number;
    uvConversionPct: number;
    smHhsVisited: number;
    smGroupDiscussions: number;
    smIpcReached: number;
    teamsTotal: number;
    teamsReported: number;
    teamsReportingPct: number;
  };
}

export type AlertSeverity = 'critical' | 'high' | 'moderate' | 'informational';

export interface CommandRoomAlertSummary {
  zone: string;
  woreda: string;
  afpAlerts: number;
  aefiAlerts: number;
  zdGap: number;
  uvGap: number;
  severity: AlertSeverity;
  latestDay: number | null;
}

export interface CommandRoomZoneVaccine {
  zone: string;
  nopv2Received: number;
  nopv2Used: number;
  nopv2WastagePct: number | null;
  bopvReceived: number;
  bopvUsed: number;
  bopvWastagePct: number | null;
}

export interface CommandRoomStateResponse {
  serverTimestamp: string;
  cacheVersion: number;
  activeCampaign: Campaign | null;
  latestImport: LatestImportMeta | null;
  availableDays: number[];
  latestReportingDay: number | null;
  settings: SystemSettings;
  kpis: DashboardKPIs;
  zones: ZoneSummary[];
  dailyTrends: DailyTrendPoint[];
  vaccinationPerformance: AdvancedAnalyticsData['vaccinationPerformance'];
  ageGroups: AdvancedAnalyticsData['ageGroups'];
  vaccineAccountability: AdvancedAnalyticsData['vaccineAccountability'];
  integrationMetrics: AdvancedAnalyticsData['integrationMetrics'];
  top10Woredas: WoredaPerformanceMetric[];
  bottom10Woredas: WoredaPerformanceMetric[];
  zoneVaccines: CommandRoomZoneVaccine[];
  surveillanceLocations: CommandRoomAlertSummary[];
  woredaStatuses: Array<{
    zone: string;
    woreda: string;
    coveragePct: number;
    submitted: boolean;
    afpAlerts: number;
    aefiAlerts: number;
    statusCategory: WoredaPerformanceMetric['statusCategory'];
  }>;
}

export type BrandingAssetType = 'logo' | 'favicon';

export interface BrandingAssetMeta {
  id: number;
  assetType: BrandingAssetType;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  isActive: boolean;
  uploadedByName: string;
  uploadedAt: string;
}

export interface BrandingConfig {
  logoUrl: string | null;
  faviconUrl: string | null;
  hasCustomLogo: boolean;
  hasCustomFavicon: boolean;
  logoMeta: BrandingAssetMeta | null;
  faviconMeta: BrandingAssetMeta | null;
  history?: BrandingAssetMeta[];
  updatedAt: string;
}

export interface NavMenuItem {
  key: string;
  label: string;
  path: string;
  group: 'operations' | 'analytics' | 'admin';
  requiredPermission: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: UserAccount;
  permissions: string[];
  navigation: NavMenuItem[];
  defaultLanding: string;
  guestPublicOverviewEnabled: boolean;
}

export interface PublicOverviewResponse {
  campaignName: string;
  roundCode: string;
  totalPlannedTarget: number;
  totalChildrenVaccinated0_59: number;
  overallVaccinationCoveragePct: number;
  expectedReportingWoredas: number;
  submittedWoredas: number;
  serverTimestamp: string;
}



