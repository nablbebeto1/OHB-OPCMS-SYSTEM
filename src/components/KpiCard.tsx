import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'neutral' | 'blue' | 'deep' | 'green' | 'orange' | 'red';
  onClick?: () => void;
}

const TONE_VALUE_CLASS: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'text-slate-900',
  blue: 'text-[#3A99CF]',
  deep: 'text-[#485EA9]',
  green: 'text-emerald-700',
  orange: 'text-[#D29441]',
  red: 'text-red-700',
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  tone = 'neutral',
  onClick,
}) => {
  const content = (
    <div className="flex flex-col justify-between h-full">
      <div className="text-xs font-medium text-slate-500 tracking-tight truncate">
        {label}
      </div>
      <div
        className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${TONE_VALUE_CLASS[tone]}`}
      >
        {value}
      </div>
      {subtext ? (
        <div className="mt-1.5 text-xs text-slate-500 truncate">{subtext}</div>
      ) : null}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-[#3A99CF] transition-colors focus-visible:outline-2 focus-visible:outline-[#3A99CF]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      {content}
    </div>
  );
};
