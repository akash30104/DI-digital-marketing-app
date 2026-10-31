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
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'submitted_for_approval':
      case 'in_review':
      case 'internal_review':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'editing_in_progress':
      case 'assigned':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'changes_requested':
      case 'blocked':
      case 'failed':
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'not_started':
      case 'not_published':
      default:
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20';
    }
  };

  const formatText = (s: string) => {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getBadgeStyle(status)} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
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
      className={`p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-sm transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-blue-500/50 hover:shadow-md active:scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorClass}`}>
          {icon}
        </div>
        {percentage !== null && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            percentage >= 100 
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}>
            {percentage}%
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {count}
        </span>
        {target !== undefined && (
          <span className="text-xs font-semibold text-slate-400">
            / {target}
          </span>
        )}
      </div>

      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
        {title}
      </p>

      {target !== undefined && target > 0 && (
        <div className="w-full bg-slate-100 dark:bg-slate-700/60 rounded-full h-1.5 mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage && percentage >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(100, (count / target) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};
