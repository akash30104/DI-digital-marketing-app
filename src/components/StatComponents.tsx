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
        return {
          pill: 'bg-zinc-850 text-white border-zinc-600',
          dot: 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]'
        };
      case 'submitted_for_approval':
      case 'in_review':
      case 'internal_review':
        return {
          pill: 'bg-zinc-900 text-zinc-200 border-zinc-700',
          dot: 'bg-zinc-300'
        };
      case 'editing_in_progress':
      case 'assigned':
        return {
          pill: 'bg-zinc-900 text-zinc-200 border-zinc-700',
          dot: 'bg-zinc-400'
        };
      case 'changes_requested':
      case 'blocked':
      case 'failed':
        return {
          pill: 'bg-zinc-900 text-zinc-300 border-zinc-700',
          dot: 'border border-zinc-400 bg-transparent'
        };
      case 'not_started':
      case 'not_published':
      default:
        return {
          pill: 'bg-zinc-900/60 text-zinc-400 border-zinc-800',
          dot: 'bg-zinc-600'
        };
    }
  };

  const formatText = (s: string) => {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const style = getBadgeStyle(status);

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${style.pill} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
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
  colorClass = 'text-zinc-200 bg-zinc-800 border-zinc-700/60',
  onClick
}) => {
  const percentage = target && target > 0 ? Math.min(100, Math.round((count * 100) / target)) : null;

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-sm hover:border-zinc-700 hover:shadow-2xl transition-all duration-300 ${
        onClick ? 'cursor-pointer active:scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center bg-zinc-800 border border-zinc-700/60 text-zinc-200`}>
          {icon}
        </div>
        {percentage !== null && (
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-zinc-800 border-zinc-700 text-zinc-300">
            {percentage}%
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black tracking-tight text-white">
          {count}
        </span>
        {target !== undefined && (
          <span className="text-xs font-semibold text-zinc-500">
            / {target}
          </span>
        )}
      </div>

      <p className="text-xs font-medium text-zinc-400 mt-0.5 truncate">
        {title}
      </p>

      {target !== undefined && target > 0 && (
        <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage && percentage >= 100 ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]' : 'bg-zinc-300'
            }`}
            style={{ width: `${Math.min(100, (count / target) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};
