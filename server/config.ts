import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export type AuthSecretSource =
  | 'SECRET_KEY'
  | 'OPCMS_SESSION_SECRET'
  | 'SECRET_KEY+OPCMS_SESSION_SECRET'
  | 'development-fallback'
  | 'NONE';

export interface RuntimeConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  maxUploadMb: number;
  secretKeyPresent: boolean;
  sessionSecretPresent: boolean;
  previewSecretPresent: boolean;
  selectedSecretSource: AuthSecretSource;
  secretMeetsMinLength: boolean;
  authSecret: string;
  previewSecret: string;
}

const MIN_SECRET_LENGTH = 32;
const DEV_FALLBACK_SECRET = 'ohb-opcms-dev-session-signing-key-2026';

const INSECURE_PLACEHOLDER_SECRETS = new Set([
  '',
  'change-this-to-a-long-random-hex-secret',
  'change-this-to-a-long-random-secret',
  'replace-with-openssl-rand-hex-32-secret',
  'ohb-opcms-self-hosted-session-signing-key-2026',
  'secret',
  'changeme',
  'password',
]);

const SECRET_MANAGER_RESOURCE_PATTERN =
  /^(projects\/[^/\s]+\/secrets\/[^/\s]+(\/versions\/[^/\s]+)?|secrets\/[^/\s]+(\/versions\/[^/\s]+)?)$/i;

let cachedRuntimeConfig: RuntimeConfig | null = null;
let envLoaded = false;

function loadEnvironmentFiles(): void {
  if (envLoaded) return;
  envLoaded = true;

  // Never override platform-injected Cloud Run / Secret Manager environment variables.
  const rootEnvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath, override: false, quiet: true });
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function validateSecretCandidate(
  varName: string,
  rawValue: string | undefined
): { present: boolean; value: string | null; reason: string | null } {
  if (rawValue === undefined) {
    return { present: false, value: null, reason: null };
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return {
      present: true,
      value: null,
      reason: `${varName} is set in the environment but is empty or whitespace-only.`,
    };
  }

  if (SECRET_MANAGER_RESOURCE_PATTERN.test(trimmed)) {
    return {
      present: true,
      value: null,
      reason: `${varName} appears to contain a Secret Manager resource path rather than the secret payload. Configure Cloud Run to inject the secret value into ${varName} (Secret: ohb-opcms-secret-key, Version: latest).`,
    };
  }

  if (INSECURE_PLACEHOLDER_SECRETS.has(trimmed.toLowerCase())) {
    return {
      present: true,
      value: null,
      reason: `${varName} contains a known placeholder or insecure default value. Replace it with a strong random secret (>= ${MIN_SECRET_LENGTH} characters).`,
    };
  }

  if (trimmed.length < MIN_SECRET_LENGTH) {
    return {
      present: true,
      value: null,
      reason: `${varName} is shorter than the required minimum of ${MIN_SECRET_LENGTH} characters.`,
    };
  }

  return { present: true, value: trimmed, reason: null };
}

export function resolvePortFromEnv(rawPort = process.env.PORT): number {
  const normalized = (rawPort ?? '').trim();
  if (!normalized) return 3000;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `Invalid PORT environment variable value "${normalized}". Expected an integer between 1 and 65535.`
    );
  }
  return parsed;
}

export function resetRuntimeConfigForTesting(): void {
  cachedRuntimeConfig = null;
  envLoaded = false;
}

