import React, { useState } from 'react';
import { Lock, X, KeyRound, ShieldCheck, Globe, LogOut, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { BrandLogo } from './BrandLogo';
import type {
  AuthMeResponse,
  BrandingConfig,
  PublicOverviewResponse,
  UserAccount,
} from '../types/opcms';

interface AuthModalProps {
  open: boolean;
  branding?: BrandingConfig | null;
  onClose: () => void;
  onAuthenticated: (auth: AuthMeResponse) => void;
}

const SignInForm: React.FC<{
  onAuthenticated: (auth: AuthMeResponse) => void;
  onSuccessClose?: () => void;
  idPrefix?: string;
}> = ({ onAuthenticated, onSuccessClose, idPrefix = 'modal' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.login(username, password);
      localStorage.setItem('opcms_token', res.token);
      setPassword('');
      onAuthenticated(res);
      onSuccessClose?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      {error ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}

      <div>
        <label
          htmlFor={`${idPrefix}-username`}
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Username or Email
        </label>
        <input
          id={`${idPrefix}-username`}
          name="username"
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username or official email"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#3A99CF]"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-password`}
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Password
        </label>
        <input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#3A99CF]"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-60 rounded-lg transition-colors"
      >
        {submitting ? 'Signing in...' : 'Sign In'}
      </button>

      <div className="pt-3 border-t border-slate-200">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Authorized Oromia Health Bureau personnel only. Contact your System Administrator if you need an account provisioned or your password reset.
        </p>
      </div>
    </form>
  );
};

export const GuestLoginView: React.FC<{
  branding: BrandingConfig | null;
  guestPublicOverviewEnabled: boolean;
  publicOverview: PublicOverviewResponse | null;
  accessDeniedNotice?: string | null;
  statusMessage?: string | null;
  onAuthenticated: (auth: AuthMeResponse) => void;
}> = ({
  branding,
  guestPublicOverviewEnabled,
  publicOverview,
  accessDeniedNotice,
  statusMessage,
  onAuthenticated,
}) => {
  const appName =
    branding?.identity?.appName ||
    'OROMIA POLIO CAMPAIGN MANAGEMENT SYSTEM (OHB-OPCMS)';
  const appShortName = branding?.identity?.appShortName || 'OHB-OPCMS';
  const orgName = branding?.identity?.organizationName || 'Oromia Health Bureau';
  const tagline =
    branding?.identity?.appTagline ||
    'Central Command Center · nOPV2 & bOPV2 Supplementary Immunization Activities';
  const footerText =
    branding?.identity?.footerText ||
    'Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System';
  const showFooterBranding = branding?.identity?.showFooterBranding !== false;
  const loginBgUrl = branding?.assets?.login_background?.url ?? null;
  const visualAssetUrl = branding?.assets?.visual_asset?.url ?? null;
  const isGradientTheme = branding?.theme?.loginTheme === 'institutional_gradient';

  return (
    <div
      className="min-h-screen flex flex-col justify-between relative overflow-hidden"
      style={{
        backgroundColor: isGradientTheme ? undefined : branding?.theme?.surfaceColor || '#F8FAFC',
        backgroundImage: isGradientTheme
          ? `linear-gradient(135deg, ${branding?.theme?.primaryColor || '#485EA9'}14 0%, #FFFFFF 55%, ${branding?.theme?.secondaryColor || '#3A99CF'}18 100%)`
          : undefined,
      }}
    >
      {loginBgUrl ? (
        <div
          className="absolute inset-0 pointer-events-none opacity-15 bg-cover bg-center"
          style={{ backgroundImage: `url("${loginBgUrl}")` }}
          aria-hidden="true"
        />
      ) : null}

      <header className="relative z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo variant="header" branding={branding} />
            <div className="min-w-0">
              <div
                className="text-sm font-bold tracking-tight truncate"
                style={{ color: branding?.theme?.primaryColor || '#485EA9' }}
              >
                {appName}
              </div>
              <div className="text-xs text-slate-500 truncate">{tagline}</div>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded shrink-0">
            <ShieldCheck
              className="w-3.5 h-3.5"
              style={{ color: branding?.theme?.primaryColor || '#485EA9' }}
            />
            Authenticated Access Only
          </span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div
          className={`w-full ${
            guestPublicOverviewEnabled && publicOverview
              ? 'max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
              : 'max-w-md'
          }`}
        >
          <div
            className={`${
              guestPublicOverviewEnabled && publicOverview ? 'lg:col-span-6' : ''
            } bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden`}
          >
            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/70 flex flex-col items-center text-center gap-2.5">
              <BrandLogo variant="login" branding={branding} />
              <div>
                <h1 className="text-base font-bold text-slate-900">
                  {appShortName} Staff Sign In
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  {orgName} Emergency Operations Center
                </p>
              </div>
            </div>

            <div className="p-6">
              {visualAssetUrl ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
                  <img
                    src={visualAssetUrl}
                    alt={`${orgName} Campaign Visual`}
                    className="max-h-20 w-auto object-contain"
                  />
                </div>
              ) : null}
              {statusMessage ? (
                <div className="mb-4 p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              ) : null}
              {accessDeniedNotice ? (
                <div className="mb-4 p-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
                  {accessDeniedNotice}
                </div>
              ) : null}
              <SignInForm onAuthenticated={onAuthenticated} idPrefix="guest" />
            </div>
          </div>

          {guestPublicOverviewEnabled && publicOverview ? (
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#3A99CF]" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    Public Regional Campaign Overview
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {publicOverview.roundCode}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Approved high-level regional summary for{' '}
                <strong className="text-slate-900">{publicOverview.campaignName}</strong>. Detailed woreda-level records, surveillance alerts, uploads, and operational controls require authorized staff login.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="text-[11px] text-slate-500">Regional Target (0–59m)</div>
                  <div className="text-lg font-bold tabular-nums text-slate-900 mt-0.5">
                    {publicOverview.totalPlannedTarget.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="text-[11px] text-slate-500">Children Vaccinated (0–59m)</div>
                  <div className="text-lg font-bold tabular-nums text-[#3A99CF] mt-0.5">
                    {publicOverview.totalChildrenVaccinated0_59.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="text-[11px] text-slate-500">Regional Coverage</div>
                  <div className="text-lg font-bold tabular-nums text-[#485EA9] mt-0.5">
                    {publicOverview.overallVaccinationCoveragePct}%
                  </div>
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="text-[11px] text-slate-500">Reporting Completeness</div>
                  <div className="text-lg font-bold tabular-nums text-emerald-700 mt-0.5">
                    {publicOverview.expectedReportingWoredas > 0
                      ? Math.round(
                          (publicOverview.submittedWoredas /
                            publicOverview.expectedReportingWoredas) *
                            1000
                        ) / 10
                      : 0}
                    %
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                Reporting Woredas: {publicOverview.submittedWoredas} /{' '}
                {publicOverview.expectedReportingWoredas} · Last Updated:{' '}
                <span className="font-mono">
                  {new Date(publicOverview.serverTimestamp).toLocaleString()}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="relative z-10 border-t border-slate-200 bg-white/95 px-6 py-3 flex items-center justify-center gap-2.5 text-[11px] text-slate-500">
        {showFooterBranding ? <BrandLogo variant="footer" branding={branding} /> : null}
        <span>{footerText}</span>
      </footer>
    </div>
  );
};

const PasswordChangeForm: React.FC<{
  forced?: boolean;
  username?: string;
  onSuccess: (message: string) => void;
}> = ({ forced = false, username, onSuccess }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      setError('New password must include letters plus numbers or symbols.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess(
        res.message ||
          'Password changed successfully. Please sign in again with your new password.'
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {forced ? (
        <div className="p-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
          Account <strong>{username}</strong> is required to set a new personal password (minimum 12 characters with letters and numbers/symbols) before accessing any protected system module. All prior tokens will be invalidated after update.
        </div>
      ) : null}

      {error ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Current Password
        </label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#3A99CF]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          New Password (min 12 chars, letters + numbers/symbols)
        </label>
        <input
          type="password"
          required
          minLength={12}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#3A99CF]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Confirm New Password
        </label>
        <input
          type="password"
          required
          minLength={12}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#3A99CF]"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-60 rounded-lg transition-colors"
      >
        {submitting ? 'Updating Password...' : 'Update Password & Re-Authenticate'}
      </button>
    </form>
  );
};

export const MandatoryPasswordChangeView: React.FC<{
  branding: BrandingConfig | null;
  currentUser: UserAccount;
  onPasswordChangedRelogin: (message: string) => void;
  onLogout: () => void;
}> = ({ branding, currentUser, onPasswordChangedRelogin, onLogout }) => {
  const appName =
    branding?.identity?.appName ||
    'OROMIA POLIO CAMPAIGN MANAGEMENT SYSTEM (OHB-OPCMS)';
  const footerText =
    branding?.identity?.footerText ||
    'Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System';
  const showFooterBranding = branding?.identity?.showFooterBranding !== false;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo variant="header" branding={branding} />
            <div className="min-w-0">
              <div
                className="text-sm font-bold tracking-tight truncate"
                style={{ color: branding?.theme?.primaryColor || '#485EA9' }}
              >
                {appName}
              </div>
              <div className="text-xs text-slate-500">
                Mandatory First-Login Security Verification
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out ({currentUser.username})
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/70 flex flex-col items-center text-center gap-2.5">
            <BrandLogo variant="login" branding={branding} />
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#485EA9]" />
              <h1 className="text-base font-bold text-slate-900">
                Password Update Required
              </h1>
            </div>
          </div>
          <div className="p-6">
            <PasswordChangeForm
              forced
              username={currentUser.username}
              onSuccess={onPasswordChangedRelogin}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-center gap-2.5 text-[11px] text-slate-500">
        {showFooterBranding ? <BrandLogo variant="footer" branding={branding} /> : null}
        <span>{footerText}</span>
      </footer>
    </div>
  );
};

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  branding = null,
  onClose,
  onAuthenticated,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo variant="header" branding={branding} />
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-4 h-4 text-[#485EA9] shrink-0" />
              <h2
                id="auth-modal-title"
                className="text-base font-semibold text-slate-900 truncate"
              >
                {branding?.identity?.appShortName || 'OHB-OPCMS'} Staff Sign In
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
            aria-label="Close sign in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <SignInForm
            onAuthenticated={onAuthenticated}
            onSuccessClose={onClose}
            idPrefix="modal"
          />
        </div>
      </div>
    </div>
  );
};

interface ChangePasswordModalProps {
  open: boolean;
  forced?: boolean;
  username?: string;
  onClose: () => void;
  onPasswordChangedRelogin: (message: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  open,
  forced = false,
  username,
  onClose,
  onPasswordChangedRelogin,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[#485EA9]" />
            <h2
              id="change-password-title"
              className="text-base font-semibold text-slate-900"
            >
              {forced ? 'Password Update Required' : 'Change Account Password'}
            </h2>
          </div>
          {!forced ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              aria-label="Close password update dialog"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="p-5">
          <PasswordChangeForm
            forced={forced}
            username={username}
            onSuccess={(msg) => {
              onClose();
              onPasswordChangedRelogin(msg);
            }}
          />
        </div>
      </div>
    </div>
  );
};
