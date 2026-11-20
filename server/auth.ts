import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import {
  getRuntimeConfig,
  initializeRuntimeConfig,
  type RuntimeConfig,
} from './config.ts';
import { db } from './db.ts';
import type {
  AuthMeResponse,
  NavMenuItem,
  UserAccount,
  UserRole,
} from '../src/types/opcms.ts';

let activeAuthConfig: RuntimeConfig | null = null;

export function initializeAuthRuntime(config?: RuntimeConfig): RuntimeConfig {
  activeAuthConfig = config ?? initializeRuntimeConfig();
  return activeAuthConfig;
}

function getAuthSecret(): string {
  const cfg = activeAuthConfig ?? getRuntimeConfig();
  return cfg.authSecret;
}

export function resolvePreviewSigningSecret(): string {
  const cfg = activeAuthConfig ?? getRuntimeConfig();
  return cfg.previewSecret;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compareSync(password, storedHash);
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signSessionToken(user: {
  id: number;
  username: string;
  role: UserRole;
  tokenVersion?: number;
}): string {
  const secret = getAuthSecret();
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    tv: Number(user.tokenVersion ?? 1),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): {
  sub: number;
  username: string;
  role: UserRole;
  tv: number;
} | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const secret = getAuthSecret();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return {
      sub: Number(parsed.sub),
      username: String(parsed.username),
      role: parsed.role as UserRole,
      tv: Number(parsed.tv ?? -1),
    };
  } catch {
    return null;
  }
}

