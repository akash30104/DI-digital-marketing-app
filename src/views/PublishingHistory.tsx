import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlatformType, PublishingLog } from '../types';
import { getLogChannelName } from '../lib/streak';
import { 
  History, Search, ExternalLink, Calendar, Download, 
  Youtube, Instagram, Send, RefreshCw, CheckCircle2, Radio 
} from 'lucide-react';

export const PublishingHistory: React.FC = () => {
  const [logs, setLogs] = useState<PublishingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<'today' | '7days' | '30days' | 'all'>('all');

  const fetchLogs = async () => {
    try {
      let query = supabase
        .from('publishing_logs')
        .select(`
          *,
          deliverables (title, deliverable_type, recordings (title, episode_number)),
          profiles:published_by (full_name)
        `)
        .order('published_at', { ascending: false });

      if (timeframe === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        query = query.eq('reporting_date', todayStr);
      } else if (timeframe === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        query = query.gte('reporting_date', d.toISOString().split('T')[0]);
      } else if (timeframe === '30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        query = query.gte('reporting_date', d.toISOString().split('T')[0]);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const mapped: PublishingLog[] = data.map((item: any) => ({
          ...item,
          deliverable_title: item.deliverables?.title,
          publisher_name: item.profiles?.full_name || 'Team Member',
          channel_name: getLogChannelName(item)
        }));
        setLogs(mapped);
      }
    } catch (err) {
      console.error('Failed to load publishing history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [timeframe]);

  const getPlatformIcon = (platform: PlatformType) => {
    switch (platform) {
      case 'youtube_shorts':
      case 'youtube_full':
        return <Youtube className="w-4 h-4 text-zinc-200" />;
      case 'instagram_reels':
        return <Instagram className="w-4 h-4 text-zinc-200" />;
      default:
        return <Send className="w-4 h-4 text-zinc-200" />;
    }
  };

  const getPlatformLabel = (platform: PlatformType) => {
    switch (platform) {
      case 'youtube_shorts':
        return 'YouTube Shorts';
      case 'youtube_full':
        return 'YouTube Full-Length';
      case 'instagram_reels':
        return 'Instagram Reels';
      default:
        return 'Other Platform';
    }
  };

  const formatIST = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }) + ' IST';
    } catch {
      return isoString;
    }
  };

  const filteredLogs = logs.filter(log => {
    if (platformFilter !== 'all' && log.platform !== platformFilter) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = log.deliverable_title?.toLowerCase().includes(q);
      const matchUrl = log.post_url?.toLowerCase().includes(q);
      const matchUser = log.publisher_name?.toLowerCase().includes(q);
      const matchChannel = log.channel_name?.toLowerCase().includes(q);
      if (!matchTitle && !matchUrl && !matchUser && !matchChannel) return false;
    }
    return true;
  });

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ['Platform', 'Channel Name', 'Deliverable Title', 'Post URL', 'Published By', 'Published At (IST)', 'Reporting Date'];
    const rows = filteredLogs.map(log => [
      getPlatformLabel(log.platform),
      `"${(log.channel_name || '').replace(/"/g, '""')}"`,
      `"${(log.deliverable_title || '').replace(/"/g, '""')}"`,
      log.post_url || '',
      `"${(log.publisher_name || '').replace(/"/g, '""')}"`,
      formatIST(log.published_at),
      log.reporting_date
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `publishing_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <History className="w-6 h-6 text-white" />
            Publishing History
          </h1>
          <p className="text-xs text-zinc-400">
            Audit log of all verified social media publications with live links
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-black" />
            Export CSV
          </button>

          <button
            onClick={() => { setRefreshing(true); fetchLogs(); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-zinc-900 p-4 rounded-3xl border border-zinc-800 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by video title, link, or publisher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Timeframe Selector */}
          <div className="flex bg-black p-1 rounded-xl border border-zinc-800">
            {(['all', 'today', '7days', '30days'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors capitalize ${
                  timeframe === tf
                    ? 'bg-white text-black font-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tf === 'all' ? 'All Time' : tf === '7days' ? 'Last 7 Days' : tf === '30days' ? 'Last 30 Days' : 'Today'}
              </button>
            ))}
          </div>

          {/* Platform Selector */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="all">All Platforms ({logs.length})</option>
            <option value="youtube_shorts">YouTube Shorts</option>
            <option value="youtube_full">YouTube Full-Length</option>
            <option value="instagram_reels">Instagram Reels</option>
          </select>
        </div>
      </div>

      {/* List of Published Logs */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-zinc-600 border-t-white rounded-full mx-auto" />
          <p className="mt-3 text-xs text-zinc-500">Loading publication history...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="py-16 text-center bg-zinc-900 rounded-3xl border border-dashed border-zinc-800 p-8">
          <History className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">No publication records found</h3>
          <p className="text-xs text-zinc-400 mt-1">
            When approved videos are marked as published with live post URLs, they appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map(log => (
            <div
              key={log.id}
              className="bg-zinc-900 rounded-3xl border border-zinc-800 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-black border border-zinc-800 shrink-0">
                  {getPlatformIcon(log.platform)}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      {getPlatformLabel(log.platform)}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1">
                      <Radio className="w-3 h-3 text-zinc-400" />
                      {log.channel_name || 'DI Official'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                      Live
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {formatIST(log.published_at)}
                    </span>
                  </div>

                  <h4 className="text-sm font-medium text-white line-clamp-1">
                    {log.deliverable_title || 'Deliverable'}
                  </h4>

                  <p className="text-xs text-zinc-400 mt-0.5">
                    Published by: <span className="font-semibold text-zinc-200">{log.publisher_name}</span>
                  </p>
                </div>
              </div>

              {log.post_url && (
                <a
                  href={log.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black transition-colors shrink-0 shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Live Post
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
