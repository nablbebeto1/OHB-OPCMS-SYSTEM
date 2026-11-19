import React, { useState } from 'react';
import type { BrandingConfig } from '../types/opcms';

interface BrandLogoProps {
  branding: BrandingConfig | null;
  overrideSrc?: string | null;
  variant: 'login' | 'header' | 'sidebar' | 'command_room' | 'preview';
  className?: string;
}

const SIZE_CLASSES: Record<BrandLogoProps['variant'], string> = {
  login: 'h-14 max-w-[200px]',
  header: 'h-9 max-w-[140px]',
  sidebar: 'h-9 max-w-[140px]',
  command_room: 'h-10 max-w-[160px]',
  preview: 'h-8 max-w-[120px]',
};

const SVG_SIZES: Record<BrandLogoProps['variant'], string> = {
  login: 'w-14 h-14',
  header: 'w-9 h-9',
  sidebar: 'w-9 h-9',
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

export const BrandLogo: React.FC<BrandLogoProps> = ({
  branding,
  overrideSrc,
  variant,
  className = '',
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = overrideSrc !== undefined ? overrideSrc : branding?.logoUrl ?? null;

  if (!src || failedSrc === src) {
    return <DefaultOhbEmblem className={`${SVG_SIZES[variant]} ${className}`} />;
  }

  return (
    <img
      src={src}
      alt="Oromia Health Bureau System Logo"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`${SIZE_CLASSES[variant]} w-auto object-contain shrink-0 ${className}`}
    />
  );
};