export function mapUserRow(row: Record<string, unknown>): UserAccount {
  return {
    id: Number(row.id),
    username: String(row.username),
    fullName: String(row.full_name),
    email: String(row.email),
    role: row.role as UserRole,
    assignedZone: row.assigned_zone ? String(row.assigned_zone) : null,
    assignedWoreda: row.assigned_woreda ? String(row.assigned_woreda) : null,
    isActive: Number(row.is_active) === 1,
    mustChangePassword: Number(row.must_change_password ?? 0) === 1,
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

export const ROLE_PERMISSIONS: Record<UserRole, Set<string>> = {
  system_admin: new Set([
    'view_dashboard',
    'view_command_room',
    'upload_data',
    'confirm_import',
    'rollback_import',
    'correct_data',
    'manage_alerts',
    'export_reports',
    'manage_users',
    'view_audit_logs',
    'manage_settings',
    'manage_branding',
    'upload_geo',
    'view_files',
    'upload_files',
    'manage_preview_links',
    'delete_files',
  ]),
  command_center: new Set([
    'view_dashboard',
    'view_command_room',
    'correct_data',
    'manage_alerts',
    'export_reports',
    'upload_geo',
    'view_files',
    'upload_files',
    'manage_preview_links',
  ]),
  central_command: new Set([
    'view_dashboard',
    'view_command_room',
    'correct_data',
    'manage_alerts',
    'export_reports',
    'upload_geo',
    'view_files',
    'upload_files',
    'manage_preview_links',
  ]),
  zone_officer: new Set([
    'view_dashboard',
    'view_command_room',
    'correct_data',
    'manage_alerts',
    'export_reports',
    'view_files',
    'upload_files',
  ]),
  woreda_officer: new Set([
    'view_dashboard',
    'view_command_room',
    'export_reports',
    'view_files',
  ]),
  viewer: new Set([
    'view_dashboard',
    'view_command_room',
    'export_reports',
    'view_files',
  ]),
  command_room_viewer: new Set(['view_command_room']),
};

export const NAV_MODULE_REGISTRY: NavMenuItem[] = [
  {
    key: 'live_command_center',
    label: 'Live Command Center',
    path: '/',
    group: 'operations',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'command_room',
    label: 'Command Room (5-Screen)',
    path: '/command-room',
    group: 'operations',
    requiredPermission: 'view_command_room',
  },
  {
    key: 'command_center',
    label: 'Command Center',
    path: '/command-center',
    group: 'operations',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'campaign_overview',
    label: 'Campaign Overview',
    path: '/campaign-overview',
    group: 'operations',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'geographic_performance',
    label: 'Geographic Performance',
    path: '/geographic-performance',
    group: 'analytics',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'daily_vaccination',
    label: 'Daily Vaccination',
    path: '/daily-vaccination',
    group: 'analytics',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'vaccine_utilization',
    label: 'Vaccine Utilization',
    path: '/vaccine-utilization',
    group: 'analytics',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'alerts',
    label: 'AFP & AEFI Alerts',
    path: '/alerts',
    group: 'operations',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'social_mobilization',
    label: 'Social Mobilization',
    path: '/social-mobilization',
    group: 'analytics',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'zero_dose',
    label: 'Zero Dose & Under-vacc.',
    path: '/zero-dose',
    group: 'analytics',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'reporting_completeness',
    label: 'Reporting Completeness',
    path: '/reporting-completeness',
    group: 'analytics',
    requiredPermission: 'view_dashboard',
  },
  {
    key: 'data_upload',
    label: 'Data Upload Center',
    path: '/data-upload',
    group: 'admin',
    requiredPermission: 'upload_data',
  },
  {
    key: 'file_vault',
    label: 'Document & File Vault',
    path: '/files',
    group: 'admin',
    requiredPermission: 'view_files',
  },
  {
    key: 'reports_analytics',
    label: 'Reports & Analytics',
    path: '/reports-analytics',
    group: 'analytics',
    requiredPermission: 'export_reports',
  },
  {
    key: 'user_management',
    label: 'User Management',
    path: '/user-management',
    group: 'admin',
    requiredPermission: 'manage_users',
  },
  {
    key: 'system_settings',
    label: 'System Settings',
    path: '/system-settings',
    group: 'admin',
    requiredPermission: 'manage_settings',
  },
  {
    key: 'branding_appearance',
    label: 'Branding & Appearance',
    path: '/branding',
    group: 'admin',
    requiredPermission: 'manage_branding',
  },
];

export function buildAuthContext(
  user: UserAccount | undefined | null,
  guestPublicOverviewEnabled: boolean,
  options?: {
    disabledModules?: string[];
    defaultLandingPage?: string;
  }
): AuthMeResponse {
  if (!user) {
    return {
      authenticated: false,
      user: {
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
      },
      permissions: guestPublicOverviewEnabled ? ['view_public_overview'] : [],
      navigation: [],
      defaultLanding: guestPublicOverviewEnabled ? 'public_overview' : 'login',
      guestPublicOverviewEnabled,
    };
  }

  const permsSet = ROLE_PERMISSIONS[user.role] ?? new Set<string>();
  const permissions = Array.from(permsSet);
  const disabledSet = new Set(options?.disabledModules ?? []);

  // Forced first-login password change or Command Room Viewer confinement
  const navigation =
    user.mustChangePassword || user.role === 'command_room_viewer'
      ? []
      : NAV_MODULE_REGISTRY.filter(
          (item) => permsSet.has(item.requiredPermission) && !disabledSet.has(item.key)
        );

  const configuredLanding = options?.defaultLandingPage || 'live_command_center';
  const navKeys = new Set(navigation.map((n) => n.key));
  const resolvedLanding = navKeys.has(configuredLanding)
    ? configuredLanding
    : navigation[0]?.key || 'live_command_center';

  const defaultLanding = user.mustChangePassword
    ? 'change_password'
    : user.role === 'command_room_viewer'
      ? 'command_room'
      : resolvedLanding;

  return {
    authenticated: true,
    user,
    permissions,
    navigation,
    defaultLanding,
    guestPublicOverviewEnabled,
  };
}

export interface AuthenticatedRequest extends Request {
  currentUser?: UserAccount;
}

export function attachSessionUser(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('opcms_token='));
    if (match) {
      token = decodeURIComponent(match.split('=')[1] ?? '');
    }
  }

  if (token) {
    const claims = verifySessionToken(token);
    if (claims) {
      const row = db
        .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
        .get(claims.sub) as Record<string, unknown> | undefined;
      if (row && Number(row.token_version ?? 1) === claims.tv) {
        req.currentUser = mapUserRow(row);
      }
    }
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({
        error: 'Authentication required. Please sign in to perform this action.',
      });
      return;
    }
    if (user.mustChangePassword) {
      res.status(403).json({
        error:
          'Password update required. Please change your initial password before accessing protected resources.',
      });
      return;
    }
    const perms = ROLE_PERMISSIONS[user.role];
    if (!perms || !perms.has(permission)) {
      res.status(403).json({
        error: `Access denied for role "${user.role}". Required permission: ${permission}.`,
      });
      return;
    }
    next();
  };
}

export function denyRoles(...restrictedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.currentUser;
    if (user && restrictedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Access denied for role "${user.role}". This endpoint is not permitted for Command Room Viewer accounts.`,
      });
      return;
    }
    next();
  };
}

export function recordAuditLog(params: {
  user?: UserAccount | null;
  action: string;
  entityType: string;
  entityId: string | number;
  details: string;
  ipAddress?: string;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (user_id, username, user_role, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.user?.id ?? null,
    params.user?.username ?? 'anonymous',
    params.user?.role ?? 'viewer',
    params.action,
    params.entityType,
    String(params.entityId),
    params.details,
    params.ipAddress ?? '127.0.0.1'
  );
}
