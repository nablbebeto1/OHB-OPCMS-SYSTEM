import type {
  AdminLocation,
  AdvancedAnalyticsData,
  AuditLogEntry,
  AuthMeResponse,
  BrandingConfig,
  Campaign,
  CampaignDailyReport,
  CommandRoomStateResponse,
  DailyTrendPoint,
  DashboardKPIs,
  DataQualityWarning,
  GeoBoundaryRecord,
  ImportBatch,
  ImportMode,
  ImportPreviewPayload,
  LatestImportMeta,
  PublicOverviewResponse,
  SurveillanceAlert,
  SystemSettings,
  UserAccount,
  WoredaPerformanceMetric,
  ZoneSummary,
} from '../types/opcms';

export interface FilterParams {
  campaignId?: number;
  dayNum?: number | null;
  reportDate?: string | null;
  zone?: string | null;
  woreda?: string | null;
  vaccineType?: 'all' | 'nopv2' | 'bopv';
}

function buildQuery(params: FilterParams): string {
  const sp = new URLSearchParams();
  if (params.campaignId) sp.set('campaignId', String(params.campaignId));
  if (params.dayNum) sp.set('dayNum', String(params.dayNum));
  if (params.reportDate) sp.set('reportDate', params.reportDate);
  if (params.zone) sp.set('zone', params.zone);
  if (params.woreda) sp.set('woreda', params.woreda);
  if (params.vaccineType && params.vaccineType !== 'all') {
    sp.set('vaccineType', params.vaccineType);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('opcms_token');
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (
    init?.body &&
    typeof init.body === 'string' &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error) msg = String(errBody.error);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

export interface DashboardSummaryResponse {
  kpis: DashboardKPIs;
  zones: ZoneSummary[];
  dailyTrends: DailyTrendPoint[];
  dataQualityWarnings: DataQualityWarning[];
  settings: SystemSettings;
  availableDays: number[];
  availableDates: string[];
  latestImport: LatestImportMeta | null;
  serverTimestamp: string;
}

export const api = {
  getMe: () => requestJson<AuthMeResponse>('/api/auth/me'),

  login: (username: string, password: string) =>
    requestJson<{ token: string } & AuthMeResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    requestJson<{ ok: boolean; user: UserAccount }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getPublicOverview: () =>
    requestJson<PublicOverviewResponse>('/api/public/overview'),

  getBranding: () => requestJson<BrandingConfig>('/api/branding'),

  uploadBrandingAsset: async (assetType: 'logo' | 'favicon', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const token = localStorage.getItem('opcms_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/admin/branding/${assetType}`, {
      method: 'POST',
      body: fd,
      headers,
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Failed to upload ${assetType}`);
    return data as BrandingConfig;
  },

  deleteBrandingAsset: (assetType: 'logo' | 'favicon') =>
    requestJson<BrandingConfig>(`/api/admin/branding/${assetType}`, {
      method: 'DELETE',
    }),

  restoreBrandingAsset: (id: number) =>
    requestJson<BrandingConfig>(`/api/admin/branding/restore/${id}`, {
      method: 'POST',
    }),

  getCampaigns: () => requestJson<Campaign[]>('/api/campaigns'),

  createCampaign: (payload: {
    name: string;
    roundCode: string;
    vaccines: string;
    startDate: string;
    endDate: string;
    expectedDays: number;
  }) =>
    requestJson<{ id: number }>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCommandRoomState: (filter: FilterParams) =>
    requestJson<CommandRoomStateResponse>(
      `/api/command-room/state${buildQuery(filter)}`
    ),

  getCommandRoomWoredas: (
    filter: FilterParams,
    page = 1,
    pageSize = 25,
    status?: string
  ) => {
    const q = buildQuery(filter);
    const sep = q ? '&' : '?';
    const statusParam = status ? `&status=${encodeURIComponent(status)}` : '';
    return requestJson<{
      items: WoredaPerformanceMetric[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/command-room/woredas${q}${sep}page=${page}&pageSize=${pageSize}${statusParam}`);
  },

  getDashboardSummary: (filter: FilterParams) =>
    requestJson<DashboardSummaryResponse>(
      `/api/dashboard/summary${buildQuery(filter)}`
    ),

  getAdvancedAnalytics: (filter: FilterParams) =>
    requestJson<AdvancedAnalyticsData>(
      `/api/analytics/advanced${buildQuery(filter)}`
    ),

  getLocations: (filter: FilterParams) =>
    requestJson<AdminLocation[]>(`/api/locations${buildQuery(filter)}`),

  getDailyReports: (filter: FilterParams) =>
    requestJson<CampaignDailyReport[]>(
      `/api/reports/daily${buildQuery(filter)}`
    ),

  correctDailyReport: (id: number, patch: Record<string, unknown>) =>
    requestJson<{ ok: boolean; id: number }>(
      `/api/reports/daily/${id}/correct`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  stageImportFile: (
    file: File,
    campaignId: number,
    onProgress: (pct: number) => void
  ): Promise<ImportPreviewPayload> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/imports/stage');
      const token = localStorage.getItem('opcms_token');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data as ImportPreviewPayload);
          } else {
            reject(new Error(data?.error || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during file upload.'));

      const fd = new FormData();
      fd.append('file', file);
      fd.append('campaignId', String(campaignId));
      xhr.send(fd);
    });
  },

  confirmImport: (payload: {
    stagingId: string;
    importMode: ImportMode;
    sourceSubmittedAt: string | null;
    notes: string | null;
  }) =>
    requestJson<ImportBatch>('/api/imports/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getImportHistory: (campaignId?: number) =>
    requestJson<ImportBatch[]>(
      `/api/imports/history${campaignId ? `?campaignId=${campaignId}` : ''}`
    ),

  rollbackImport: (batchId: number) =>
    requestJson<ImportBatch>(`/api/imports/${batchId}/rollback`, {
      method: 'POST',
    }),

  getAlerts: (filter: FilterParams) =>
    requestJson<SurveillanceAlert[]>(`/api/alerts${buildQuery(filter)}`),

  updateAlert: (
    id: number,
    payload: {
      clinicalStatus: string;
      verifiedClinicalCases: number;
      followUpNotes: string;
      assignedInvestigator: string;
    }
  ) =>
    requestJson<{ ok: boolean }>(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getGeoBoundaries: () =>
    requestJson<GeoBoundaryRecord[]>('/api/geo/boundaries'),

  uploadGeoBoundary: async (file: File, level: 'zone' | 'woreda') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('level', level);
    const token = localStorage.getItem('opcms_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/geo/boundaries', {
      method: 'POST',
      body: fd,
      headers,
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Boundary upload failed');
    return data as { id: number; level: string; nameField: string; featureCount: number };
  },

  getUsers: () => requestJson<UserAccount[]>('/api/users'),

  createUser: (payload: {
    username: string;
    fullName: string;
    email: string;
    password: string;
    role: string;
    assignedZone?: string;
    assignedWoreda?: string;
  }) =>
    requestJson<{ id: number }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUser: (id: number, payload: Record<string, unknown>) =>
    requestJson<{ ok: boolean }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getAuditLogs: () => requestJson<AuditLogEntry[]>('/api/audit-logs'),

  getSettings: () => requestJson<SystemSettings>('/api/settings'),

  updateSettings: (payload: Partial<SystemSettings>) =>
    requestJson<SystemSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  exportUrl: (reportType: string, format: 'xlsx' | 'csv' | 'pdf', filter: FilterParams) => {
    const q = buildQuery(filter);
    const sep = q ? '&' : '?';
    return `/api/exports/${reportType}${q}${sep}format=${format}`;
  },
};
