import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const getBadgeStyle = (s: string) => {
    switch (s.toLowerCase()) {
      case 'approved':
      case 'published':
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'submitted_for_approval':
      case 'in_review':
      case 'internal_review':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      case 'editing_in_progress':
      case 'assigned':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
      case 'changes_requested':
      case 'blocked':
      case 'failed':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/25';
      case 'not_started':
      case 'not_published':
      default:
        return 'bg-white/5 text-zinc-400 border-white/10';
    }
  };

  const formatText = (s: string) => {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${getBadgeStyle(status)} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]"></span>
      {formatText(status)}
    </span>
  );
};

interface StatCardProps {
  title: string;
  count: number;
  target?: number;
  icon: React.ReactNode;
  colorClass?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  count,
  target,
  icon,
  colorClass = 'text-blue-500 bg-blue-500/10',
  onClick
}) => {
  const percentage = target && target > 0 ? Math.min(100, Math.round((count * 100) / target)) : null;

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-3xl bg-white dark:bg-[#141417] border border-slate-200/80 dark:border-white/[0.08] shadow-sm hover:shadow-2xl transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:border-white/20 active:scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${colorClass}`}>
          {icon}
        </div>
        {percentage !== null && (
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-md border ${
            percentage >= 100 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-white/10 text-zinc-300 border-white/15'
          }`}>
            {percentage}%
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          {count}
        </span>
        {target !== undefined && (
          <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">
            / {target}
          </span>
        )}
      </div>

      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
        {title}
      </p>

      {target !== undefined && target > 0 && (
        <div className="w-full bg-slate-100 dark:bg-white/[0.06] rounded-full h-1.5 mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage && percentage >= 100 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
            }`}
            style={{ width: `${Math.min(100, (count / target) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};
