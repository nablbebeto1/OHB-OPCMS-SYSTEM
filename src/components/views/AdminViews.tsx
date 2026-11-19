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
} from 'lucide-react';
import { api } from '../../api/client';
import { BrandLogo } from '../BrandLogo';
import type {
  AuditLogEntry,
  BrandingConfig,
  Campaign,
  SystemSettings,
  UserAccount,
  UserRole,
} from '../../types/opcms';

const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: 'System Administrator',
  central_command: 'Central Command Center',
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BrandingSettingsPanel: React.FC<{
  branding: BrandingConfig | null;
  currentUser: UserAccount;
  authenticated: boolean;
  onRequireAuth: () => void;
  onBrandingChanged: (next: BrandingConfig) => void;
}> = ({ branding, currentUser, authenticated, onRequireAuth, onBrandingChanged }) => {
  const isAdmin = authenticated && currentUser.role === 'system_admin';

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  const [stagedLogoFile, setStagedLogoFile] = useState<File | null>(null);
  const [stagedLogoUrl, setStagedLogoUrl] = useState<string | null>(null);
  const [stagedLogoDims, setStagedLogoDims] = useState<{ w: number; h: number } | null>(null);

  const [stagedFaviconFile, setStagedFaviconFile] = useState<File | null>(null);
  const [stagedFaviconUrl, setStagedFaviconUrl] = useState<string | null>(null);
  const [stagedFaviconDims, setStagedFaviconDims] = useState<{ w: number; h: number } | null>(
    null
  );

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (stagedLogoUrl) URL.revokeObjectURL(stagedLogoUrl);
    };
  }, [stagedLogoUrl]);

  useEffect(() => {
    return () => {
      if (stagedFaviconUrl) URL.revokeObjectURL(stagedFaviconUrl);
    };
  }, [stagedFaviconUrl]);

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        <Shield className="w-8 h-8 text-[#485EA9] mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">
          System Administrator Access Required
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          System Branding &amp; Appearance management (logo and favicon uploads) is restricted to the System Administrator role.
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
    img.onload = () => {
      onLoaded(objectUrl, { w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      onLoaded(objectUrl, null);
    };
    img.src = objectUrl;
  }

  function handleSelectLogo(file: File) {
    setError(null);
    setSuccessMsg(null);
    if (stagedLogoUrl) URL.revokeObjectURL(stagedLogoUrl);
    setStagedLogoFile(file);
    inspectImageFile(file, (url, dims) => {
      setStagedLogoUrl(url);
      setStagedLogoDims(dims);
    });
  }

  function handleSelectFavicon(file: File) {
    setError(null);
    setSuccessMsg(null);
    if (stagedFaviconUrl) URL.revokeObjectURL(stagedFaviconUrl);
    setStagedFaviconFile(file);
    inspectImageFile(file, (url, dims) => {
      setStagedFaviconUrl(url);
      setStagedFaviconDims(dims);
    });
  }

  async function handleSaveLogo() {
    if (!stagedLogoFile) return;
    setBusyAction('save_logo');
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.uploadBrandingAsset('logo', stagedLogoFile);
      onBrandingChanged(updated);
      if (stagedLogoUrl) URL.revokeObjectURL(stagedLogoUrl);
      setStagedLogoFile(null);
      setStagedLogoUrl(null);
      setStagedLogoDims(null);
      setSuccessMsg('System logo saved to server storage and pushed to active sessions.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveLogo() {
    setBusyAction('remove_logo');
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.deleteBrandingAsset('logo');
      onBrandingChanged(updated);
      setSuccessMsg('Active system logo removed. Default OHB emblem restored.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveFavicon() {
    if (!stagedFaviconFile) return;
    setBusyAction('save_favicon');
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.uploadBrandingAsset('favicon', stagedFaviconFile);
      onBrandingChanged(updated);
      if (stagedFaviconUrl) URL.revokeObjectURL(stagedFaviconUrl);
      setStagedFaviconFile(null);
      setStagedFaviconUrl(null);
      setStagedFaviconDims(null);
      setSuccessMsg('Browser favicon saved and active tab icon refreshed.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveFavicon() {
    setBusyAction('remove_favicon');
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.deleteBrandingAsset('favicon');
      onBrandingChanged(updated);
      setSuccessMsg('Custom favicon removed. Default OHB SVG favicon restored.');
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

  const effectivePreviewLogoSrc = stagedLogoUrl ?? branding?.logoUrl ?? null;
  const effectivePreviewFaviconSrc =
    stagedFaviconUrl ?? branding?.faviconUrl ?? '/api/branding/favicon';

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

      {/* Uploaders Grid: System Logo + Browser Favicon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Logo Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#485EA9]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  A. System Logo
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                PNG (transparent supported), JPG, JPEG, SVG, or WebP · Max 5 MB · Aspect ratio preserved
              </p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {branding?.hasCustomLogo ? 'Custom Active' : 'Default Emblem'}
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] flex items-center justify-center min-h-[112px]">
            <BrandLogo
              variant="login"
              branding={branding}
              overrideSrc={stagedLogoUrl !== null ? stagedLogoUrl : undefined}
            />
          </div>

          {stagedLogoFile ? (
            <div className="p-3 rounded-lg bg-sky-50 border border-[#3A99CF]/40 text-xs space-y-1">
              <div className="font-semibold text-[#485EA9]">
                Previewing Before Save: {stagedLogoFile.name}
              </div>
              <div className="text-slate-600 tabular-nums">
                Size: {formatBytes(stagedLogoFile.size)}
                {stagedLogoDims ? ` · Dimensions: ${stagedLogoDims.w} × ${stagedLogoDims.h} px` : ''}
              </div>
            </div>
          ) : branding?.logoMeta ? (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-0.5">
              <div className="font-medium text-slate-800 truncate">
                Active File: {branding.logoMeta.originalFilename}
              </div>
              <div className="tabular-nums text-[11px] text-slate-500">
                {branding.logoMeta.mimeType} · {formatBytes(branding.logoMeta.fileSizeBytes)}
                {branding.logoMeta.width && branding.logoMeta.height
                  ? ` · ${branding.logoMeta.width} × ${branding.logoMeta.height} px`
                  : ''}
                {' · '}Uploaded by {branding.logoMeta.uploadedByName}
              </div>
            </div>
          ) : null}

          <input
            ref={logoInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,.webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSelectLogo(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#485EA9] text-[#485EA9] hover:bg-[#485EA9]/5 rounded-lg whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              {branding?.hasCustomLogo ? 'Choose Replacement Logo' : 'Select Logo File'}
            </button>

            {stagedLogoFile ? (
              <>
                <button
                  type="button"
                  disabled={busyAction === 'save_logo'}
                  onClick={handleSaveLogo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-60 rounded-lg whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {busyAction === 'save_logo' ? 'Saving Logo...' : 'Save Logo'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (stagedLogoUrl) URL.revokeObjectURL(stagedLogoUrl);
                    setStagedLogoFile(null);
                    setStagedLogoUrl(null);
                    setStagedLogoDims(null);
                  }}
                  className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </>
            ) : null}

            {branding?.hasCustomLogo && !stagedLogoFile ? (
              <button
                type="button"
                disabled={busyAction === 'remove_logo'}
                onClick={handleRemoveLogo}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {busyAction === 'remove_logo' ? 'Removing...' : 'Remove Logo'}
              </button>
            ) : null}
          </div>
        </div>

        {/* Browser Favicon Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#3A99CF]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  B. Browser Tab Favicon
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                ICO, PNG, or SVG · Max 2 MB · Updates browser tab icon live &amp; across refreshes
              </p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {branding?.hasCustomFavicon ? 'Custom Active' : 'Default OHB SVG'}
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] flex items-center justify-center gap-6 min-h-[112px]">
            <div className="flex flex-col items-center gap-1.5">
              <img
                src={effectivePreviewFaviconSrc}
                alt="16px tab icon preview"
                className="w-4 h-4 object-contain"
              />
              <span className="text-[10px] font-mono text-slate-500">16×16</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <img
                src={effectivePreviewFaviconSrc}
                alt="32px tab icon preview"
                className="w-8 h-8 object-contain"
              />
              <span className="text-[10px] font-mono text-slate-500">32×32</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <img
                src={effectivePreviewFaviconSrc}
                alt="48px favicon preview"
                className="w-12 h-12 object-contain"
              />
              <span className="text-[10px] font-mono text-slate-500">48×48</span>
            </div>
          </div>

          {stagedFaviconFile ? (
            <div className="p-3 rounded-lg bg-sky-50 border border-[#3A99CF]/40 text-xs space-y-1">
              <div className="font-semibold text-[#485EA9]">
                Previewing Before Save: {stagedFaviconFile.name}
              </div>
              <div className="text-slate-600 tabular-nums">
                Size: {formatBytes(stagedFaviconFile.size)}
                {stagedFaviconDims
                  ? ` · Dimensions: ${stagedFaviconDims.w} × ${stagedFaviconDims.h} px`
                  : ''}
              </div>
            </div>
          ) : branding?.faviconMeta ? (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-0.5">
              <div className="font-medium text-slate-800 truncate">
                Active File: {branding.faviconMeta.originalFilename}
              </div>
              <div className="tabular-nums text-[11px] text-slate-500">
                {branding.faviconMeta.mimeType} · {formatBytes(branding.faviconMeta.fileSizeBytes)}
                {branding.faviconMeta.width && branding.faviconMeta.height
                  ? ` · ${branding.faviconMeta.width} × ${branding.faviconMeta.height} px`
                  : ''}
                {' · '}Uploaded by {branding.faviconMeta.uploadedByName}
              </div>
            </div>
          ) : null}

          <input
            ref={faviconInputRef}
            type="file"
            accept=".ico,.png,.svg"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSelectFavicon(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => faviconInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#3A99CF] text-[#3A99CF] hover:bg-[#3A99CF]/5 rounded-lg whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              {branding?.hasCustomFavicon ? 'Choose Replacement Favicon' : 'Select Favicon File'}
            </button>

            {stagedFaviconFile ? (
              <>
                <button
                  type="button"
                  disabled={busyAction === 'save_favicon'}
                  onClick={handleSaveFavicon}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#3A99CF] hover:bg-[#2f86b8] disabled:opacity-60 rounded-lg whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {busyAction === 'save_favicon' ? 'Saving Favicon...' : 'Save Favicon'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (stagedFaviconUrl) URL.revokeObjectURL(stagedFaviconUrl);
                    setStagedFaviconFile(null);
                    setStagedFaviconUrl(null);
                    setStagedFaviconDims(null);
                  }}
                  className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </>
            ) : null}

            {branding?.hasCustomFavicon && !stagedFaviconFile ? (
              <button
                type="button"
                disabled={busyAction === 'remove_favicon'}
                onClick={handleRemoveFavicon}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {busyAction === 'remove_favicon' ? 'Removing...' : 'Remove Favicon'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Live 5-Surface Branding Preview */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#485EA9]" />
            <h2 className="text-sm font-semibold text-slate-900">
              C. Live Branding Preview (All Operational Surfaces)
            </h2>
          </div>
          {stagedLogoUrl || stagedFaviconUrl ? (
            <span className="text-[11px] font-medium text-[#3A99CF]">
              Showing Staged Unsaved Preview
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Showing Active Server Assets</span>
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
                  Oromia Polio Campaign Management System
                </span>
              </div>
            </div>
          </div>

          {/* 2. Login Page Branding */}
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              2. Staff Login Page Branding
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-3 flex flex-col items-center text-center gap-1.5">
              <BrandLogo
                variant="preview"
                branding={branding}
                overrideSrc={effectivePreviewLogoSrc}
              />
              <div className="text-xs font-bold text-slate-900">OHB-OPCMS Staff Sign In</div>
              <div className="text-[10px] text-slate-500">
                Oromia Health Bureau Emergency Operations Center
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
                  overrideSrc={effectivePreviewLogoSrc}
                />
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 truncate">
                    Central Command Center
                  </div>
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    Live Command Center
                  </div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#485EA9] text-white shrink-0">
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
                overrideSrc={effectivePreviewLogoSrc}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#485EA9]">OHB-OPCMS</div>
                <div className="text-[10px] text-slate-500 truncate">
                  Oromia Health Bureau · Polio Command
                </div>
              </div>
            </div>
          </div>

          {/* 5. Command Room Header */}
          <div className="md:col-span-2 border border-slate-200 rounded-lg p-3.5 bg-slate-50 space-y-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              5. Command Room Header (5-Screen Large Display)
            </div>
            <div className="bg-white border border-slate-200 rounded-md px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandLogo
                  variant="preview"
                  branding={branding}
                  overrideSrc={effectivePreviewLogoSrc}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#485EA9] truncate">
                      OHB POLIO COMMAND ROOM
                    </span>
                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                      01 / 05
                    </span>
                    <span className="text-[10px] font-semibold text-[#3A99CF]">
                      REGIONAL OVERVIEW
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Campaign: R1-NOV-2026 · Africa/Addis_Ababa Live Wallboard
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Retained Branding Asset History & Recovery */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Retained Branding Assets &amp; Controlled Recovery ({branding?.history?.length ?? 0})
          </h3>
          <span className="text-[11px] text-slate-500">
            Server directory: uploads/branding/
          </span>
        </div>

        {branding?.history && branding.history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Asset</th>
                  <th className="text-left font-medium px-3 py-2">Original Filename</th>
                  <th className="text-left font-medium px-3 py-2">Type / Size</th>
                  <th className="text-left font-medium px-3 py-2">Dimensions</th>
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
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {item.originalFilename}
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">
                      {item.mimeType} · {formatBytes(item.fileSizeBytes)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 tabular-nums">
                      {item.width && item.height ? `${item.width}×${item.height}` : '—'}
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
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'branding'>(initialTab);
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

  const isAdmin = authenticated && currentUser.role === 'system_admin';

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        <Shield className="w-8 h-8 text-[#485EA9] mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">
          System Administrator Access Required
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          System Settings, Branding &amp; Appearance, and Command Room configuration are strictly restricted to the System Administrator role.
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

  async function saveThresholds(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.updateSettings(form);
      setSavedMsg('System settings updated and broadcast to active dashboards.');
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
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {/* System Settings Sub-Navigation */}
      <div className="bg-white border border-slate-200 rounded-lg p-1.5 inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('general')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors ${
            activeSubTab === 'general'
              ? 'bg-[#485EA9] text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          General &amp; Command Room
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('branding')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors ${
            activeSubTab === 'branding'
              ? 'bg-[#485EA9] text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Branding &amp; Appearance
        </button>
      </div>

      {activeSubTab === 'branding' ? (
        <BrandingSettingsPanel
          branding={branding}
          currentUser={currentUser}
          authenticated={authenticated}
          onRequireAuth={onRequireAuth}
          onBrandingChanged={onBrandingChanged}
        />
      ) : (
        <>
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

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-[#485EA9]" />
              <h2 className="text-sm font-semibold text-slate-900">
                Configurable Surveillance &amp; Guest Access Settings
              </h2>
            </div>

            <form onSubmit={saveThresholds} className="space-y-4 text-xs">
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
                    Expected Woredas Override (Blank = Dynamic Registry)
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

              <div className="pt-2 border-t border-slate-100">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.guestPublicOverviewEnabled)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        guestPublicOverviewEnabled: e.target.checked,
                      })
                    }
                  />
                  Allow unauthenticated visitors to view high-level Public Regional Overview on the Sign-In portal
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#485EA9] hover:bg-[#3a4d8f] text-white font-medium rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>

          {/* Command Room Large-Screen Display Settings */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#3A99CF]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Command Room Large-Screen Monitoring Configuration
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500">/command-room</span>
            </div>

            <form onSubmit={saveThresholds} className="space-y-4 text-xs">
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
                  Prompt / request Full-Screen Mode on wallboard startup
                </label>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  Active campaign rounds monitored:{' '}
                  {campaigns.map((c) => c.roundCode).join(', ') || 'Default Round'}
                </span>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#3A99CF] hover:bg-[#2f86b8] text-white font-medium rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save Command Room Display Settings'}
                </button>
              </div>
            </form>
          </div>

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
                      {c.roundCode} · {c.vaccines} · {c.startDate} to {c.endDate} (
                      {c.expectedDays} days)
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

          {/* Pluggable Ingestion Architecture Note */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Data Ingestion Architecture &amp; Future Connectors
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Primary ingestion currently runs via manual Excel (.xlsx) and CSV (.csv) uploads stored locally on the OHB Ubuntu server and restricted to System Administrators. The backend parser and staged import pipeline are decoupled behind a source-agnostic ingestion adapter so automated Google Drive folder synchronization can be enabled in a future phase without modifying dashboard queries or database tables.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
