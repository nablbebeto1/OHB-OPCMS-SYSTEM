import React, { useState } from 'react';
import { Lock, X, KeyRound, ShieldCheck, Globe } from 'lucide-react';
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

const ROLE_PRESETS = [
  {
    label: 'System Administrator',
    username: 'admin',
    pass: 'OhbAdmin#2026',
    scope: 'Full system access, Excel/CSV uploads, branding, users & settings',
  },
  {
    label: 'Central Command Center',
    username: 'command',
    pass: 'OhbCommand#2026',
    scope: 'Dashboards, Command Room, data corrections, alert follow-up, GeoJSON',
  },
  {
    label: 'Zone Officer (East Shewa)',
    username: 'zone_eastshewa',
    pass: 'OhbZone#2026',
    scope: 'Dashboards, zone monitoring, corrections, and alert updates',
  },
  {
    label: 'Woreda Officer (Adama)',
    username: 'woreda_adama',
    pass: 'OhbWoreda#2026',
    scope: 'Dashboards and woreda monitoring exports',
  },
  {
    label: 'Read-only Viewer',
    username: 'viewer',
    pass: 'OhbViewer#2026',
    scope: 'View dashboards, Command Room, and export approved reports',
  },
];

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
      onAuthenticated(res);
      onSuccessClose?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. admin or command@oromiahealth.gov.et"
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
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
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
        <p className="text-xs font-medium text-slate-600 mb-2">
          Seeded RBAC Accounts (Click to populate credentials):
        </p>
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {ROLE_PRESETS.map((preset) => (
            <button
              key={preset.username}
              type="button"
              onClick={() => {
                setUsername(preset.username);
                setPassword(preset.pass);
                setError(null);
              }}
              className="w-full text-left px-3 py-2 border border-slate-200 hover:border-[#3A99CF] rounded-lg transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-900">
                <span>{preset.label}</span>
                <span className="font-mono text-slate-500">{preset.username}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{preset.scope}</div>
            </button>
          ))}
        </div>
        <div className="mt-2.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          <strong>Command Room Large-Screen Viewers:</strong>{' '}
          <code>COMMAND_ROOM_VIEWER</code> accounts are provisioned by the System Administrator with custom credentials and have display-only access to{' '}
          <code>/command-room</code>.
        </div>
      </div>
    </form>
  );
};

export const GuestLoginView: React.FC<{
  branding: BrandingConfig | null;
  guestPublicOverviewEnabled: boolean;
  publicOverview: PublicOverviewResponse | null;
  accessDeniedNotice?: string | null;
  onAuthenticated: (auth: AuthMeResponse) => void;
}> = ({
  branding,
  guestPublicOverviewEnabled,
  publicOverview,
  accessDeniedNotice,
  onAuthenticated,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo variant="header" branding={branding} />
            <div>
              <div className="text-sm font-bold tracking-tight text-[#485EA9]">
                OROMIA POLIO CAMPAIGN MANAGEMENT SYSTEM (OHB-OPCMS)
              </div>
              <div className="text-xs text-slate-500">
                Central Command Center · nOPV2 &amp; bOPV2 Supplementary Immunization Activities
              </div>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
            <ShieldCheck className="w-3.5 h-3.5 text-[#485EA9]" />
            Authenticated Access Only
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
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
                  OHB-OPCMS Staff Sign In
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Oromia Health Bureau Emergency Operations Center
                </p>
              </div>
            </div>

            <div className="p-6">
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

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-center text-[11px] text-slate-500">
        Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System
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
                OHB-OPCMS Staff Sign In
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
  onPasswordChanged: (user: UserAccount) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  open,
  forced = false,
  username,
  onClose,
  onPasswordChanged,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      onPasswordChanged(res.user);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {forced ? (
            <div className="p-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
              Account <strong>{username}</strong> must set a personal password (minimum 10 characters with letters and numbers or symbols) before continuing to the Command Room display.
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
              New Password (min 10 chars, letters + numbers/symbols)
            </label>
            <input
              type="password"
              required
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
            {submitting ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
