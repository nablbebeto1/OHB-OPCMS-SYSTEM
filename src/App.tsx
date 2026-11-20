import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Map as MapIcon,
  BarChart3,
  Syringe,
  ShieldAlert,
  Users,
  Baby,
  CheckSquare,
  UploadCloud,
  FileText,
  UserCog,
  Settings,
  Image as ImageIcon,
  Menu,
  X,
  LogOut,
  RotateCcw,
  Radio,
  Tv,
  AlertTriangle,
  FolderLock,
} from 'lucide-react';
import {
  api,
  apiUrl,
  type DashboardSummaryResponse,
  type FilterParams,
} from './api/client';
import type {
  AdminLocation,
  AdvancedAnalyticsData,
  AuthMeResponse,
  BrandingConfig,
  Campaign,
  CampaignDailyReport,
  CommandRoomStateResponse,
  GeoBoundaryRecord,
  ImportBatch,
  NavMenuItem,
  PublicOverviewResponse,
  SurveillanceAlert,
  UserAccount,
} from './types/opcms';
import {
  AuthModal,
  ChangePasswordModal,
  GuestLoginView,
  MandatoryPasswordChangeView,
} from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';

const LiveCommandCenterView = lazy(() =>
  import('./components/views/LiveCommandCenterView').then((m) => ({
    default: m.LiveCommandCenterView,
  }))
);
const CommandRoomView = lazy(() =>
  import('./components/views/CommandRoomView').then((m) => ({
    default: m.CommandRoomView,
  }))
);
const CommandCenterView = lazy(() =>
  import('./components/views/CommandCenterView').then((m) => ({
    default: m.CommandCenterView,
  }))
);
const CampaignOverviewView = lazy(() =>
  import('./components/views/CampaignOverviewView').then((m) => ({
    default: m.CampaignOverviewView,
  }))
);
const GeographicMapView = lazy(() =>
  import('./components/views/GeographicMapView').then((m) => ({
    default: m.GeographicMapView,
  }))
);
const DailyVaccinationView = lazy(() =>
  import('./components/views/DailyVaccinationView').then((m) => ({
    default: m.DailyVaccinationView,
  }))
);
const VaccineUtilizationView = lazy(() =>
  import('./components/views/VaccineUtilizationView').then((m) => ({
    default: m.VaccineUtilizationView,
  }))
);
const AlertsView = lazy(() =>
  import('./components/views/AlertsView').then((m) => ({
    default: m.AlertsView,
  }))
);
const ReportingCompletenessView = lazy(() =>
  import('./components/views/IntegrationViews').then((m) => ({
    default: m.ReportingCompletenessView,
  }))
);
const SocialMobilizationView = lazy(() =>
  import('./components/views/IntegrationViews').then((m) => ({
    default: m.SocialMobilizationView,
  }))
);
const ZeroDoseView = lazy(() =>
  import('./components/views/IntegrationViews').then((m) => ({
    default: m.ZeroDoseView,
  }))
);
const DataUploadCenterView = lazy(() =>
  import('./components/views/DataUploadCenterView').then((m) => ({
    default: m.DataUploadCenterView,
  }))
);
const DocumentVaultView = lazy(() =>
  import('./components/views/DocumentVaultView').then((m) => ({
    default: m.DocumentVaultView,
  }))
);
const SecurePreviewPage = lazy(() =>
  import('./components/views/SecurePreviewPage').then((m) => ({
    default: m.SecurePreviewPage,
  }))
);
const ReportsAnalyticsView = lazy(() =>
  import('./components/views/ReportsAnalyticsView').then((m) => ({
    default: m.ReportsAnalyticsView,
  }))
);
const BrandingSettingsPanel = lazy(() =>
  import('./components/views/AdminViews').then((m) => ({
    default: m.BrandingSettingsPanel,
  }))
);
const SystemSettingsView = lazy(() =>
  import('./components/views/AdminViews').then((m) => ({
    default: m.SystemSettingsView,
  }))
);
const UserManagementView = lazy(() =>
  import('./components/views/AdminViews').then((m) => ({
    default: m.UserManagementView,
  }))
);

type NavKey =
  | 'live_command_center'
  | 'command_room'
  | 'command_center'
  | 'campaign_overview'
  | 'geographic_performance'
  | 'daily_vaccination'
  | 'vaccine_utilization'
  | 'alerts'
  | 'social_mobilization'
  | 'zero_dose'
  | 'reporting_completeness'
  | 'data_upload'
  | 'file_vault'
  | 'reports_analytics'
  | 'user_management'
  | 'system_settings'
  | 'branding_appearance';

const NAV_ICONS: Record<NavKey, React.FC<{ className?: string }>> = {
  live_command_center: Radio,
  command_room: Tv,
  command_center: LayoutDashboard,
  campaign_overview: ClipboardList,
  geographic_performance: MapIcon,
  daily_vaccination: BarChart3,
  vaccine_utilization: Syringe,
  alerts: ShieldAlert,
  social_mobilization: Users,
  zero_dose: Baby,
  reporting_completeness: CheckSquare,
  data_upload: UploadCloud,
  file_vault: FolderLock,
  reports_analytics: FileText,
  user_management: UserCog,
  system_settings: Settings,
  branding_appearance: ImageIcon,
};