export function initializeRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;

  loadEnvironmentFiles();

  const nodeEnv = (process.env.NODE_ENV || 'development').trim() || 'development';
  const isProduction = nodeEnv === 'production';
  const port = resolvePortFromEnv(process.env.PORT);
  const maxUploadMb = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 25) || 25);

  const primary = validateSecretCandidate('SECRET_KEY', process.env.SECRET_KEY);
  const secondary = validateSecretCandidate(
    'OPCMS_SESSION_SECRET',
    process.env.OPCMS_SESSION_SECRET
  );
  const preview = validateSecretCandidate(
    'FILE_PREVIEW_SECRET',
    process.env.FILE_PREVIEW_SECRET
  );

  // Explicit validation if either variable was provided with an invalid value
  if (primary.present && primary.reason) {
    logSafeDiagnosticSnapshot({
      nodeEnv,
      isProduction,
      port,
      secretKeyPresent: primary.present,
      sessionSecretPresent: secondary.present,
      previewSecretPresent: preview.present,
      selectedSecretSource: 'NONE',
      secretMeetsMinLength: false,
    });
    throw new Error(primary.reason);
  }

  if (secondary.present && secondary.reason) {
    logSafeDiagnosticSnapshot({
      nodeEnv,
      isProduction,
      port,
      secretKeyPresent: primary.present,
      sessionSecretPresent: secondary.present,
      previewSecretPresent: preview.present,
      selectedSecretSource: 'NONE',
      secretMeetsMinLength: false,
    });
    throw new Error(secondary.reason);
  }

  // Conflict detection: both SECRET_KEY and OPCMS_SESSION_SECRET provided with different values
  if (primary.value && secondary.value && !timingSafeStringEqual(primary.value, secondary.value)) {
    logSafeDiagnosticSnapshot({
      nodeEnv,
      isProduction,
      port,
      secretKeyPresent: true,
      sessionSecretPresent: true,
      previewSecretPresent: preview.present,
      selectedSecretSource: 'NONE',
      secretMeetsMinLength: false,
    });
    throw new Error(
      'Conflicting authentication secrets detected: both SECRET_KEY and OPCMS_SESSION_SECRET are configured with different values. Remove one variable or make both identical so token signing and verification remain consistent.'
    );
  }

  if (preview.present && preview.reason) {
    throw new Error(preview.reason);
  }

  let authSecret = '';
  let selectedSecretSource: AuthSecretSource = 'NONE';

  if (primary.value && secondary.value) {
    authSecret = primary.value;
    selectedSecretSource = 'SECRET_KEY+OPCMS_SESSION_SECRET';
  } else if (primary.value) {
    authSecret = primary.value;
    selectedSecretSource = 'SECRET_KEY';
  } else if (secondary.value) {
    authSecret = secondary.value;
    selectedSecretSource = 'OPCMS_SESSION_SECRET';
  } else if (!isProduction) {
    authSecret = DEV_FALLBACK_SECRET;
    selectedSecretSource = 'development-fallback';
  } else {
    logSafeDiagnosticSnapshot({
      nodeEnv,
      isProduction,
      port,
      secretKeyPresent: primary.present,
      sessionSecretPresent: secondary.present,
      previewSecretPresent: preview.present,
      selectedSecretSource: 'NONE',
      secretMeetsMinLength: false,
    });
    throw new Error(
      [
        'Missing production authentication secret in process.env.',
        'Expected Cloud Run environment variable SECRET_KEY (mapped to Secret Manager secret "ohb-opcms-secret-key", version "latest") or alternative OPCMS_SESSION_SECRET (>= 32 characters).',
        'Verify that SECRET_KEY is bound on the active Cloud Run / AI Studio published service revision and redeploy.',
      ].join(' ')
    );
  }

  const resolvedConfig: RuntimeConfig = {
    nodeEnv,
    isProduction,
    port,
    maxUploadMb,
    secretKeyPresent: primary.present,
    sessionSecretPresent: secondary.present,
    previewSecretPresent: preview.present,
    selectedSecretSource,
    secretMeetsMinLength: authSecret.length >= MIN_SECRET_LENGTH,
    authSecret,
    previewSecret: preview.value || authSecret,
  };

  cachedRuntimeConfig = resolvedConfig;
  return resolvedConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!cachedRuntimeConfig) {
    return initializeRuntimeConfig();
  }
  return cachedRuntimeConfig;
}

export function logSafeDiagnosticSnapshot(
  cfg: Pick<
    RuntimeConfig,
    | 'nodeEnv'
    | 'isProduction'
    | 'port'
    | 'secretKeyPresent'
    | 'sessionSecretPresent'
    | 'previewSecretPresent'
    | 'selectedSecretSource'
    | 'secretMeetsMinLength'
  >
): void {
  console.info(
    [
      '[OHB-OPCMS Config]',
      `NODE_ENV=${cfg.nodeEnv}`,
      `production=${cfg.isProduction}`,
      `port=${cfg.port}`,
      `SECRET_KEY_present=${cfg.secretKeyPresent}`,
      `OPCMS_SESSION_SECRET_present=${cfg.sessionSecretPresent}`,
      `FILE_PREVIEW_SECRET_present=${cfg.previewSecretPresent}`,
      `selected_secret_var=${cfg.selectedSecretSource}`,
      `secret_min_length_met=${cfg.secretMeetsMinLength}`,
    ].join(' ')
  );
}
