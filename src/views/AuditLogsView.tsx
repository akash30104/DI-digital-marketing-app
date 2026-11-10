import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { getAuditLogs } from '../lib/api';
import { Shield, Clock, Search, Filter, RefreshCw } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadLogs = async () => {
    setIsLoading(true);
    const data = await getAuditLogs(150);
    setLogs(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const formatActionName = (action: string) => {
    return action.replace(/_/g, ' ').toUpperCase();
  };

  const getActionBadge = (action: string) => {
    if (action.includes('approved') || action.includes('accepted')) {
      return 'bg-white text-black font-black';
    }
    if (action.includes('rejected') || action.includes('suspended') || action.includes('revoked')) {
      return 'bg-zinc-800 text-zinc-300 border border-zinc-700';
    }
    return 'bg-zinc-800 text-zinc-300 border border-zinc-700';
  };

  const filteredLogs = logs.filter(l => {
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const detailsStr = JSON.stringify(l.details || {}).toLowerCase();
      return (
        l.action.toLowerCase().includes(q) ||
        (l.actor_email || l.user_email || '').toLowerCase().includes(q) ||
        detailsStr.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">System Audit Logs</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Tamper-evident audit trail of all team invitations, task submissions, approvals, role modifications, and publishing proofs.
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Trail</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <Search className="w-4 h-4 text-zinc-500 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by actor email, action, or metadata..."
            className="bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none w-full"
          />
        </div>

        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-semibold focus:outline-none"
        >
          <option value="all">All Actions</option>
          <option value="invite_sent">Invite Sent</option>
          <option value="invite_accepted">Invite Accepted</option>
          <option value="invite_revoked">Invite Revoked</option>
          <option value="task_assigned">Task Assigned</option>
          <option value="video_submitted">Video Submitted</option>
          <option value="approval_processed">Approval Processed</option>
          <option value="proof_submitted">Proof Submitted</option>
          <option value="user_suspended">User Suspended</option>
          <option value="user_reinstated">User Reinstated</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Context Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No audit records match the current criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] tracking-wider ${getActionBadge(log.action)}`}>
                        {formatActionName(log.action)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white font-semibold">
                      {log.actor_email || log.user_email || 'System'}
                    </td>
                    <td className="py-3 px-4 text-zinc-300 font-mono text-[11px]">
                      {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px] max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