const NAV_PATHS: Record<NavKey, string> = {
  live_command_center: '/',
  command_room: '/command-room',
  command_center: '/command-center',
  campaign_overview: '/campaign-overview',
  geographic_performance: '/geographic-performance',
  daily_vaccination: '/daily-vaccination',
  vaccine_utilization: '/vaccine-utilization',
  alerts: '/alerts',
  social_mobilization: '/social-mobilization',
  zero_dose: '/zero-dose',
  reporting_completeness: '/reporting-completeness',
  data_upload: '/data-upload',
  file_vault: '/files',
  reports_analytics: '/reports-analytics',
  user_management: '/user-management',
  system_settings: '/system-settings',
  branding_appearance: '/branding',
};

function extractPreviewToken(pathname: string): string | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/preview\/([^/]+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function navKeyFromPathname(pathname: string): NavKey {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const match = (Object.entries(NAV_PATHS) as Array<[NavKey, string]>).find(
    ([, p]) => p === normalized
  );
  return match ? match[0] : 'live_command_center';
}

const GUEST_USER: UserAccount = {
  id: 0,
  username: 'guest',
  fullName: 'Guest Visitor',
  email: '',
  role: 'viewer',
  assignedZone: null,
  assignedWoreda: null,
  isActive: true,
  createdAt: '',
  lastLoginAt: null,
};

export default function App() {
  const [previewToken, setPreviewToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? extractPreviewToken(window.location.pathname) : null
  );
  const [activeNav, setActiveNav] = useState<NavKey>(() =>
    typeof window !== 'undefined'
      ? navKeyFromPathname(window.location.pathname)
      : 'live_command_center'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authLoaded, setAuthLoaded] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserAccount>(GUEST_USER);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [navigation, setNavigation] = useState<NavMenuItem[]>([]);
  const [guestPublicOverviewEnabled, setGuestPublicOverviewEnabled] = useState(false);
  const [publicOverview, setPublicOverview] = useState<PublicOverviewResponse | null>(null);
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<number>(1);
  const [dayNum, setDayNum] = useState<number | null>(null);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [woreda, setWoreda] = useState<string | null>(null);
  const [vaccineType, setVaccineType] = useState<'all' | 'nopv2' | 'bopv'>('all');

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [commandRoomState, setCommandRoomState] =
    useState<CommandRoomStateResponse | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedAnalyticsData | null>(null);
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [reports, setReports] = useState<CampaignDailyReport[]>([]);
  const [alerts, setAlerts] = useState<SurveillanceAlert[]>([]);
  const [imports, setImports] = useState<ImportBatch[]>([]);
  const [boundaries, setBoundaries] = useState<GeoBoundaryRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const sseConnectedRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<
    'synchronized' | 'syncing' | 'stale' | 'disconnected'
  >('syncing');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [isWallboard, setIsWallboard] = useState(false);
  const [commandRoomFullscreen, setCommandRoomFullscreen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [liveToast, setLiveToast] = useState<{
    message: string;
    actor: string;
    timestamp: string;
  } | null>(null);

  const mustChangePassword = authenticated && Boolean(currentUser.mustChangePassword);
  const isCommandRoomViewer =
    authenticated && !mustChangePassword && currentUser.role === 'command_room_viewer';
  const canUploadData =
    authenticated && !mustChangePassword && permissions.includes('upload_data');
  const canViewDashboard =
    authenticated && !mustChangePassword && permissions.includes('view_dashboard');
  const canViewCommandRoom =
    authenticated && !mustChangePassword && permissions.includes('view_command_room');
  const canManageBranding =
    authenticated && !mustChangePassword && permissions.includes('manage_branding');

  const applyThemeFromBranding = useCallback((cfg: BrandingConfig | null, contrast = false) => {
    const root = document.documentElement;
    if (cfg?.theme) {
      root.style.setProperty('--color-ohb-deep', cfg.theme.primaryColor || '#485EA9');
      root.style.setProperty('--color-ohb-blue', cfg.theme.secondaryColor || '#3A99CF');
      root.style.setProperty('--color-ohb-orange', cfg.theme.accentColor || '#D29441');
      const fontStack = (name: string) =>
        name === 'System Sans'
          ? 'system-ui, -apple-system, sans-serif'
          : `"${name}", system-ui, -apple-system, sans-serif`;
      root.style.setProperty('--font-display', fontStack(cfg.theme.displayFont || 'Plus Jakarta Sans'));
      root.style.setProperty('--font-sans', fontStack(cfg.theme.bodyFont || 'DM Sans'));
      root.style.fontSize =
        cfg.theme.fontScale === 'compact'
          ? '15px'
          : cfg.theme.fontScale === 'comfortable'
            ? '17px'
            : '16px';
    }
    if (cfg?.identity?.appName) {
      document.title = cfg.identity.appName;
    }
    root.dataset.contrast = contrast ? 'high' : 'normal';
  }, []);

  const applyBrandingUpdate = useCallback(
    (cfg: BrandingConfig) => {
      setBranding(cfg);
      applyThemeFromBranding(cfg, Boolean(summary?.settings?.highContrastMode));
      const link = document.getElementById('app-favicon') as HTMLLinkElement | null;
      if (link) {
        const targetHref =
          cfg.faviconUrl ||
          apiUrl(`/api/branding/favicon?v=${encodeURIComponent(cfg.updatedAt || 'default')}`);
        link.href = targetHref;
      }
    },
    [applyThemeFromBranding, summary?.settings?.highContrastMode]
  );

  useEffect(() => {
    applyThemeFromBranding(branding, Boolean(summary?.settings?.highContrastMode));
  }, [branding, summary?.settings?.highContrastMode, applyThemeFromBranding]);

  const applyAuthContext = useCallback((ctx: AuthMeResponse) => {
    setAuthenticated(ctx.authenticated);
    setCurrentUser(ctx.user);
    setPermissions(ctx.permissions ?? []);
    setNavigation(ctx.navigation ?? []);
    setGuestPublicOverviewEnabled(Boolean(ctx.guestPublicOverviewEnabled));
    setAuthLoaded(true);
    setRouteNotice(null);

    if (!ctx.authenticated) {
      setSummary(null);
      setCommandRoomState(null);
      setAdvanced(null);
      setLocations([]);
      setReports([]);
      setAlerts([]);
      setImports([]);
      setBoundaries([]);
      setCampaigns([]);
      if (!extractPreviewToken(window.location.pathname) && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/');
        setRouteNotice('Sign in required to access operational dashboards.');
      }
      return;
    }

    setAuthStatusMessage(null);

    if (ctx.user.mustChangePassword) {
      if (window.location.pathname !== '/change-password') {
        window.history.replaceState(null, '', '/change-password');
      }
      return;
    }

    if (ctx.user.role === 'command_room_viewer') {
      setActiveNav('command_room');
      if (window.location.pathname !== '/command-room') {
        window.history.replaceState(null, '', '/command-room');
      }
    } else {
      const currentFromPath = navKeyFromPathname(window.location.pathname);
      const allowedKeys = new Set((ctx.navigation ?? []).map((n) => n.key));
      const preferredLanding = (
        allowedKeys.has(ctx.defaultLanding)
          ? ctx.defaultLanding
          : allowedKeys.has('live_command_center')
            ? 'live_command_center'
            : ctx.navigation?.[0]?.key ?? 'live_command_center'
      ) as NavKey;

      if (window.location.pathname === '/' && preferredLanding !== 'live_command_center') {
        setActiveNav(preferredLanding);
        window.history.replaceState(null, '', NAV_PATHS[preferredLanding] ?? '/');
      } else if (!allowedKeys.has(currentFromPath)) {
        setActiveNav(preferredLanding);
        const origPath = window.location.pathname;
        window.history.replaceState(null, '', NAV_PATHS[preferredLanding] ?? '/');
        if (origPath !== '/' && origPath !== '/login' && origPath !== '/change-password') {
          setRouteNotice(
            `Access restricted: your role (${ctx.user.role}) does not permit access to that module.`
          );
        }
      } else {
        setActiveNav(currentFromPath);
      }
    }
  }, []);

  const navigateTo = useCallback(
    (nextNav: NavKey) => {
      if (!authenticated) return;
      if (isCommandRoomViewer) {
        setActiveNav('command_room');
        if (window.location.pathname !== '/command-room') {
          window.history.replaceState(null, '', '/command-room');
        }
        return;
      }

      const allowedKeys = new Set(navigation.map((n) => n.key));
      if (!allowedKeys.has(nextNav)) {
        setRouteNotice(
          `Access restricted: your role (${currentUser.role}) is not authorized to open that module.`
        );
        return;
      }

      setRouteNotice(null);
      setActiveNav(nextNav);
      setMobileMenuOpen(false);
      const targetPath = NAV_PATHS[nextNav] ?? '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    },
    [authenticated, isCommandRoomViewer, navigation, currentUser.role]
  );

  // Enforce strict route gating on browser Back/Forward & direct URL entry
  useEffect(() => {
    const syncPreviewRoute = () => {
      const tok = extractPreviewToken(window.location.pathname);
      setPreviewToken(tok);
    };
    window.addEventListener('popstate', syncPreviewRoute);
    return () => window.removeEventListener('popstate', syncPreviewRoute);
  }, []);

  useEffect(() => {
    if (previewToken) return;
    if (!authLoaded) return;

    const enforceRoute = () => {
      if (extractPreviewToken(window.location.pathname)) {
        setPreviewToken(extractPreviewToken(window.location.pathname));
        return;
      }
      if (!authenticated) {
        if (window.location.pathname !== '/') {
          window.history.replaceState(null, '', '/');
          setRouteNotice('Sign in required to access operational dashboards.');
        }
        return;
      }
      if (mustChangePassword) {
        if (window.location.pathname !== '/change-password') {
          window.history.replaceState(null, '', '/change-password');
        }
        return;
      }
      if (isCommandRoomViewer) {
        setActiveNav('command_room');
        if (window.location.pathname !== '/command-room') {
          window.history.replaceState(null, '', '/command-room');
        }
        return;
      }
      const requested = navKeyFromPathname(window.location.pathname);
      const allowedKeys = new Set(navigation.map((n) => n.key));
      if (!allowedKeys.has(requested)) {
        const fallback = (allowedKeys.has('live_command_center')
          ? 'live_command_center'
          : (navigation[0]?.key as NavKey | undefined)) ?? 'live_command_center';
        setActiveNav(fallback);
        window.history.replaceState(null, '', NAV_PATHS[fallback] ?? '/');
        setRouteNotice(
          `Access restricted: your role (${currentUser.role}) does not permit access to "${requested}".`
        );
      } else {
        setActiveNav(requested);
      }
    };

    enforceRoute();
    window.addEventListener('popstate', enforceRoute);
    return () => window.removeEventListener('popstate', enforceRoute);
  }, [previewToken, authLoaded, authenticated, mustChangePassword, isCommandRoomViewer, navigation, currentUser.role]);

  // Keep React fullscreen state synced with browser Escape / fullscreenchange
  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setCommandRoomFullscreen(active);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleCommandRoomFullscreen = useCallback(async (next: boolean) => {
    try {
      if (next && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback to CSS full-viewport mode when browser blocks fullscreen outside gesture
    }
    setCommandRoomFullscreen(next);
  }, []);

  const filter: FilterParams = useMemo(
    () => ({
      campaignId,
      dayNum,
      reportDate,
      zone,
      woreda,
      vaccineType,
    }),
    [campaignId, dayNum, reportDate, zone, woreda, vaccineType]
  );

  const fetchBranding = useCallback(async () => {
    try {
      const cfg = await api.getBranding();
      applyBrandingUpdate(cfg);
    } catch {
      // keep existing branding
    }
  }, [applyBrandingUpdate]);

  const fetchAllData = useCallback(async () => {
    if (!authLoaded) return;

    if (!authenticated) {
      if (guestPublicOverviewEnabled) {
        try {
          const pub = await api.getPublicOverview();
          setPublicOverview(pub);
        } catch {
          setPublicOverview(null);
        }
      } else {
        setPublicOverview(null);
      }
      setLoading(false);
      return;
    }

    if (mustChangePassword) {
      setLoading(false);
      return;
    }

    setSyncStatus('syncing');
    try {
      if (isCommandRoomViewer) {
        const [crRes, geoRes] = await Promise.all([
          api.getCommandRoomState(filter),
          api.getGeoBoundaries(),
        ]);
        setCommandRoomState(crRes);
        setBoundaries(geoRes);
        setLastRefreshedAt(crRes.serverTimestamp ?? new Date().toISOString());
        setSyncStatus(sseConnectedRef.current ? 'synchronized' : 'disconnected');
        return;
      }

      const [sumRes, crRes, advRes, locRes, repRes, altRes, geoRes, impRes] =
        await Promise.all([
          api.getDashboardSummary(filter),
          api.getCommandRoomState(filter),
          api.getAdvancedAnalytics(filter),
          api.getLocations({ zone: filter.zone, woreda: filter.woreda }),
          api.getDailyReports(filter),
          api.getAlerts(filter),
          api.getGeoBoundaries(),
          canUploadData ? api.getImportHistory(campaignId) : Promise.resolve([] as ImportBatch[]),
        ]);
      setSummary(sumRes);
      setCommandRoomState(crRes);
      setAdvanced(advRes);
      setLocations(locRes);
      setReports(repRes);
      setAlerts(altRes);
      setBoundaries(geoRes);
      setImports(impRes);
      setLastRefreshedAt(sumRes.serverTimestamp ?? new Date().toISOString());
      setSyncStatus(sseConnectedRef.current ? 'synchronized' : 'disconnected');
    } catch (err) {
      console.error('Failed to refresh dashboard data:', err);
      setSyncStatus('stale');
    } finally {
      setLoading(false);
    }
  }, [
    authLoaded,
    authenticated,
    mustChangePassword,
    guestPublicOverviewEnabled,
    filter,
    campaignId,
    isCommandRoomViewer,
    canUploadData,
  ]);

  useEffect(() => {
    fetchBranding();
    if (previewToken) {
      setAuthLoaded(true);
      setLoading(false);
      return;
    }
    api
      .getMe()
      .then((res) => {
        applyAuthContext(res);
      })
      .catch(() => {
        setAuthLoaded(true);
        setLoading(false);
      });
  }, [previewToken, fetchBranding, applyAuthContext]);

  useEffect(() => {
    if (previewToken || !authenticated || mustChangePassword || isCommandRoomViewer) return;
    api
      .getCampaigns()
      .then((list) => {
        setCampaigns(list);
        if (list.length > 0) setCampaignId(list[0].id);
      })
      .catch(() => {});
  }, [previewToken, authenticated, mustChangePassword, isCommandRoomViewer]);

  useEffect(() => {
    if (previewToken) return;
    fetchAllData();
  }, [previewToken, fetchAllData]);

  // Periodic background data refresh governed by persisted DB settings
  useEffect(() => {
    if (!authenticated || mustChangePassword) return;
    const isCr = activeNav === 'command_room' || isCommandRoomViewer;
    if (!isCr && summary?.settings?.liveCommandAutoRefresh === false) return;
    const sec = Math.max(
      10,
      isCr
        ? commandRoomState?.settings.commandRoomDataRefreshSec ?? 30
        : summary?.settings?.dashboardAutoRefreshSec ?? 30
    );
    const timer = window.setInterval(() => {
      fetchAllData();
    }, sec * 1000);
    return () => window.clearInterval(timer);
  }, [
    authenticated,
    mustChangePassword,
    activeNav,
    isCommandRoomViewer,
    commandRoomState?.settings.commandRoomDataRefreshSec,
    summary?.settings?.dashboardAutoRefreshSec,
    summary?.settings?.liveCommandAutoRefresh,
    fetchAllData,
  ]);

  // Real-time Server-Sent Events subscription (authenticated sessions only)
  useEffect(() => {
    if (previewToken || !authenticated || mustChangePassword) {
      sseConnectedRef.current = false;
      setSseConnected(false);
      return;
    }

    const es = new EventSource(apiUrl('/api/events'));

    es.addEventListener('connected', () => {
      sseConnectedRef.current = true;
      setSseConnected(true);
      setSyncStatus((prev) => (prev === 'syncing' ? 'syncing' : 'synchronized'));
    });

    const handleUpdateEvent = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (!isCommandRoomViewer) {
          setLiveToast({
            message: data.message,
            actor: data.actor,
            timestamp: data.timestamp,
          });
        }
        fetchAllData();
      } catch {
        fetchAllData();
      }
    };

    const handleBrandingEvent = () => {
      fetchBranding();
    };

    es.addEventListener('import:confirmed', handleUpdateEvent);
    es.addEventListener('import:rolled_back', handleUpdateEvent);
    es.addEventListener('alert:updated', handleUpdateEvent);
    es.addEventListener('record:corrected', handleUpdateEvent);
    es.addEventListener('geo:updated', handleUpdateEvent);
    es.addEventListener('settings:updated', handleUpdateEvent);
    es.addEventListener('branding:updated', handleBrandingEvent);

    es.onerror = () => {
      sseConnectedRef.current = false;
      setSseConnected(false);
      setSyncStatus('disconnected');
    };

    return () => {
      es.close();
    };
  }, [previewToken, authenticated, mustChangePassword, fetchAllData, fetchBranding, isCommandRoomViewer]);

  useEffect(() => {
    if (!liveToast) return;
    const timer = setTimeout(() => setLiveToast(null), 8000);
    return () => clearTimeout(timer);
  }, [liveToast]);

  const handlePasswordChangedRelogin = useCallback(
    async (message: string) => {
      localStorage.removeItem('opcms_token');
      await api.logout().catch(() => {});
      setCommandRoomFullscreen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setAuthenticated(false);
      setCurrentUser(GUEST_USER);
      setPermissions([]);
      setNavigation([]);
      setSummary(null);
      setCommandRoomState(null);
      setAdvanced(null);
      setLocations([]);
      setReports([]);
      setAlerts([]);
      setImports([]);
      setBoundaries([]);
      setCampaigns([]);
      setPasswordModalOpen(false);
      setAuthStatusMessage(message);
      window.history.replaceState(null, '', '/');
    },
    []
  );

  async function handleLogout() {
    await api.logout().catch(() => {});
    localStorage.removeItem('opcms_token');
    setCommandRoomFullscreen(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    const me = await api.getMe().catch(() => null);
    if (me) {
      applyAuthContext(me);
    } else {
      setAuthenticated(false);
      setCurrentUser(GUEST_USER);
      setPermissions([]);
      setNavigation([]);
    }
    window.history.replaceState(null, '', '/');
  }

  const allZoneNames = useMemo(() => {
    return Array.from(new Set((summary?.zones ?? []).map((z) => z.zone))).sort();
  }, [summary?.zones]);

  const woredaOptions = useMemo(() => {
    return locations
      .filter((l) => (!zone ? true : l.canonicalZone === zone))
      .map((l) => l.canonicalWoreda)
      .sort();
  }, [locations, zone]);

  const activeNavItem =
    navigation.find((i) => i.key === activeNav) ?? navigation[0] ?? null;
  const activeCampaign = campaigns.find((c) => c.id === campaignId);

  if (previewToken) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
            Loading Secure Document Preview...
          </div>
        }
      >
        <SecurePreviewPage token={previewToken} branding={branding} />
      </Suspense>
    );
  }

  if (!authLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Initializing OHB-OPCMS Security Session...
      </div>
    );
  }

  // Strict Guest / Unauthenticated View: zero sidebar, zero settings, zero upload, zero protected data
  if (!authenticated) {
    return (
      <GuestLoginView
        branding={branding}
        guestPublicOverviewEnabled={guestPublicOverviewEnabled}
        publicOverview={publicOverview}
        accessDeniedNotice={routeNotice}
        statusMessage={authStatusMessage}
        onAuthenticated={(authRes) => {
          applyAuthContext(authRes);
          fetchBranding();
        }}
      />
    );
  }

  // Strict Mandatory Password Change Screen: blocks ALL protected views until changed & re-authenticated
  if (mustChangePassword) {
    return (
      <MandatoryPasswordChangeView
        branding={branding}
        currentUser={currentUser}
        onPasswordChangedRelogin={handlePasswordChangedRelogin}
        onLogout={handleLogout}
      />
    );
  }

  // Strict isolated viewport for COMMAND_ROOM_VIEWER or full-screen Command Room wallboard
  if (isCommandRoomViewer || (activeNav === 'command_room' && commandRoomFullscreen)) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100">
        {commandRoomState ? (
          <CommandRoomView
            state={commandRoomState}
            boundaries={boundaries}
            branding={branding}
            filter={filter}
            currentUser={currentUser}
            authenticated={authenticated}
            sseConnected={sseConnected}
            syncStatus={syncStatus}
            lastRefreshedAt={lastRefreshedAt}
            isFullscreen={commandRoomFullscreen || isCommandRoomViewer}
            onToggleFullscreen={handleToggleCommandRoomFullscreen}
            onLogout={handleLogout}
            onOpenPasswordChange={() => setPasswordModalOpen(true)}
          />
        ) : (
          <div className="min-h-screen flex items-center justify-center text-sm text-slate-300">
            Loading Oromia Health Bureau Command Room Display...
          </div>
        )}

        <ChangePasswordModal
          open={passwordModalOpen}
          forced={false}
          username={currentUser.username}
          onClose={() => setPasswordModalOpen(false)}
          onPasswordChangedRelogin={handlePasswordChangedRelogin}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex text-slate-900"
      style={{ backgroundColor: branding?.theme?.surfaceColor || '#F8FAFC' }}
    >
      {/* Sidebar Navigation (Generated Strictly From Backend Role Navigation Registry) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo variant="sidebar" branding={branding} />
            <div className="min-w-0">
              <div
                className="text-sm font-bold tracking-tight truncate"
                style={{ color: branding?.theme?.primaryColor || '#485EA9' }}
              >
                {branding?.identity?.appShortName || 'OHB-OPCMS'}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight truncate">
                {branding?.identity?.organizationName || 'Oromia Health Bureau'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-slate-500"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navigation.map((item) => {
            const key = item.key as NavKey;
            const Icon = NAV_ICONS[key] ?? LayoutDashboard;
            const active = activeNav === key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigateTo(key)}
                className={`w-full flex items-center gap-2.5 px-3 ${
                  summary?.settings?.uiDensity === 'compact' ? 'py-1.5' : 'py-2'
                } text-xs font-medium rounded-lg transition-colors text-left ${
                  active
                    ? 'bg-[#3A99CF]/10 text-[#485EA9]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[#3A99CF]' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <span>{sseConnected ? 'Live Sync Connected' : 'Connecting Sync...'}</span>
          </div>
          <div className="mt-1 text-[11px] font-medium text-slate-700 truncate">
            {currentUser.fullName}
          </div>
          <div className="text-[10px] font-mono text-slate-500 truncate">
            {currentUser.role}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 border border-slate-200 rounded-md"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <BrandLogo variant="header" branding={branding} className="hidden sm:block" />
            <div className="min-w-0">
              <div className="text-xs text-slate-500 truncate">
                {branding?.identity?.appTagline ||
                  'Central Command Center · nOPV2 & bOPV2 SIA'}
              </div>
              <h1 className="text-base font-semibold text-slate-900 truncate">
                {activeNavItem?.label ?? 'Live Command Center'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {canViewCommandRoom && activeNav !== 'command_room' ? (
              <button
                type="button"
                onClick={() => navigateTo('command_room')}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#485EA9] text-[#485EA9] hover:bg-[#485EA9]/10 rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                <Tv className="w-3.5 h-3.5" />
                Command Room
              </button>
            ) : null}

            {canViewDashboard && activeNav !== 'live_command_center' ? (
              <button
                type="button"
                onClick={() => navigateTo('live_command_center')}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#3A99CF] text-[#3A99CF] hover:bg-[#3A99CF]/10 rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                <Radio className="w-3.5 h-3.5" />
                Live Command Center
              </button>
            ) : null}

            {canUploadData ? (
              <button
                type="button"
                onClick={() => navigateTo('data_upload')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#3A99CF] hover:bg-[#2f86b8] rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Import Report
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out ({currentUser.username})
            </button>
          </div>
        </header>

        {/* Global Operational Filter Bar */}
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center gap-2.5 text-xs">
          <select
            aria-label="Campaign Round"
            value={campaignId}
            onChange={(e) => setCampaignId(Number(e.target.value))}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white max-w-[260px]"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.roundCode} · {c.vaccines}
              </option>
            ))}
          </select>

          <select
            aria-label="Campaign Day"
            value={dayNum ?? ''}
            onChange={(e) =>
              setDayNum(e.target.value ? Number(e.target.value) : null)
            }
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
          >
            <option value="">All Campaign Days</option>
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                Day {d}
              </option>
            ))}
          </select>

          {summary && summary.availableDates.length > 0 ? (
            <select
              aria-label="Reporting Date"
              value={reportDate ?? ''}
              onChange={(e) => setReportDate(e.target.value || null)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="">All Dates</option>
              {summary.availableDates.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
          ) : null}

          <select
            aria-label="Zone Filter"
            value={zone ?? ''}
            onChange={(e) => {
              setZone(e.target.value || null);
              setWoreda(null);
            }}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white max-w-[200px]"
          >
            <option value="">All Zones ({allZoneNames.length})</option>
            {allZoneNames.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>

          <select
            aria-label="Woreda Filter"
            value={woreda ?? ''}
            onChange={(e) => setWoreda(e.target.value || null)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white max-w-[200px]"
          >
            <option value="">All Woredas ({woredaOptions.length})</option>
            {woredaOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          <select
            aria-label="Vaccine Filter"
            value={vaccineType}
            onChange={(e) =>
              setVaccineType(e.target.value as 'all' | 'nopv2' | 'bopv')
            }
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
          >
            <option value="all">Both nOPV2 &amp; bOPV</option>
            <option value="nopv2">nOPV2 Only</option>
            <option value="bopv">bOPV Only</option>
          </select>

          {dayNum || reportDate || zone || woreda || vaccineType !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setDayNum(null);
                setReportDate(null);
                setZone(null);
                setWoreda(null);
                setVaccineType('all');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#485EA9] hover:underline"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Filters
            </button>
          ) : null}
        </div>

        {/* Access Denied / Route Guard Alert */}
        {routeNotice ? (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
              <span>{routeNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setRouteNotice(null)}
              className="text-amber-800 hover:text-amber-950 ml-4"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Real-time Notification Toast */}
        {liveToast ? (
          <div className="mx-5 mt-4 p-3 bg-sky-50 border border-[#3A99CF]/40 rounded-lg flex items-center justify-between text-xs text-slate-900">
            <div>
              <strong className="text-[#485EA9]">Live Dashboard Update:</strong>{' '}
              {liveToast.message} · <span className="text-slate-600">{liveToast.actor}</span>
            </div>
            <button
              type="button"
              onClick={() => setLiveToast(null)}
              className="text-slate-500 hover:text-slate-900 ml-4"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Active Module Viewport */}
        <main className="flex-1 p-5 max-w-[1600px] w-full mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              }
            >
              {activeNav === 'live_command_center' && canViewDashboard && summary ? (
                <LiveCommandCenterView
                  summary={summary}
                  advanced={advanced}
                  reports={reports}
                  alerts={alerts}
                  boundaries={boundaries}
                  activeCampaign={activeCampaign}
                  selectedDay={dayNum}
                  selectedZone={zone}
                  sseConnected={sseConnected}
                  syncStatus={syncStatus}
                  lastRefreshedAt={lastRefreshedAt}
                  liveAlertBanner={liveToast}
                  isWallboard={isWallboard}
                  onToggleWallboard={(next) => setIsWallboard(next)}
                  onManualRefresh={fetchAllData}
                  onSelectZone={(z) => setZone(z)}
                />
              ) : null}

              {activeNav === 'command_room' && canViewCommandRoom && commandRoomState ? (
                <CommandRoomView
                  state={commandRoomState}
                  boundaries={boundaries}
                  branding={branding}
                  filter={filter}
                  currentUser={currentUser}
                  authenticated={authenticated}
                  sseConnected={sseConnected}
                  syncStatus={syncStatus}
                  lastRefreshedAt={lastRefreshedAt}
                  isFullscreen={commandRoomFullscreen}
                  onToggleFullscreen={handleToggleCommandRoomFullscreen}
                  onLogout={handleLogout}
                  onOpenPasswordChange={() => setPasswordModalOpen(true)}
                />
              ) : null}

              {activeNav === 'command_center' && canViewDashboard && summary ? (
                <CommandCenterView
                  summary={summary}
                  alerts={alerts}
                  imports={imports}
                  canUpload={canUploadData}
                  onNavigate={(tab) => navigateTo(tab as NavKey)}
                  onSelectZone={(z) => setZone(z)}
                />
              ) : null}

              {activeNav === 'campaign_overview' && canViewDashboard && summary ? (
                <CampaignOverviewView
                  summary={summary}
                  reports={reports}
                  userRole={currentUser.role}
                  onSelectZone={(z) => setZone(z)}
                  onRefresh={fetchAllData}
                />
              ) : null}

              {activeNav === 'geographic_performance' && canViewDashboard && summary ? (
                <GeographicMapView
                  summary={summary}
                  reports={reports}
                  boundaries={boundaries}
                  userRole={currentUser.role}
                  onSelectZone={(z) => setZone(z)}
                  onSelectWoreda={(z, w) => {
                    setZone(z);
                    setWoreda(w);
                  }}
                  onBoundaryUploaded={fetchAllData}
                />
              ) : null}

              {activeNav === 'daily_vaccination' && canViewDashboard && summary ? (
                <DailyVaccinationView
                  summary={summary}
                  vaccineFilter={vaccineType}
                />
              ) : null}

              {activeNav === 'vaccine_utilization' && canViewDashboard && summary ? (
                <VaccineUtilizationView
                  reports={reports}
                  settings={summary.settings}
                />
              ) : null}

              {activeNav === 'alerts' && canViewDashboard ? (
                <AlertsView
                  alerts={alerts}
                  userRole={currentUser.role}
                  onRefresh={fetchAllData}
                />
              ) : null}

              {activeNav === 'social_mobilization' && canViewDashboard && summary ? (
                <SocialMobilizationView summary={summary} reports={reports} />
              ) : null}

              {activeNav === 'zero_dose' && canViewDashboard && summary ? (
                <ZeroDoseView summary={summary} reports={reports} />
              ) : null}

              {activeNav === 'reporting_completeness' && canViewDashboard && summary ? (
                <ReportingCompletenessView
                  summary={summary}
                  locations={locations}
                  reports={reports}
                  selectedDay={dayNum}
                />
              ) : null}

              {activeNav === 'data_upload' && canUploadData ? (
                <DataUploadCenterView
                  campaignId={campaignId}
                  currentUser={currentUser}
                  authenticated={authenticated}
                  imports={imports}
                  onRequireAuth={() => setAuthModalOpen(true)}
                  onImportSuccess={fetchAllData}
                />
              ) : null}

              {activeNav === 'file_vault' &&
              permissions.includes('view_files') ? (
                <DocumentVaultView
                  currentUser={currentUser}
                  permissions={permissions}
                />
              ) : null}

              {activeNav === 'reports_analytics' &&
              permissions.includes('export_reports') &&
              summary ? (
                <ReportsAnalyticsView summary={summary} filter={filter} />
              ) : null}

              {activeNav === 'user_management' &&
              permissions.includes('manage_users') ? (
                <UserManagementView
                  currentUser={currentUser}
                  authenticated={authenticated}
                  onRequireAuth={() => setAuthModalOpen(true)}
                />
              ) : null}

              {activeNav === 'system_settings' &&
              permissions.includes('manage_settings') &&
              summary ? (
                <SystemSettingsView
                  settings={summary.settings}
                  campaigns={campaigns}
                  branding={branding}
                  initialTab="general"
                  currentUser={currentUser}
                  authenticated={authenticated}
                  onRequireAuth={() => setAuthModalOpen(true)}
                  onUpdated={() => {
                    api.getCampaigns().then(setCampaigns).catch(() => {});
                    api.getMe().then(applyAuthContext).catch(() => {});
                    fetchBranding();
                    fetchAllData();
                  }}
                  onBrandingChanged={(next) => {
                    applyBrandingUpdate(next);
                    fetchAllData();
                  }}
                />
              ) : null}

              {activeNav === 'branding_appearance' && canManageBranding ? (
                <BrandingSettingsPanel
                  branding={branding}
                  settings={summary?.settings ?? null}
                  currentUser={currentUser}
                  authenticated={authenticated}
                  onRequireAuth={() => setAuthModalOpen(true)}
                  onBrandingChanged={(next) => {
                    applyBrandingUpdate(next);
                    fetchAllData();
                  }}
                  onAppearanceUpdated={() => {
                    fetchBranding();
                    fetchAllData();
                  }}
                />
              ) : null}
            </Suspense>
          )}
        </main>

        <footer className="bg-white border-t border-slate-200 px-5 py-2.5 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {branding?.identity?.showFooterBranding !== false ? (
              <BrandLogo variant="footer" branding={branding} />
            ) : null}
            <span className="truncate">
              {branding?.identity?.footerText ||
                'Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System'}
            </span>
          </div>
          {summary?.settings?.supportContact ? (
            <span className="font-mono text-slate-400">
              {summary.settings.supportContact}
            </span>
          ) : null}
        </footer>
      </div>

      <AuthModal
        open={authModalOpen}
        branding={branding}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(authRes) => {
          applyAuthContext(authRes);
          fetchBranding();
        }}
      />

      <ChangePasswordModal
        open={passwordModalOpen}
        forced={false}
        username={currentUser.username}
        onClose={() => setPasswordModalOpen(false)}
        onPasswordChangedRelogin={handlePasswordChangedRelogin}
      />
    </div>
  );
}
