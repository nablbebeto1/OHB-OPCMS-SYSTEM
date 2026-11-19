import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type {
  AuthMeResponse,
  NavMenuItem,
  UserAccount,
  UserRole,
} from '../src/types/opcms.ts';

const AUTH_SECRET =
  process.env.OPCMS_SESSION_SECRET ||
  'ohb-opcms-self-hosted-session-signing-key-2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
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
}): string {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): {
  sub: number;
  username: string;
  role: UserRole;
} | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(encoded)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return {
      sub: Number(parsed.sub),
      username: String(parsed.username),
      role: parsed.role as UserRole,
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
  ]),
  central_command: new Set([
    'view_dashboard',
    'view_command_room',
    'correct_data',
    'manage_alerts',
    'export_reports',
    'upload_geo',
  ]),
  zone_officer: new Set([
    'view_dashboard',
    'view_command_room',
    'correct_data',
    'manage_alerts',
    'export_reports',
  ]),
  woreda_officer: new Set([
    'view_dashboard',
    'view_command_room',
    'export_reports',
  ]),
  viewer: new Set(['view_dashboard', 'view_command_room', 'export_reports']),
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
  guestPublicOverviewEnabled: boolean
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

  // Command Room Viewer is strictly confined to /command-room with zero sidebar navigation
  const navigation =
    user.role === 'command_room_viewer'
      ? []
      : NAV_MODULE_REGISTRY.filter((item) => permsSet.has(item.requiredPermission));

  const defaultLanding =
    user.role === 'command_room_viewer'
      ? 'command_room'
      : 'live_command_center';

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
      if (row) {
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
