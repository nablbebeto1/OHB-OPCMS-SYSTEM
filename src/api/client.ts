import type {
  AdminLocation,
  AdvancedAnalyticsData,
  AuditLogEntry,
  AuthMeResponse,
  BackupArchiveInfo,
  BackupRestoreResult,
  BrandingAssetType,
  BrandingConfig,
  Campaign,
  CampaignDailyReport,
  CommandRoomStateResponse,
  DailyTrendPoint,
  DashboardKPIs,
  DataQualityWarning,
  FilePreviewLinkRecord,
  GeoBoundaryRecord,
  ImportBatch,
  ImportMode,
  ImportPreviewPayload,
  LatestImportMeta,
  PublicFilePreviewInfo,
  PublicOverviewResponse,
  SpreadsheetPreviewData,
  StoredFileRecord,
  SurveillanceAlert,
  SystemSettings,
  UserAccount,
  WoredaPerformanceMetric,
  ZoneSummary,
} from '../types/opcms';

/**
 * Centralized API Base URL resolution.
 * Production builds leave VITE_API_BASE_URL empty so requests stay same-origin
 * (e.g. https://polio.orhb.gov.et/api/...) and never expose internal ports 3000 or 4949.
 */
function resolveApiBaseUrl(): string {
  const raw = (import.meta.env?.VITE_API_BASE_URL ?? '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}${path}`;
}

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

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
    if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  }
  return fallback;
}

