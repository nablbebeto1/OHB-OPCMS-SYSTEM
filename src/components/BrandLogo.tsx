import React, { useState } from 'react';
import type { BrandingConfig } from '../types/opcms';

interface BrandLogoProps {
  branding: BrandingConfig | null;
  overrideSrc?: string | null;
  variant: 'main' | 'login' | 'header' | 'sidebar' | 'footer' | 'command_room' | 'preview';
  className?: string;
}

const SIZE_CLASSES: Record<BrandLogoProps['variant'], string> = {
  main: 'h-12 max-w-[180px]',
  login: 'h-14 max-w-[200px]',
  header: 'h-9 max-w-[140px]',
  sidebar: 'h-9 max-w-[140px]',
  footer: 'h-6 max-w-[110px]',
  command_room: 'h-10 max-w-[160px]',
  preview: 'h-8 max-w-[120px]',
};

const SVG_SIZES: Record<BrandLogoProps['variant'], string> = {
  main: 'w-12 h-12',
  login: 'w-14 h-14',
  header: 'w-9 h-9',
  sidebar: 'w-9 h-9',
  footer: 'w-6 h-6',
  command_room: 'w-10 h-10',
  preview: 'w-8 h-8',
};

export const DefaultOhbEmblem: React.FC<{ className?: string }> = ({
  className = 'w-9 h-9',
}) => (
  <svg viewBox="0 0 40 40" className={`${className} shrink-0`} aria-hidden="true">
    <rect width="40" height="40" rx="8" fill="#485EA9" />
    <circle cx="20" cy="20" r="12" fill="none" stroke="#3A99CF" strokeWidth="2.5" />
    <path
      d="M20 11v18M11 20h18"
      stroke="#FFFFFF"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle cx="20" cy="20" r="3" fill="#D29441" />
  </svg>
);

export function resolveBrandLogoUrl(
  branding: BrandingConfig | null | undefined,
  variant: BrandLogoProps['variant']
): string | null {
  if (!branding) return null;
  const assets = branding.assets;
  const mainLogo = assets?.logo?.url ?? branding.logoUrl ?? null;
  const appLogo = assets?.app_logo?.url ?? null;

  switch (variant) {
    case 'login':
      return assets?.login_logo?.url ?? appLogo ?? mainLogo;
    case 'header':
      return assets?.header_logo?.url ?? appLogo ?? mainLogo;
    case 'sidebar':
      return appLogo ?? assets?.header_logo?.url ?? mainLogo;
    case 'footer':
      return assets?.footer_logo?.url ?? appLogo ?? mainLogo;
    case 'command_room':
      return assets?.command_center_logo?.url ?? appLogo ?? mainLogo;
    case 'main':
    case 'preview':
    default:
      return mainLogo ?? appLogo;
  }
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  branding,
  overrideSrc,
  variant,
  className = '',
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src =
    overrideSrc !== undefined ? overrideSrc : resolveBrandLogoUrl(branding, variant);

  if (!src || failedSrc === src) {
    return <DefaultOhbEmblem className={`${SVG_SIZES[variant]} ${className}`} />;
  }

  return (
    <img
      src={src}
      alt={
        branding?.identity?.organizationName
          ? `${branding.identity.organizationName} Logo`
          : 'Oromia Health Bureau System Logo'
      }
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`${SIZE_CLASSES[variant]} w-auto object-contain shrink-0 ${className}`}
    />
  );
};
