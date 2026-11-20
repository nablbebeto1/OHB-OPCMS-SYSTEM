import React, { useEffect, useRef, useState } from 'react';
import {
  Shield,
  UserPlus,
  Settings,
  CheckCircle2,
  Tv,
  KeyRound,
  Image as ImageIcon,
  Upload,
  Trash2,
  RotateCcw,
  Globe,
  Eye,
  Palette,
  LayoutGrid,
  HardDriveDownload,
  ArchiveRestore,
  AlertTriangle,
  Download,
  Sliders,
} from 'lucide-react';
import { api, apiUrl } from '../../api/client';
import { BrandLogo } from '../BrandLogo';
import type {
  AuditLogEntry,
  BackupArchiveInfo,
  BrandingAssetType,
  BrandingConfig,
  Campaign,
  SystemSettings,
  UserAccount,
  UserRole,
} from '../../types/opcms';

const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: 'System Administrator',
  command_center: 'Central Command Center',
  central_command: 'Central Command Center (Legacy)',
  zone_officer: 'Regional / Zone Monitoring Officer',
  woreda_officer: 'Woreda Monitoring Officer',
  viewer: 'Read-only Dashboard Viewer',
  command_room_viewer: 'Command Room Viewer (Display Only)',
};

const COMMAND_ROOM_SCREEN_LABELS: Array<{ id: number; label: string }> = [
  { id: 1, label: '01 · Regional Overview' },
  { id: 2, label: '02 · Vaccination Performance' },
  { id: 3, label: '03 · Vaccine Management' },
  { id: 4, label: '04 · Surveillance & Security' },
  { id: 5, label: '05 · Reporting Compliance' },
];

interface BrandingSlotDescriptor {
  key: BrandingAssetType;
  title: string;
  subtitle: string;
  accept: string;
  maxHint: string;
  featured?: boolean;
}

const BRANDING_SLOTS: BrandingSlotDescriptor[] = [
  {
    key: 'logo',
    title: 'Main OHB Institutional Logo',
    subtitle: 'Primary emblem & fallback logo across portals and exported branding',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 5 MB',
    featured: true,
  },
  {
    key: 'favicon',
    title: 'Browser Tab Favicon',
    subtitle: 'Updates browser tab icon live & persists across reloads',
    accept: '.ico,.png,.svg',
    maxHint: 'ICO, PNG, SVG · Max 2 MB',
    featured: true,
  },
  {
    key: 'app_logo',
    title: 'Application Logo (Sidebar & Shared)',
    subtitle: 'Used in left navigation rail and shared shell branding',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 5 MB',
  },
  {
    key: 'command_center_logo',
    title: 'Central Command Center / Command Room Logo',
    subtitle: 'Displayed on large-screen Command Room wallboards and Live Command Center',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 5 MB',
  },
  {
    key: 'login_logo',
    title: 'Login Page Branding Logo',
    subtitle: 'Shown prominently above the staff sign-in form',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 5 MB',
  },
  {
    key: 'header_logo',
    title: 'Application Header Logo',
    subtitle: 'Compact institutional mark inside the top command bar',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 5 MB',
  },
  {
    key: 'footer_logo',
    title: 'Institutional Footer Logo',
    subtitle: 'Small emblem displayed next to footer attribution text',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 5 MB',
  },
  {
    key: 'login_background',
    title: 'Login Portal Background Visual',
    subtitle: 'Optional subtle watermark/backdrop on the staff login portal',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 10 MB',
  },
  {
    key: 'visual_asset',
    title: 'Additional Institutional Visual Asset',
    subtitle: 'Secondary regional emblem, seal, or campaign visual banner',
    accept: '.png,.jpg,.jpeg,.svg,.webp',
    maxHint: 'PNG, JPG, SVG, WebP · Max 10 MB',
  },
];

const TOGGLEABLE_MODULES: Array<{ key: string; label: string; group: string }> = [
  { key: 'live_command_center', label: 'Live Command Center', group: 'Operations' },
  { key: 'command_room', label: 'Command Room (5-Screen)', group: 'Operations' },
  { key: 'command_center', label: 'Command Center', group: 'Operations' },
  { key: 'campaign_overview', label: 'Campaign Overview', group: 'Operations' },
  { key: 'alerts', label: 'AFP & AEFI Alerts', group: 'Operations' },
  { key: 'geographic_performance', label: 'Geographic Performance', group: 'Analytics' },
  { key: 'daily_vaccination', label: 'Daily Vaccination', group: 'Analytics' },
  { key: 'vaccine_utilization', label: 'Vaccine Utilization', group: 'Analytics' },
  { key: 'social_mobilization', label: 'Social Mobilization', group: 'Analytics' },
  { key: 'zero_dose', label: 'Zero Dose & Under-vacc.', group: 'Analytics' },
  { key: 'reporting_completeness', label: 'Reporting Completeness', group: 'Analytics' },
  { key: 'reports_analytics', label: 'Reports & Analytics', group: 'Analytics' },
  { key: 'data_upload', label: 'Data Upload Center', group: 'Operations' },
  { key: 'file_vault', label: 'Document & File Vault', group: 'Operations' },
];