async function parseJsonResponse<T>(res: Response, endpoint: string): Promise<T> {
  const rawText = await res.text();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const looksLikeHtml =
    contentType.includes('text/html') || /^\s*<!doctype|^\s*<html/i.test(rawText);

  let parsed: unknown = null;
  if (rawText.trim() && !looksLikeHtml) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
      localStorage.removeItem('opcms_token');
    }
    if (looksLikeHtml) {
      throw new Error(
        `API request to ${endpoint} returned HTML instead of JSON (HTTP ${res.status}). Verify reverse proxy routing for /api/.`
      );
    }
    throw new Error(
      extractErrorMessage(parsed, `Request failed (HTTP ${res.status})`)
    );
  }

  if (looksLikeHtml) {
    throw new Error(
      `API request to ${endpoint} received an HTML page instead of JSON. Ensure /api/ is routed to the backend service before the frontend fallback.`
    );
  }

  if (parsed === null) {
    throw new Error(
      `Invalid non-JSON response received from ${endpoint} (HTTP ${res.status}).`
    );
  }

  return parsed as T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const token = localStorage.getItem('opcms_token');
  const headers: Record<string, string> = {
    Accept: 'application/json',
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

  return parseJsonResponse<T>(res, path);
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

export interface ChangePasswordResponse {
  ok: boolean;
  requiresRelogin?: boolean;
  message?: string;
  user?: UserAccount;
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
    requestJson<ChangePasswordResponse>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getPublicOverview: () =>
    requestJson<PublicOverviewResponse>('/api/public/overview'),

  getBranding: () => requestJson<BrandingConfig>('/api/branding'),

  uploadBrandingAsset: async (assetType: BrandingAssetType, file: File) => {
    const path = `/api/admin/branding/${assetType}`;
    const fd = new FormData();
    fd.append('file', file);
    const token = localStorage.getItem('opcms_token');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      body: fd,
      headers,
      credentials: 'include',
    });
    return parseJsonResponse<BrandingConfig>(res, path);
  },

  deleteBrandingAsset: (assetType: BrandingAssetType) =>
    requestJson<BrandingConfig>(`/api/admin/branding/${assetType}`, {
      method: 'DELETE',
    }),

  restoreBrandingAsset: (id: number) =>
    requestJson<BrandingConfig>(`/api/admin/branding/restore/${id}`, {
      method: 'POST',
    }),

  resetAllBranding: (confirmationText: string) =>
    requestJson<BrandingConfig>('/api/admin/branding/reset', {
      method: 'POST',
      body: JSON.stringify({ confirmationText }),
    }),

  listBackups: () => requestJson<BackupArchiveInfo[]>('/api/admin/backups'),

  createBackup: () =>
    requestJson<BackupArchiveInfo>('/api/admin/backups', {
      method: 'POST',
    }),

  backupDownloadUrl: (filename: string) =>
    apiUrl(`/api/admin/backups/${encodeURIComponent(filename)}/download`),

  restoreBackup: async (params: {
    file?: File;
    serverFilename?: string;
    restoreScope: 'full' | 'branding_and_settings';
  }): Promise<BackupRestoreResult> => {
    const path = '/api/admin/backups/restore';
    if (params.file) {
      const fd = new FormData();
      fd.append('file', params.file);
      fd.append('restoreScope', params.restoreScope);
      const token = localStorage.getItem('opcms_token');
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        body: fd,
        headers,
        credentials: 'include',
      });
      return parseJsonResponse<BackupRestoreResult>(res, path);
    }
    return requestJson<BackupRestoreResult>(path, {
      method: 'POST',
      body: JSON.stringify({
        serverFilename: params.serverFilename,
        restoreScope: params.restoreScope,
      }),
    });
  },

  resetOperationalData: (confirmationText: string, clearStoredVaultFiles = false) =>
    requestJson<{
      ok: boolean;
      deletedReports: number;
      deletedAlerts: number;
      deletedBatches: number;
      deletedVaultFiles: number;
      brandingPreserved: boolean;
      settingsPreserved: boolean;
    }>('/api/admin/operational-reset', {
      method: 'POST',
      body: JSON.stringify({ confirmationText, clearStoredVaultFiles }),
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
      const path = '/api/imports/stage';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(path));
      xhr.setRequestHeader('Accept', 'application/json');
      const token = localStorage.getItem('opcms_token');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };

      xhr.onload = () => {
        const text = xhr.responseText || '';
        const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
        if (ct.includes('text/html') || /^\s*<!doctype|^\s*<html/i.test(text)) {
          reject(
            new Error(
              `Upload endpoint returned HTML instead of JSON (HTTP ${xhr.status}). Verify reverse proxy /api/ routing.`
            )
          );
          return;
        }
        try {
          const data = JSON.parse(text);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data as ImportPreviewPayload);
          } else {
            reject(
              new Error(
                extractErrorMessage(data, `Upload failed (HTTP ${xhr.status})`)
              )
            );
          }
        } catch {
          reject(new Error(`Upload failed with non-JSON response (HTTP ${xhr.status})`));
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
    const path = '/api/geo/boundaries';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('level', level);
    const token = localStorage.getItem('opcms_token');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(apiUrl(path), {
      method: 'POST',
      body: fd,
      headers,
      credentials: 'include',
    });
    return parseJsonResponse<{
      id: number;
      level: string;
      nameField: string;
      featureCount: number;
    }>(res, path);
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
    return apiUrl(`/api/exports/${reportType}${q}${sep}format=${format}`);
  },

  // Permanent File Storage & 6-Day Secure Live Preview Links
  listStoredFiles: (params?: { module?: string; category?: string; search?: string }) => {
    const sp = new URLSearchParams();
    if (params?.module && params.module !== 'all') sp.set('module', params.module);
    if (params?.category && params.category !== 'all') sp.set('category', params.category);
    if (params?.search?.trim()) sp.set('search', params.search.trim());
    const qs = sp.toString();
    return requestJson<StoredFileRecord[]>(`/api/files${qs ? `?${qs}` : ''}`);
  },

  uploadPermanentFile: async (payload: {
    file: File;
    module?: string;
    category?: string;
    description?: string;
    associatedRecordType?: string;
    associatedRecordId?: number;
  }): Promise<StoredFileRecord> => {
    const path = '/api/files/upload';
    const fd = new FormData();
    fd.append('file', payload.file);
    fd.append('module', payload.module || 'documents');
    fd.append('category', payload.category || 'general');
    if (payload.description) fd.append('description', payload.description);
    if (payload.associatedRecordType) fd.append('associatedRecordType', payload.associatedRecordType);
    if (payload.associatedRecordId !== undefined) {
      fd.append('associatedRecordId', String(payload.associatedRecordId));
    }
    const token = localStorage.getItem('opcms_token');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      body: fd,
      headers,
      credentials: 'include',
    });
    return parseJsonResponse<StoredFileRecord>(res, path);
  },

  getFileViewUrl: (fileId: number) => apiUrl(`/api/files/${fileId}/view`),
  getFileDownloadUrl: (fileId: number) => apiUrl(`/api/files/${fileId}/download`),

  generatePreviewLink: (fileId: number) =>
    requestJson<FilePreviewLinkRecord>(`/api/files/${fileId}/preview-links`, {
      method: 'POST',
    }),

  revokePreviewLink: (linkId: number, reason?: string) =>
    requestJson<{ ok: boolean; id: number; isRevoked: boolean }>(
      `/api/files/preview-links/${linkId}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Revoked by administrator' }),
      }
    ),

  getPublicPreviewInfo: (token: string) =>
    requestJson<PublicFilePreviewInfo>(
      `/api/files/preview/${encodeURIComponent(token)}`
    ),

  getPublicPreviewSheet: (token: string) =>
    requestJson<SpreadsheetPreviewData>(
      `/api/files/preview/${encodeURIComponent(token)}/sheet`
    ),
};
