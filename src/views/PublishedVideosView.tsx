import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { PublishingLog, Profile, PlatformType } from '../types';
import { filterPublishingLogs } from '../lib/deletionFilter';
import { isPublishingLogForClient, getClientBrandName } from '../lib/clientIsolation';
import { PublishedVideoPlayerCard } from '../components/PublishedVideoPlayerCard';
import { 
  Share2, Search, RefreshCw, Film, Camera, Tv, 
  Sparkles, Layers, Calendar, ExternalLink 
} from 'lucide-react';

interface PublishedVideosViewProps {
  client?: Profile | null;
  canEditInsights?: boolean;
}

export const PublishedVideosView: React.FC<PublishedVideosViewProps> = ({
  client,
  canEditInsights = false
}) => {
  const [logs, setLogs] = useState<PublishingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const brandName = client ? getClientBrandName(client) : '';

  const fetchPublishedVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('publishing_logs')
        .select(`
          *,
          deliverables:deliverable_id (title, deliverable_type)
        `)
        .order('published_at', { ascending: false });

      if (!error && data) {
        const cleanLogs = filterPublishingLogs(data as PublishingLog[]);
        setLogs(cleanLogs);
      }
    } catch (err) {
      console.error('Failed to load published videos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPublishedVideos();

    const channel = supabase
      .channel('published-videos-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_logs' }, () => {
        fetchPublishedVideos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchPublishedVideos();
  };

  // Filter for client if in client portal
  const clientFilteredLogs = useMemo(() => {
    if (!client) return logs;
    // Client isolation filter
    return logs.filter(log => isPublishingLogForClient(log, client, new Set()));
  }, [logs, client]);

  // Platform and search filtering
  const displayLogs = useMemo(() => {
    return clientFilteredLogs.filter(log => {
      if (selectedPlatform !== 'all') {
        const plat = (log.platform || '').toLowerCase();
        if (selectedPlatform === 'instagram_reels' && plat !== 'instagram_reels') return false;
        if (selectedPlatform === 'youtube_shorts' && plat !== 'youtube_shorts') return false;
        if (selectedPlatform === 'youtube_full' && plat !== 'youtube_full') return false;
        if (selectedPlatform === 'facebook' && plat !== 'facebook') return false;
        if (selectedPlatform === 'x' && plat !== 'x') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (log.deliverable_title || '').toLowerCase();
        const channel = (log.channel_name || '').toLowerCase();
        const notes = (log.notes || '').toLowerCase();
        if (!title.includes(q) && !channel.includes(q) && !notes.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [clientFilteredLogs, selectedPlatform, searchQuery]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return clientFilteredLogs.filter(l => {
      if (!l.published_at) return false;
      return new Date(l.published_at).toISOString().split('T')[0] === today;
    }).length;
  }, [clientFilteredLogs]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Share2 className="w-3 h-3 text-white" />
                <span>SMM Published Videos</span>
              </span>
              {brandName && (
                <span className="text-xs font-bold text-zinc-400">
                  {brandName}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {client ? `${brandName || 'Client'} Published Archive` : 'Studio Published Content'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Watch live published reels, full podcast episodes, and track real-time social insights (views, comments, shares, likes) across all channels.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              className="p-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-all active:scale-95"
              title="Refresh Published Content"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing || loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-zinc-800/80">
          <div className="p-3.5 rounded-2xl bg-black border border-zinc-800">
            <span className="text-[11px] font-bold text-zinc-400">Total Published Videos</span>
            <div className="text-2xl font-black text-white mt-0.5">{clientFilteredLogs.length}</div>
            <span className="text-[10px] text-zinc-500 font-medium">Live on Social Media</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-black border border-zinc-800">
            <span className="text-[11px] font-bold text-zinc-400">Published Today</span>
            <div className="text-2xl font-black text-white mt-0.5 flex items-center gap-1.5">
              <span>{todayCount}</span>
              {todayCount > 0 && <span className="text-xs text-white">🔥</span>}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Delivered by SMM</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-black border border-zinc-800 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-zinc-400">Multi-Platform Video</span>
            <div className="text-sm font-black text-white mt-1.5 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">IG Reels</span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">YouTube</span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">Facebook</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-medium mt-1 block">In-App Playback Enabled</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {[
              { id: 'all', label: 'All Channels' },
              { id: 'instagram_reels', label: 'Instagram Reels' },
              { id: 'youtube_shorts', label: 'YouTube Shorts' },
              { id: 'youtube_full', label: 'YouTube Full' },
              { id: 'facebook', label: 'Facebook' },
              { id: 'x', label: 'X (Twitter)' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedPlatform(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  selectedPlatform === tab.id
                    ? 'bg-white text-black font-black shadow-md'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search published videos..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Videos List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-500">Loading published videos...</p>
        </div>
      ) : displayLogs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800">
          <Share2 className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">No published videos found</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            {client
              ? `When your Social Media Manager publishes videos for ${brandName || 'your brand'}, they will appear here with in-app video playback and live insights.`
              : 'When the Social Media Manager publishes video cuts to social media, they will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayLogs.map(log => (
            <PublishedVideoPlayerCard
              key={log.id}
              log={log}
              canEditInsights={canEditInsights}
              onInsightsUpdated={fetchPublishedVideos}
            />
          ))}
        </div>
      )}
    </div>
  );
};