const FONT_OPTIONS: Array<SystemSettings['displayFont']> = [
  'Plus Jakarta Sans',
  'DM Sans',
  'Inter',
  'System Sans',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface StagedSlotFile {
  file: File;
  previewUrl: string;
  dims: { w: number; h: number } | null;
}

export const BrandingSettingsPanel: React.FC<{
  branding: BrandingConfig | null;
  settings?: SystemSettings | null;
  currentUser: UserAccount;
  authenticated: boolean;
  onRequireAuth: () => void;
  onBrandingChanged: (next: BrandingConfig) => void;
  onAppearanceUpdated?: () => void;
}> = ({
  branding,
  settings,
  currentUser,
  authenticated,
  onRequireAuth,
  onBrandingChanged,
  onAppearanceUpdated,
}) => {
  const isAdmin = authenticated && currentUser.role === 'system_admin';

  const fileInputRefs = useRef<Partial<Record<BrandingAssetType, HTMLInputElement | null>>>({});
  const [stagedBySlot, setStagedBySlot] = useState<Partial<Record<BrandingAssetType, StagedSlotFile>>>({});
  const stagedRef = useRef(stagedBySlot);
  stagedRef.current = stagedBySlot;

  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState<BrandingAssetType | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const [appearanceForm, setAppearanceForm] = useState({
    appName: settings?.appName || branding?.identity?.appName || 'Oromia Polio Campaign Management System',
    appShortName: settings?.appShortName || branding?.identity?.appShortName || 'OHB-OPCMS',
    organizationName: settings?.organizationName || branding?.identity?.organizationName || 'Oromia Health Bureau',
    appTagline:
      settings?.appTagline ||
      branding?.identity?.appTagline ||
      'Central Command Center – nOPV2 and bOPV2 Supplementary Immunization Activities',
    footerText:
      settings?.footerText ||
      branding?.identity?.footerText ||
      'Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System',
    showFooterBranding:
      settings?.showFooterBranding ?? branding?.identity?.showFooterBranding ?? true,
    primaryColor: settings?.primaryColor || branding?.theme?.primaryColor || '#485EA9',
    secondaryColor: settings?.secondaryColor || branding?.theme?.secondaryColor || '#3A99CF',
    accentColor: settings?.accentColor || branding?.theme?.accentColor || '#D29441',
    surfaceColor: settings?.surfaceColor || branding?.theme?.surfaceColor || '#F8FAFC',
    displayFont: (settings?.displayFont || branding?.theme?.displayFont || 'Plus Jakarta Sans') as SystemSettings['displayFont'],
    bodyFont: (settings?.bodyFont || branding?.theme?.bodyFont || 'DM Sans') as SystemSettings['bodyFont'],
    fontScale: (settings?.fontScale || branding?.theme?.fontScale || 'standard') as SystemSettings['fontScale'],
    loginTheme: (settings?.loginTheme || branding?.theme?.loginTheme || 'clean_light') as SystemSettings['loginTheme'],
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setAppearanceForm({
      appName:
        settings?.appName || branding?.identity?.appName || 'Oromia Polio Campaign Management System',
      appShortName: settings?.appShortName || branding?.identity?.appShortName || 'OHB-OPCMS',
      organizationName:
        settings?.organizationName || branding?.identity?.organizationName || 'Oromia Health Bureau',
      appTagline:
        settings?.appTagline ||
        branding?.identity?.appTagline ||
        'Central Command Center – nOPV2 and bOPV2 Supplementary Immunization Activities',
      footerText:
        settings?.footerText ||
        branding?.identity?.footerText ||
        'Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System',
      showFooterBranding:
        settings?.showFooterBranding ?? branding?.identity?.showFooterBranding ?? true,
      primaryColor: settings?.primaryColor || branding?.theme?.primaryColor || '#485EA9',
      secondaryColor: settings?.secondaryColor || branding?.theme?.secondaryColor || '#3A99CF',
      accentColor: settings?.accentColor || branding?.theme?.accentColor || '#D29441',
      surfaceColor: settings?.surfaceColor || branding?.theme?.surfaceColor || '#F8FAFC',
      displayFont: (settings?.displayFont ||
        branding?.theme?.displayFont ||
        'Plus Jakarta Sans') as SystemSettings['displayFont'],
      bodyFont: (settings?.bodyFont ||
        branding?.theme?.bodyFont ||
        'DM Sans') as SystemSettings['bodyFont'],
      fontScale: (settings?.fontScale ||
        branding?.theme?.fontScale ||
        'standard') as SystemSettings['fontScale'],
      loginTheme: (settings?.loginTheme ||
        branding?.theme?.loginTheme ||
        'clean_light') as SystemSettings['loginTheme'],
    });
  }, [settings, branding]);

  useEffect(() => {
    return () => {
      Object.values(stagedRef.current).forEach((item) => {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        <Shield className="w-8 h-8 text-[#485EA9] mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">
          System Administrator Access Required
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          System Branding &amp; Appearance management (logo, favicon, palette, and typography) is restricted to the System Administrator role.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-4 py-2 text-xs font-medium text-white bg-[#485EA9] rounded-lg"
        >
          Sign In as System Administrator
        </button>
      </div>
    );
  }

  function inspectImageFile(
    file: File,
    onLoaded: (url: string, dims: { w: number; h: number } | null) => void
  ) {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => onLoaded(objectUrl, { w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => onLoaded(objectUrl, null);
    img.src = objectUrl;
  }

  function handleSelectSlotFile(slot: BrandingAssetType, file: File) {
    setError(null);
    setSuccessMsg(null);
    setConfirmRemoveSlot(null);
    const prev = stagedBySlot[slot];
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
    inspectImageFile(file, (previewUrl, dims) => {
      setStagedBySlot((curr) => ({
        ...curr,
        [slot]: { file, previewUrl, dims },
      }));
    });
  }

  function clearStagedSlot(slot: BrandingAssetType) {
    const prev = stagedBySlot[slot];
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
    setStagedBySlot((curr) => {
      const next = { ...curr };
      delete next[slot];
      return next;
    });
  }

  async function handleSaveSlot(slot: BrandingAssetType) {
    const staged = stagedBySlot[slot];
    if (!staged) return;
    setBusyAction(`save_${slot}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.uploadBrandingAsset(slot, staged.file);
      onBrandingChanged(updated);
      clearStagedSlot(slot);
      const label = BRANDING_SLOTS.find((s) => s.key === slot)?.title || slot;
      setSuccessMsg(
        `${label} saved permanently to disk & database and synced across active sessions.`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmRemoveSlot(slot: BrandingAssetType) {
    setBusyAction(`remove_${slot}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.deleteBrandingAsset(slot);
      onBrandingChanged(updated);
      setConfirmRemoveSlot(null);
      const label = BRANDING_SLOTS.find((s) => s.key === slot)?.title || slot;
      setSuccessMsg(
        `${label} deactivated (previous file retained in server history for controlled recovery).`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestoreAsset(id: number) {
    setBusyAction(`restore_${id}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.restoreBrandingAsset(id);
      onBrandingChanged(updated);
      setSuccessMsg(`Branding asset #${id} restored as active.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveAppearanceSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('save_appearance');
    setError(null);
    setSuccessMsg(null);
    try {
      await api.updateSettings(appearanceForm);
      const refreshed = await api.getBranding();
      onBrandingChanged(refreshed);
      onAppearanceUpdated?.();
      setSuccessMsg('Institutional identity, color palette, and typography saved permanently.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExplicitBrandingReset(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('reset_branding');
    setError(null);
    setSuccessMsg(null);
    try {
      const reset = await api.resetAllBranding(resetConfirmText);
      onBrandingChanged(reset);
      onAppearanceUpdated?.();
      setResetConfirmText('');
      setSuccessMsg(
        'Branding & appearance settings explicitly reset to OHB defaults (archived asset files remain in history).'
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  const slotStatus = (slot: BrandingAssetType) => branding?.assets?.[slot];

  const effectivePreviewMainLogo =
    stagedBySlot.logo?.previewUrl ??
    slotStatus('logo')?.url ??
    branding?.logoUrl ??
    null;
  const effectivePreviewLoginLogo =
    stagedBySlot.login_logo?.previewUrl ??
    slotStatus('login_logo')?.url ??
    stagedBySlot.app_logo?.previewUrl ??
    slotStatus('app_logo')?.url ??
    effectivePreviewMainLogo;
  const effectivePreviewHeaderLogo =
    stagedBySlot.header_logo?.previewUrl ??
    slotStatus('header_logo')?.url ??
    stagedBySlot.app_logo?.previewUrl ??
    slotStatus('app_logo')?.url ??
    effectivePreviewMainLogo;
  const effectivePreviewSidebarLogo =
    stagedBySlot.app_logo?.previewUrl ??
    slotStatus('app_logo')?.url ??
    effectivePreviewHeaderLogo;
  const effectivePreviewCommandLogo =
    stagedBySlot.command_center_logo?.previewUrl ??
    slotStatus('command_center_logo')?.url ??
    effectivePreviewSidebarLogo;
  const effectivePreviewFooterLogo =
    stagedBySlot.footer_logo?.previewUrl ??
    slotStatus('footer_logo')?.url ??
    effectivePreviewSidebarLogo;
  const effectivePreviewFaviconSrc =
    stagedBySlot.favicon?.previewUrl ??
    slotStatus('favicon')?.url ??
    branding?.faviconUrl ??
    apiUrl('/api/branding/favicon');
  const effectivePreviewLoginBg =
    stagedBySlot.login_background?.previewUrl ??
    slotStatus('login_background')?.url ??
    null;

  const hasAnyStaged = Object.keys(stagedBySlot).length > 0;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}
      {successMsg ? (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* Section A: All 9 Persistent Branding & Visual Asset Slots */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              A. Permanent Logo, Favicon &amp; Institutional Visual Asset Storage
            </h2>
            <p className="text-xs text-slate-500">
              All uploaded files are written permanently to disk (<span className="font-mono">uploads/branding/</span>) with SHA-256 checksums and database metadata, surviving reloads, logouts, and server restarts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {BRANDING_SLOTS.map((slot) => {
            const currentSlot = slotStatus(slot.key);
            const activeMeta =
              currentSlot?.meta ??
              (slot.key === 'logo'
                ? branding?.logoMeta
                : slot.key === 'favicon'
                  ? branding?.faviconMeta
                  : null);
            const hasCustom =
              currentSlot?.hasCustom ??
              (slot.key === 'logo'
                ? Boolean(branding?.hasCustomLogo)
                : slot.key === 'favicon'
                  ? Boolean(branding?.hasCustomFavicon)
                  : false);
            const activeUrl =
              currentSlot?.url ??
              (slot.key === 'logo'
                ? branding?.logoUrl ?? null
                : slot.key === 'favicon'
                  ? branding?.faviconUrl ?? apiUrl('/api/branding/favicon')
                  : null);
            const staged = stagedBySlot[slot.key];
            const displayUrl = staged?.previewUrl ?? activeUrl;

            return (
              <div
                key={slot.key}
                className={`bg-white border rounded-lg p-4 space-y-3 ${
                  slot.featured ? 'border-[#485EA9]/30 shadow-xs' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {slot.key === 'favicon' ? (
                        <Globe className="w-4 h-4 text-[#3A99CF] shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-[#485EA9] shrink-0" />
                      )}
                      <h3 className="text-xs font-semibold text-slate-900 truncate">
                        {slot.title}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{slot.subtitle}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">{slot.maxHint}</p>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 ${
                      hasCustom
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {hasCustom ? 'Custom Active' : slot.key === 'logo' || slot.key === 'favicon' ? 'Default' : 'Fallback'}
                  </span>
                </div>

                {/* Preview Checkerboard */}
                <div className="border border-slate-200 rounded-lg p-3 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] flex items-center justify-center min-h-[88px]">
                  {slot.key === 'favicon' ? (
                    <div className="flex items-center gap-5">
                      <img src={displayUrl || apiUrl('/api/branding/favicon')} alt="16px" className="w-4 h-4 object-contain" />
                      <img src={displayUrl || apiUrl('/api/branding/favicon')} alt="32px" className="w-8 h-8 object-contain" />
                      <img src={displayUrl || apiUrl('/api/branding/favicon')} alt="48px" className="w-12 h-12 object-contain" />
                    </div>
                  ) : slot.key === 'logo' ? (
                    <BrandLogo
                      variant="login"
                      branding={branding}
                      overrideSrc={staged ? staged.previewUrl : activeUrl}
                    />
                  ) : displayUrl ? (
                    <img
                      src={displayUrl}
                      alt={slot.title}
                      className="max-h-16 max-w-full w-auto object-contain rounded"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Using Main / Application Logo fallback
                    </span>
                  )}
                </div>

                {staged ? (
                  <div className="p-2.5 rounded-lg bg-sky-50 border border-[#3A99CF]/40 text-[11px] space-y-0.5">
                    <div className="font-semibold text-[#485EA9] truncate">
                      Previewing Before Save: {staged.file.name}
                    </div>
                    <div className="text-slate-600 tabular-nums">
                      Size: {formatBytes(staged.file.size)}
                      {staged.dims ? ` · ${staged.dims.w} × ${staged.dims.h} px` : ''}
                    </div>
                  </div>
                ) : activeMeta ? (
                  <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-0.5">
                    <div className="font-medium text-slate-800 truncate">
                      Active: {activeMeta.originalFilename}
                    </div>
                    <div className="tabular-nums text-[10px] text-slate-500 flex flex-wrap gap-x-2">
                      <span>{activeMeta.mimeType}</span>
                      <span>· {formatBytes(activeMeta.fileSizeBytes)}</span>
                      {activeMeta.width && activeMeta.height ? (
                        <span>· {activeMeta.width}×{activeMeta.height}px</span>
                      ) : null}
                      {activeMeta.sha256Checksum ? (
                        <span className="font-mono">· sha256:{activeMeta.sha256Checksum.slice(0, 10)}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <input
                  ref={(el) => {
                    fileInputRefs.current[slot.key] = el;
                  }}
                  type="file"
                  accept={slot.accept}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSelectSlotFile(slot.key, f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {confirmRemoveSlot === slot.key ? (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11px] space-y-2">
                    <div className="font-medium text-red-800">
                      Deactivate active {slot.title}? (Archived file stays in history for recovery.)
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyAction === `remove_${slot.key}`}
                        onClick={() => handleConfirmRemoveSlot(slot.key)}
                        className="px-2.5 py-1 text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                      >
                        {busyAction === `remove_${slot.key}` ? 'Removing...' : 'Confirm Remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveSlot(null)}
                        className="px-2.5 py-1 text-[11px] text-slate-600 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[slot.key]?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#485EA9] text-[#485EA9] hover:bg-[#485EA9]/5 rounded-lg whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {hasCustom ? 'Replace' : 'Select File'}
                    </button>

                    {staged ? (
                      <>
                        <button
                          type="button"
                          disabled={busyAction === `save_${slot.key}`}
                          onClick={() => handleSaveSlot(slot.key)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-60 rounded-lg whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {busyAction === `save_${slot.key}` ? 'Saving...' : 'Save Permanently'}
                        </button>
                        <button
                          type="button"
                          onClick={() => clearStagedSlot(slot.key)}
                          className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}

                    {hasCustom && !staged ? (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveSlot(slot.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section B: Institutional Identity, Color Palette & Typography */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[#485EA9]" />
          <h2 className="text-sm font-semibold text-slate-900">
            B. Institutional Identity, Color Palette &amp; Typography
          </h2>
        </div>

        <form onSubmit={handleSaveAppearanceSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Application Name</label>
              <input
                type="text"
                value={appearanceForm.appName}
                onChange={(e) => setAppearanceForm({ ...appearanceForm, appName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Short Acronym</label>
              <input
                type="text"
                value={appearanceForm.appShortName}
                onChange={(e) =>
                  setAppearanceForm({ ...appearanceForm, appShortName: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Organization Name</label>
              <input
                type="text"
                value={appearanceForm.organizationName}
                onChange={(e) =>
                  setAppearanceForm({ ...appearanceForm, organizationName: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Application Tagline</label>
              <input
                type="text"
                value={appearanceForm.appTagline}
                onChange={(e) =>
                  setAppearanceForm({ ...appearanceForm, appTagline: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Login Portal Theme</label>
              <select
                value={appearanceForm.loginTheme}
                onChange={(e) =>
                  setAppearanceForm({
                    ...appearanceForm,
                    loginTheme: e.target.value as SystemSettings['loginTheme'],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="clean_light">Clean Institutional Light</option>
                <option value="institutional_gradient">OHB Gradient Accent</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block font-medium text-slate-700 mb-1">
                Global Footer Attribution Text
              </label>
              <input
                type="text"
                value={appearanceForm.footerText}
                onChange={(e) =>
                  setAppearanceForm({ ...appearanceForm, footerText: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
            {(
              [
                ['primaryColor', 'Primary Color'],
                ['secondaryColor', 'Secondary Color'],
                ['accentColor', 'Accent Color'],
                ['surfaceColor', 'Surface Background'],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="block font-medium text-slate-700 mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearanceForm[field]}
                    onChange={(e) =>
                      setAppearanceForm({ ...appearanceForm, [field]: e.target.value })
                    }
                    className="h-9 w-12 border border-slate-300 rounded cursor-pointer p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={appearanceForm[field]}
                    onChange={(e) =>
                      setAppearanceForm({ ...appearanceForm, [field]: e.target.value })
                    }
                    className="flex-1 px-2.5 py-2 border border-slate-300 rounded-lg font-mono text-xs uppercase"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Display Heading Font</label>
              <select
                value={appearanceForm.displayFont}
                onChange={(e) =>
                  setAppearanceForm({
                    ...appearanceForm,
                    displayFont: e.target.value as SystemSettings['displayFont'],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Body Text Font</label>
              <select
                value={appearanceForm.bodyFont}
                onChange={(e) =>
                  setAppearanceForm({
                    ...appearanceForm,
                    bodyFont: e.target.value as SystemSettings['bodyFont'],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Typography Scale</label>
              <select
                value={appearanceForm.fontScale}
                onChange={(e) =>
                  setAppearanceForm({
                    ...appearanceForm,
                    fontScale: e.target.value as SystemSettings['fontScale'],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="compact">Compact (15px base)</option>
                <option value="standard">Standard (16px base)</option>
                <option value="comfortable">Comfortable (17px base)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={appearanceForm.showFooterBranding}
                onChange={(e) =>
                  setAppearanceForm({
                    ...appearanceForm,
                    showFooterBranding: e.target.checked,
                  })
                }
              />
              Display footer institutional logo alongside footer attribution
            </label>

            <button
              type="submit"
              disabled={busyAction === 'save_appearance'}
              className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-60 text-white font-medium rounded-lg"
            >
              {busyAction === 'save_appearance'
                ? 'Saving Appearance...'
                : 'Save Identity, Colors & Typography'}
            </button>
          </div>
        </form>
      </div>

      {/* Section C: Live Multi-Surface Branding Preview */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#485EA9]" />
            <h2 className="text-sm font-semibold text-slate-900">
              C. Live Branding Preview (All Operational Surfaces)
            </h2>
          </div>
          {hasAnyStaged ? (
            <span className="text-[11px] font-medium text-[#3A99CF]">
              Showing Staged Unsaved Image Preview
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Showing Saved Server Assets &amp; Theme</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-xs">
          {/* 1. Browser Favicon */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              1. Browser Tab Favicon
            </div>
            <div className="bg-slate-200/80 rounded-t-lg pt-2 px-2">
              <div className="bg-white rounded-t-md px-3 py-1.5 inline-flex items-center gap-2 border border-b-0 border-slate-300 max-w-full">
                <img
                  src={effectivePreviewFaviconSrc}
                  alt="Preview browser tab favicon"
                  className="w-4 h-4 object-contain shrink-0"
                />
                <span className="text-[11px] font-medium text-slate-800 truncate">
                  {appearanceForm.appName}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Login Page Branding */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              2. Staff Login Page Branding
            </div>
            <div
              className="relative overflow-hidden border border-slate-200 rounded-md p-3 flex flex-col items-center text-center gap-1.5"
              style={{ backgroundColor: appearanceForm.surfaceColor }}
            >
              {effectivePreviewLoginBg ? (
                <img
                  src={effectivePreviewLoginBg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
                />
              ) : null}
              <div className="relative z-10 flex flex-col items-center gap-1">
                <BrandLogo
                  variant="preview"
                  branding={branding}
                  overrideSrc={effectivePreviewLoginLogo}
                />
                <div
                  className="text-xs font-bold"
                  style={{ color: appearanceForm.primaryColor }}
                >
                  {appearanceForm.appShortName} Staff Sign In
                </div>
                <div className="text-[10px] text-slate-600">
                  {appearanceForm.organizationName}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Application Header */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              3. Application Header
            </div>
            <div className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BrandLogo
                  variant="preview"
                  branding={branding}
                  overrideSrc={effectivePreviewHeaderLogo}
                />
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 truncate">
                    {appearanceForm.organizationName}
                  </div>
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {appearanceForm.appShortName} Command
                  </div>
                </div>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded text-white shrink-0"
                style={{ backgroundColor: appearanceForm.primaryColor }}
              >
                R1-NOV-2026
              </span>
            </div>
          </div>

          {/* 4. Navigation Sidebar */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              4. Navigation Sidebar
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-2.5 flex items-center gap-2.5">
              <BrandLogo
                variant="preview"
                branding={branding}
                overrideSrc={effectivePreviewSidebarLogo}
              />
              <div className="min-w-0">
                <div
                  className="text-xs font-bold truncate"
                  style={{ color: appearanceForm.primaryColor }}
                >
                  {appearanceForm.appShortName}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {appearanceForm.organizationName}
                </div>
              </div>
            </div>
          </div>

          {/* 5. Command Room Header */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              5. Command Room Header
            </div>
            <div className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center gap-2.5">
              <BrandLogo
                variant="preview"
                branding={branding}
                overrideSrc={effectivePreviewCommandLogo}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-bold truncate"
                    style={{ color: appearanceForm.primaryColor }}
                  >
                    {appearanceForm.appShortName} WALLBOARD
                  </span>
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: appearanceForm.secondaryColor }}
                  >
                    01/05
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {appearanceForm.organizationName}
                </div>
              </div>
            </div>
          </div>

          {/* 6. Institutional Footer */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              6. Institutional Footer
            </div>
            <div className="bg-white border border-slate-200 rounded-md px-3 py-2.5 flex items-center gap-2 min-w-0">
              {appearanceForm.showFooterBranding ? (
                <BrandLogo
                  variant="footer"
                  branding={branding}
                  overrideSrc={effectivePreviewFooterLogo}
                />
              ) : null}
              <span className="text-[10px] text-slate-600 truncate">
                {appearanceForm.footerText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section D: Retained Branding Asset History & Controlled Recovery */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            D. Retained Branding Assets &amp; Controlled Recovery ({branding?.history?.length ?? 0})
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">uploads/branding/</span>
        </div>

        {branding?.history && branding.history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Slot</th>
                  <th className="text-left font-medium px-3 py-2">Original Filename</th>
                  <th className="text-left font-medium px-3 py-2">Type / Size</th>
                  <th className="text-left font-medium px-3 py-2">Dimensions</th>
                  <th className="text-left font-medium px-3 py-2">Checksum</th>
                  <th className="text-left font-medium px-3 py-2">Uploaded By</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-right font-medium px-4 py-2">Recovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branding.history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono uppercase text-[11px] text-[#485EA9]">
                      {item.assetType}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{item.originalFilename}</td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">
                      {item.mimeType} · {formatBytes(item.fileSizeBytes)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 tabular-nums">
                      {item.width && item.height ? `${item.width}×${item.height}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                      {item.sha256Checksum ? item.sha256Checksum.slice(0, 12) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {item.uploadedByName}
                      <div className="text-[10px] font-mono text-slate-400">
                        {new Date(item.uploadedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {item.isActive ? (
                        <span className="text-emerald-700 font-semibold">Active</span>
                      ) : (
                        <span className="text-slate-500">Retained</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!item.isActive ? (
                        <button
                          type="button"
                          disabled={busyAction === `restore_${item.id}`}
                          onClick={() => handleRestoreAsset(item.id)}
                          className="inline-flex items-center gap-1 text-[#3A99CF] hover:underline font-medium"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      ) : (
                        <span className="text-slate-400">In Use</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-500">
            No custom branding assets uploaded yet. Default OHB institutional emblem and SVG favicon are currently active.
          </div>
        )}
      </div>

      {/* Section E: Guarded Branding & Appearance Reset */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <h3 className="text-sm font-semibold">
            E. Reset Branding &amp; Appearance to Institutional Defaults
          </h3>
        </div>
        <p className="text-xs text-amber-800">
          Deactivates all currently active custom logos, favicon, and color/font overrides back to OHB defaults. Retained files in history remain recoverable unless removed from disk. Type <span className="font-mono font-semibold">RESET BRANDING</span> to confirm.
        </p>
        <form onSubmit={handleExplicitBrandingReset} className="flex flex-wrap items-center gap-3 text-xs">
          <input
            type="text"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="Type RESET BRANDING"
            className="px-3 py-2 border border-amber-300 rounded-lg bg-white min-w-[240px] font-mono"
          />
          <button
            type="submit"
            disabled={busyAction === 'reset_branding' || resetConfirmText.trim() !== 'RESET BRANDING'}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-medium rounded-lg"
          >
            {busyAction === 'reset_branding'
              ? 'Resetting Branding...'
              : 'Reset Branding & Appearance'}
          </button>
        </form>
      </div>
    </div>
  );
};

export const UserManagementView: React.FC<{
  currentUser: UserAccount;
  authenticated: boolean;
  onRequireAuth: () => void;
}> = ({ currentUser, authenticated, onRequireAuth }) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'zone_officer' as UserRole,
    assignedZone: '',
    assignedWoreda: '',
  });

  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  const isAdmin = authenticated && currentUser.role === 'system_admin';

  async function loadAdminData() {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [u, l] = await Promise.all([api.getUsers(), api.getAuditLogs()]);
      setUsers(u);
      setLogs(l);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, [isAdmin]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSuccessMsg(null);
    try {
      await api.createUser(newUser);
      setNewUser({
        username: '',
        fullName: '',
        email: '',
        password: '',
        role: 'zone_officer',
        assignedZone: '',
        assignedWoreda: '',
      });
      loadAdminData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleUserActive(u: UserAccount) {
    try {
      setError(null);
      await api.updateUser(u.id, { isActive: !u.isActive });
      loadAdminData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleResetPasswordSubmit(u: UserAccount) {
    setError(null);
    setResetSuccessMsg(null);
    try {
      await api.updateUser(u.id, {
        newPassword: resetPassword,
        mustChangePassword: true,
      });
      setResetSuccessMsg(
        `Password reset for "${u.username}". User will be prompted to set a new password on next sign-in.`
      );
      setResetUserId(null);
      setResetPassword('');
      loadAdminData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        <Shield className="w-8 h-8 text-[#485EA9] mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">
          System Administrator Access Required
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          User accounts, role permissions, and security audit logs are restricted to the System Administrator role.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-4 py-2 text-xs font-medium text-white bg-[#485EA9] rounded-lg"
        >
          Sign In as System Administrator
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}
      {resetSuccessMsg ? (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{resetSuccessMsg}</span>
        </div>
      ) : null}

      {/* Create User Form */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-[#485EA9]" />
          <h2 className="text-sm font-semibold text-slate-900">
            Provision New OHB Monitoring Account
          </h2>
        </div>

        <form
          onSubmit={handleCreateUser}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs"
        >
          <input
            type="text"
            required
            placeholder="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            required
            placeholder="Full Name"
            value={newUser.fullName}
            onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="email"
            required
            placeholder="Official Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="password"
            required
            placeholder={
              newUser.role === 'command_room_viewer'
                ? 'Initial Password (min 10 chars, letters + numbers/symbols)'
                : 'Initial Password'
            }
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <select
            value={newUser.role}
            onChange={(e) =>
              setNewUser({ ...newUser, role: e.target.value as UserRole })
            }
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            {Object.entries(ROLE_LABELS).map(([k, lbl]) => (
              <option key={k} value={k}>
                {lbl}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Assigned Zone (Optional)"
            value={newUser.assignedZone}
            onChange={(e) =>
              setNewUser({ ...newUser, assignedZone: e.target.value })
            }
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Assigned Woreda (Optional)"
            value={newUser.assignedWoreda}
            onChange={(e) =>
              setNewUser({ ...newUser, assignedWoreda: e.target.value })
            }
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] text-white font-medium rounded-lg"
          >
            Create Account
          </button>
        </form>
        {newUser.role === 'command_room_viewer' ? (
          <p className="mt-2.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
            Command Room Viewer accounts have zero administrative, upload, export, or alert-management permissions and require a strong initial password (at least 10 characters with letters and numbers or symbols).
          </p>
        ) : null}
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-900">
            Authorized Accounts ({users.length})
          </h3>
          {loading ? <span className="text-xs text-slate-500">Loading...</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Username</th>
                <th className="text-left font-medium px-3 py-2.5">Full Name</th>
                <th className="text-left font-medium px-3 py-2.5">Role</th>
                <th className="text-left font-medium px-3 py-2.5">Scope</th>
                <th className="text-left font-medium px-3 py-2.5">Last Login</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-right font-medium px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <React.Fragment key={u.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-900">
                      {u.username}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {u.fullName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {ROLE_LABELS[u.role]}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {[u.assignedZone, u.assignedWoreda].filter(Boolean).join(' / ') ||
                        'Oromia Region'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          u.isActive
                            ? 'text-emerald-700 font-medium'
                            : 'text-slate-400'
                        }
                      >
                        {u.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {u.id !== currentUser.id ? (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId(resetUserId === u.id ? null : u.id);
                              setResetPassword('');
                            }}
                            className="inline-flex items-center gap-1 text-[#485EA9] hover:underline font-medium"
                          >
                            <KeyRound className="w-3 h-3" />
                            Reset Password
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleUserActive(u)}
                            className="text-[#3A99CF] hover:underline font-medium"
                          >
                            {u.isActive ? 'Suspend' : 'Activate'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">Current</span>
                      )}
                    </td>
                  </tr>
                  {resetUserId === u.id ? (
                    <tr className="bg-slate-50/80">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            New password for <span className="font-mono">{u.username}</span>:
                          </span>
                          <input
                            type="password"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder={
                              u.role === 'command_room_viewer'
                                ? 'Min 10 chars, letters + numbers/symbols'
                                : 'Enter new password'
                            }
                            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white min-w-[260px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleResetPasswordSubmit(u)}
                            disabled={!resetPassword}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-50 rounded-md"
                          >
                            Confirm Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId(null);
                              setResetPassword('');
                            }}
                            className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Security &amp; Data Audit Trail ({logs.length} recent events)
          </h3>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2">Timestamp</th>
                <th className="text-left font-medium px-3 py-2">Actor</th>
                <th className="text-left font-medium px-3 py-2">Action</th>
                <th className="text-left font-medium px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-slate-800 whitespace-nowrap">
                    {l.username} ({l.userRole})
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[#485EA9] whitespace-nowrap">
                    {l.action}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

type SettingsSubTab =
  | 'general'
  | 'dashboard'
  | 'navigation'
  | 'command_room'
  | 'branding'
  | 'backups';

export const SystemSettingsView: React.FC<{
  settings: SystemSettings;
  campaigns: Campaign[];
  branding: BrandingConfig | null;
  initialTab?: 'general' | 'branding';
  currentUser: UserAccount;
  authenticated: boolean;
  onRequireAuth: () => void;
  onUpdated: () => void;
  onBrandingChanged: (next: BrandingConfig) => void;
}> = ({
  settings,
  campaigns,
  branding,
  initialTab = 'general',
  currentUser,
  authenticated,
  onRequireAuth,
  onUpdated,
  onBrandingChanged,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialTab);
  const [form, setForm] = useState<SystemSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newCamp, setNewCamp] = useState({
    name: '',
    roundCode: '',
    vaccines: 'nOPV2 & bOPV2',
    startDate: '2026-12-01',
    endDate: '2026-12-04',
    expectedDays: 4,
  });

  // Backups & Safe Reset State
  const [backups, setBackups] = useState<BackupArchiveInfo[]>([]);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    filename: string;
    scope: 'full' | 'branding_and_settings';
  } | null>(null);
  const [uploadBackupFile, setUploadBackupFile] = useState<File | null>(null);
  const [uploadRestoreScope, setUploadRestoreScope] = useState<'full' | 'branding_and_settings'>('full');
  const [opResetConfirm, setOpResetConfirm] = useState('');
  const [clearVaultOnReset, setClearVaultOnReset] = useState(false);

  const isAdmin = authenticated && currentUser.role === 'system_admin';

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function refreshBackups() {
    if (!isAdmin) return;
    try {
      const list = await api.listBackups();
      setBackups(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (isAdmin && activeSubTab === 'backups') {
      refreshBackups();
    }
  }, [isAdmin, activeSubTab]);

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        <Shield className="w-8 h-8 text-[#485EA9] mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">
          System Administrator Access Required
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          System Settings, Branding &amp; Appearance, Navigation Controls, Backups, and Command Room configuration are strictly restricted to the System Administrator role.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-4 py-2 text-xs font-medium text-white bg-[#485EA9] rounded-lg"
        >
          Sign In as System Administrator
        </button>
      </div>
    );
  }

  async function saveAllSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const saved = await api.updateSettings(form);
      setForm(saved);
      setSavedMsg('System settings persisted to database and broadcast to active dashboards.');
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createCampaign(newCamp);
      setNewCamp({
        name: '',
        roundCode: '',
        vaccines: 'nOPV2 & bOPV2',
        startDate: '2026-12-01',
        endDate: '2026-12-04',
        expectedDays: 4,
      });
      setSavedMsg('Campaign round created.');
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateBackup() {
    setBackupBusy('create');
    setError(null);
    setSavedMsg(null);
    try {
      const created = await api.createBackup();
      setSavedMsg(
        `Backup archive created: ${created.filename} (${formatBytes(created.fileSizeBytes)}, ${created.counts.brandingFiles} branding files, ${created.counts.settings} settings).`
      );
      await refreshBackups();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleDownloadBackup(filename: string) {
    setBackupBusy(`download_${filename}`);
    setError(null);
    try {
      const token = localStorage.getItem('opcms_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(api.backupDownloadUrl(filename), {
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to download backup (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRestoreServerBackup(
    filename: string,
    restoreScope: 'full' | 'branding_and_settings'
  ) {
    setBackupBusy(`restore_${filename}`);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await api.restoreBackup({ serverFilename: filename, restoreScope });
      setPendingRestore(null);
      setForm(res.settings);
      onBrandingChanged(res.branding);
      onUpdated();
      setSavedMsg(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRestoreUploadedBackup(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadBackupFile) return;
    setBackupBusy('restore_upload');
    setError(null);
    setSavedMsg(null);
    try {
      const res = await api.restoreBackup({
        file: uploadBackupFile,
        restoreScope: uploadRestoreScope,
      });
      setUploadBackupFile(null);
      setForm(res.settings);
      onBrandingChanged(res.branding);
      onUpdated();
      setSavedMsg(res.message);
      await refreshBackups();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleOperationalReset(e: React.FormEvent) {
    e.preventDefault();
    setBackupBusy('op_reset');
    setError(null);
    setSavedMsg(null);
    try {
      const res = await api.resetOperationalData(opResetConfirm, clearVaultOnReset);
      setOpResetConfirm('');
      onUpdated();
      setSavedMsg(
        `Operational campaign data cleared (${res.deletedReports} reports, ${res.deletedAlerts} alerts, ${res.deletedBatches} import batches). Uploaded branding logos and all system settings were strictly preserved.`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBackupBusy(null);
    }
  }

  const tabs: Array<{ id: SettingsSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'General & Language', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'dashboard', label: 'Dashboard & UI', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'navigation', label: 'Navigation & Modules', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: 'command_room', label: 'Command Room & Live', icon: <Tv className="w-3.5 h-3.5" /> },
    { id: 'branding', label: 'Branding & Appearance', icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'backups', label: 'Backup, Restore & Reset', icon: <HardDriveDownload className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* System Settings Sub-Navigation */}
      <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex flex-wrap items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveSubTab(tab.id);
              setError(null);
              setSavedMsg(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-[#485EA9] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}
      {savedMsg ? (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      ) : null}

      {activeSubTab === 'branding' ? (
        <BrandingSettingsPanel
          branding={branding}
          settings={settings}
          currentUser={currentUser}
          authenticated={authenticated}
          onRequireAuth={onRequireAuth}
          onBrandingChanged={onBrandingChanged}
          onAppearanceUpdated={onUpdated}
        />
      ) : null}

      {activeSubTab === 'general' ? (
        <>
          <form onSubmit={saveAllSettings} className="space-y-5 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                General Application &amp; Regional Preferences
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Application Name</label>
                  <input
                    type="text"
                    value={form.appName}
                    onChange={(e) => setForm({ ...form, appName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Short Acronym</label>
                  <input
                    type="text"
                    value={form.appShortName}
                    onChange={(e) => setForm({ ...form, appShortName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Organization Name</label>
                  <input
                    type="text"
                    value={form.organizationName}
                    onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">System Tagline</label>
                  <input
                    type="text"
                    value={form.appTagline}
                    onChange={(e) => setForm({ ...form, appTagline: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Support / EOC Contact</label>
                  <input
                    type="text"
                    value={form.supportContact}
                    onChange={(e) => setForm({ ...form, supportContact: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-medium text-slate-700 mb-1">Footer Text</label>
                  <input
                    type="text"
                    value={form.footerText}
                    onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Time Zone</label>
                  <input
                    type="text"
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Date Format</label>
                  <select
                    value={form.dateFormat}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dateFormat: e.target.value as SystemSettings['dateFormat'],
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MMM DD, YYYY">MMM DD, YYYY</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Default Language</label>
                  <select
                    value={form.defaultLanguage}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultLanguage: e.target.value as SystemSettings['defaultLanguage'],
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="en">English (en)</option>
                    <option value="om">Afaan Oromoo (om)</option>
                    <option value="am">Amharic (am)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Max Upload Size (MB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={250}
                    value={form.maxUploadSizeMb}
                    onChange={(e) =>
                      setForm({ ...form, maxUploadSizeMb: Number(e.target.value) || 50 })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Preview Link TTL (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={form.previewLinkTtlHours}
                    onChange={(e) =>
                      setForm({ ...form, previewLinkTtlHours: Number(e.target.value) || 144 })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-col justify-center gap-2 pt-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(form.allowUserLanguageSwitch)}
                      onChange={(e) =>
                        setForm({ ...form, allowUserLanguageSwitch: e.target.checked })
                      }
                    />
                    Allow users to switch display language
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(form.requireImportConfirmation)}
                      onChange={(e) =>
                        setForm({ ...form, requireImportConfirmation: e.target.checked })
                      }
                    />
                    Require staged validation confirmation before committing campaign imports
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(form.retainArchivedBrandingAssets)}
                      onChange={(e) =>
                        setForm({ ...form, retainArchivedBrandingAssets: e.target.checked })
                      }
                    />
                    Retain replaced branding logos &amp; files on server for recovery
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(form.guestPublicOverviewEnabled)}
                      onChange={(e) =>
                        setForm({ ...form, guestPublicOverviewEnabled: e.target.checked })
                      }
                    />
                    Allow unauthenticated visitors to view high-level Public Regional Overview on Sign-In portal
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] text-white font-medium rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save General & Upload Settings'}
                </button>
              </div>
            </div>
          </form>

          {/* Campaign Rounds */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Configured SIA Campaign Rounds ({campaigns.length})
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {campaigns.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-slate-500">
                      {c.roundCode} · {c.vaccines} · {c.startDate} to {c.endDate} ({c.expectedDays} days)
                    </div>
                  </div>
                  <span className="font-mono text-emerald-700 uppercase">{c.status}</span>
                </div>
              ))}
            </div>

            <form
              onSubmit={createCampaign}
              className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3 border-t border-slate-200 text-xs"
            >
              <input
                type="text"
                required
                placeholder="Campaign Round Name"
                value={newCamp.name}
                onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
                className="sm:col-span-2 px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="Round Code (e.g. R2-DEC-2026)"
                value={newCamp.roundCode}
                onChange={(e) => setNewCamp({ ...newCamp, roundCode: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="date"
                required
                value={newCamp.startDate}
                onChange={(e) => setNewCamp({ ...newCamp, startDate: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="date"
                required
                value={newCamp.endDate}
                onChange={(e) => setNewCamp({ ...newCamp, endDate: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-[#3A99CF] hover:bg-[#2f86b8] text-white font-medium rounded-lg"
              >
                Add Campaign Round
              </button>
            </form>
          </div>
        </>
      ) : null}

      {activeSubTab === 'dashboard' ? (
        <form onSubmit={saveAllSettings} className="space-y-5 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Surveillance Thresholds, Dashboard Defaults &amp; UI Preferences
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Coverage Target Threshold (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.coverageTargetPct}
                  onChange={(e) =>
                    setForm({ ...form, coverageTargetPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Critical Coverage Alert Below (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.coverageCriticalPct}
                  onChange={(e) =>
                    setForm({ ...form, coverageCriticalPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Unusual Vaccine Wastage Threshold (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.maxWastagePct}
                  onChange={(e) =>
                    setForm({ ...form, maxWastagePct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Over-Target Anomaly Flag Above (%)
                </label>
                <input
                  type="number"
                  step="1"
                  value={form.overTargetAlertPct}
                  onChange={(e) =>
                    setForm({ ...form, overTargetAlertPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Daily Target Deviation Alert (±%)
                </label>
                <input
                  type="number"
                  step="1"
                  value={form.dailyDeviationPct}
                  onChange={(e) =>
                    setForm({ ...form, dailyDeviationPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Expected Woredas Override (Blank = Dynamic)
                </label>
                <input
                  type="number"
                  placeholder="Dynamic (275)"
                  value={form.expectedWoredasOverride ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      expectedWoredasOverride: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Default Campaign Round
                </label>
                <select
                  value={form.defaultCampaignId ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultCampaignId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Auto (First Active Round)</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.roundCode} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Default Landing Page
                </label>
                <select
                  value={form.defaultLandingPage}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultLandingPage: e.target.value as SystemSettings['defaultLandingPage'],
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="live_command_center">Live Command Center</option>
                  <option value="command_center">Command Center</option>
                  <option value="campaign_overview">Campaign Overview</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Dashboard Auto-Refresh (Seconds)
                </label>
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={form.dashboardAutoRefreshSec}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dashboardAutoRefreshSec: Number(e.target.value) || 30,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">UI Density</label>
                <select
                  value={form.uiDensity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      uiDensity: e.target.value as SystemSettings['uiDensity'],
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="comfortable">Comfortable Spacing</option>
                  <option value="compact">Compact Operational Grid</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Table Rows Per Page</label>
                <select
                  value={form.tableRowsPerPage}
                  onChange={(e) =>
                    setForm({ ...form, tableRowsPerPage: Number(e.target.value) || 25 })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value={15}>15 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                </select>
              </div>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-5 pt-4">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.showDataQualityBanner)}
                    onChange={(e) =>
                      setForm({ ...form, showDataQualityBanner: e.target.checked })
                    }
                  />
                  Show Data Quality Banner
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.showAnimations)}
                    onChange={(e) =>
                      setForm({ ...form, showAnimations: e.target.checked })
                    }
                  />
                  Enable UI Transitions
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.highContrastMode)}
                    onChange={(e) =>
                      setForm({ ...form, highContrastMode: e.target.checked })
                    }
                  />
                  High-Contrast Command Mode
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] text-white font-medium rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Dashboard & UI Preferences'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {activeSubTab === 'navigation' ? (
        <form onSubmit={saveAllSettings} className="space-y-5 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Navigation Sidebar &amp; Role-Aware Module Visibility
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enable or hide operational and analytics modules from the navigation sidebar across all roles. Core administration modules (User Management, System Settings, Branding &amp; Appearance) remain locked active for System Administrators.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {TOGGLEABLE_MODULES.map((mod) => {
                const isDisabled = form.disabledModules.includes(mod.key);
                const enabled = !isDisabled;
                return (
                  <label
                    key={mod.key}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 border rounded-lg cursor-pointer ${
                      enabled
                        ? 'border-emerald-200 bg-emerald-50/40 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => {
                          const nextDisabled = enabled
                            ? Array.from(new Set([...form.disabledModules, mod.key]))
                            : form.disabledModules.filter((k) => k !== mod.key);
                          setForm({ ...form, disabledModules: nextDisabled });
                        }}
                      />
                      <span className="font-medium truncate">{mod.label}</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase text-slate-400">
                      {mod.group}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.sidebarCollapsedDefault)}
                  onChange={(e) =>
                    setForm({ ...form, sidebarCollapsedDefault: e.target.checked })
                  }
                />
                Start desktop sessions with compact collapsed navigation rail
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.showFooterBranding)}
                  onChange={(e) =>
                    setForm({ ...form, showFooterBranding: e.target.checked })
                  }
                />
                Show institutional logo in application footer
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] text-white font-medium rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Navigation & Module Settings'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {activeSubTab === 'command_room' ? (
        <form onSubmit={saveAllSettings} className="space-y-5 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#3A99CF]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Live Command Center &amp; Command Room Configuration
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500">/command-room</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block font-medium text-slate-700 mb-1">
                  Command Room Display Title
                </label>
                <input
                  type="text"
                  value={form.commandRoomDisplayTitle}
                  onChange={(e) =>
                    setForm({ ...form, commandRoomDisplayTitle: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Screen Rotation Interval (Seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={form.commandRoomIntervalSec}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      commandRoomIntervalSec: Math.min(
                        120,
                        Math.max(5, Number(e.target.value) || 15)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Background Data Refresh Interval (Seconds)
                </label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={form.commandRoomDataRefreshSec}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      commandRoomDataRefreshSec: Math.min(
                        300,
                        Math.max(10, Number(e.target.value) || 30)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Default Startup Screen
                </label>
                <select
                  value={form.commandRoomDefaultScreen}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      commandRoomDefaultScreen: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {COMMAND_ROOM_SCREEN_LABELS.map((scr) => (
                    <option key={scr.id} value={scr.id}>
                      {scr.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="font-medium text-slate-700 mb-2">
                Enabled Rotating Screens (Select at least one)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {COMMAND_ROOM_SCREEN_LABELS.map((scr) => {
                  const checked = form.commandRoomEnabledScreens.includes(scr.id);
                  return (
                    <label
                      key={scr.id}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer select-none ${
                        checked
                          ? 'border-[#3A99CF] bg-sky-50/50 text-slate-900'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? form.commandRoomEnabledScreens.filter((id) => id !== scr.id)
                            : [...form.commandRoomEnabledScreens, scr.id].sort((a, b) => a - b);
                          if (next.length === 0) return;
                          setForm({ ...form, commandRoomEnabledScreens: next });
                        }}
                      />
                      <span className="truncate font-medium">{scr.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={form.commandRoomAutoRotate}
                  onChange={(e) =>
                    setForm({ ...form, commandRoomAutoRotate: e.target.checked })
                  }
                />
                Enable automatic screen rotation (every {form.commandRoomIntervalSec}s)
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={form.commandRoomFullscreenStartup}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      commandRoomFullscreenStartup: e.target.checked,
                    })
                  }
                />
                Prompt Full-Screen Mode on wallboard startup
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.liveCommandAutoRefresh)}
                  onChange={(e) =>
                    setForm({ ...form, liveCommandAutoRefresh: e.target.checked })
                  }
                />
                Live Command Center automatic SSE/interval refresh
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.liveCommandShowTicker)}
                  onChange={(e) =>
                    setForm({ ...form, liveCommandShowTicker: e.target.checked })
                  }
                />
                Show live surveillance &amp; alert ticker
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#3A99CF] hover:bg-[#2f86b8] text-white font-medium rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Command Center & Room Settings'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {activeSubTab === 'backups' ? (
        <div className="space-y-6 text-xs">
          {/* Server Backup Creation & Archive Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Portable Application Backups (.zip — Settings, Branding Files &amp; Campaign Data)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every snapshot bundles database tables, uploaded branding files, document vault files, and SHA-256 verification checksums.
                </p>
              </div>
              <button
                type="button"
                disabled={backupBusy === 'create'}
                onClick={handleCreateBackup}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-60 text-white font-medium rounded-lg whitespace-nowrap"
              >
                <HardDriveDownload className="w-3.5 h-3.5" />
                {backupBusy === 'create' ? 'Creating Backup...' : 'Create Full Backup Snapshot'}
              </button>
            </div>

            {pendingRestore ? (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
                <span className="text-amber-900 font-medium">
                  Confirm restoring <span className="font-mono">{pendingRestore.filename}</span> (
                  {pendingRestore.scope === 'full' ? 'Full System Data + Branding + Settings' : 'Branding Assets & Settings Only'})?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={backupBusy === `restore_${pendingRestore.filename}`}
                    onClick={() =>
                      handleRestoreServerBackup(pendingRestore.filename, pendingRestore.scope)
                    }
                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded"
                  >
                    {backupBusy === `restore_${pendingRestore.filename}`
                      ? 'Restoring...'
                      : 'Confirm Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRestore(null)}
                    className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {backups.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Archive Filename</th>
                      <th className="text-left font-medium px-3 py-2">Created</th>
                      <th className="text-left font-medium px-3 py-2">Contents</th>
                      <th className="text-left font-medium px-3 py-2">Size / SHA-256</th>
                      <th className="text-right font-medium px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map((b) => (
                      <tr key={b.filename} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-900">
                          {b.filename}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          <div>{new Date(b.createdAt).toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400">
                            {b.createdByName} · {b.sourceEngine}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                          {b.counts.settings} settings · {b.counts.brandingFiles} branding files ·{' '}
                          {b.counts.dailyReports} reports
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                          {formatBytes(b.fileSizeBytes)} · {b.sha256Checksum.slice(0, 10)}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            disabled={backupBusy === `download_${b.filename}`}
                            onClick={() => handleDownloadBackup(b.filename)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-100"
                          >
                            <Download className="w-3 h-3" />
                            Download .zip
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingRestore({
                                filename: b.filename,
                                scope: 'branding_and_settings',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#3A99CF] text-[#3A99CF] hover:bg-sky-50 rounded"
                          >
                            <ArchiveRestore className="w-3 h-3" />
                            Restore Branding
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingRestore({ filename: b.filename, scope: 'full' })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#485EA9] text-white hover:bg-[#3a4d8f] rounded"
                          >
                            Restore Full
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500">
                No server backup snapshots saved yet. Click &ldquo;Create Full Backup Snapshot&rdquo; above to archive current settings, uploaded branding assets, and operational data.
              </div>
            )}
          </div>

          {/* Restore from Uploaded .zip */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Restore from Exported Backup Archive (.zip)
            </h3>
            <form
              onSubmit={handleRestoreUploadedBackup}
              className="flex flex-wrap items-center gap-3"
            >
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setUploadBackupFile(e.target.files?.[0] || null)}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:text-slate-700"
              />
              <select
                value={uploadRestoreScope}
                onChange={(e) =>
                  setUploadRestoreScope(
                    e.target.value === 'branding_and_settings' ? 'branding_and_settings' : 'full'
                  )
                }
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="full">Full System Restore (Data + Branding + Settings)</option>
                <option value="branding_and_settings">
                  Branding Logos &amp; System Settings Only
                </option>
              </select>
              <button
                type="submit"
                disabled={!uploadBackupFile || backupBusy === 'restore_upload'}
                className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-50 text-white font-medium rounded-lg"
              >
                {backupBusy === 'restore_upload' ? 'Restoring Archive...' : 'Upload & Restore'}
              </button>
            </form>
          </div>

          {/* Safe Operational Data Reset */}
          <div className="bg-rose-50/60 border border-rose-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-900">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <h3 className="text-sm font-semibold">
                Safe Operational Data Reset (Preserves Branding Logos &amp; System Settings)
              </h3>
            </div>
            <p className="text-xs text-rose-800 leading-relaxed">
              Clears imported daily campaign reports, import batches, and surveillance alert records while{' '}
              <strong>strictly preserving</strong> all uploaded OHB logos, branding history files, appearance settings, user accounts, and campaign definitions. Type{' '}
              <span className="font-mono font-semibold">RESET OPERATIONAL DATA</span> to execute.
            </p>
            <label className="inline-flex items-center gap-2 cursor-pointer text-rose-900 font-medium">
              <input
                type="checkbox"
                checked={clearVaultOnReset}
                onChange={(e) => setClearVaultOnReset(e.target.checked)}
              />
              Also clear non-branding operational files from Document Vault
            </label>
            <form onSubmit={handleOperationalReset} className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={opResetConfirm}
                onChange={(e) => setOpResetConfirm(e.target.value)}
                placeholder="Type RESET OPERATIONAL DATA"
                className="px-3 py-2 border border-rose-300 rounded-lg bg-white min-w-[260px] font-mono"
              />
              <button
                type="submit"
                disabled={
                  backupBusy === 'op_reset' || opResetConfirm.trim() !== 'RESET OPERATIONAL DATA'
                }
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-medium rounded-lg"
              >
                {backupBusy === 'op_reset'
                  ? 'Clearing Operational Data...'
                  : 'Reset Operational Data Only'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
