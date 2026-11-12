import React, { useState } from 'react';
import { PublishingLog } from '../types';
import { 
  parseInsights, getVideoInsights, formatCompactNumber, SocialInsights,
  isYouTubeUrl, fetchYouTubeLiveStats, formatInsightsNote
} from '../lib/insights';
import { formatPlatformLabel } from '../lib/streak';
import { 
  ExternalLink, Eye, MessageSquare, Heart, Share2, 
  Sparkles, RefreshCw, Edit3, Clock, AlertCircle, X, Check, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Helper functions for embeds
export const getYouTubeEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch && shortsMatch[1]) {
      return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (watchMatch && watchMatch[1]) {
      return `https://www.youtube.com/embed/${watchMatch[1]}`;
    }
    if (url.includes('youtube.com/embed/')) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
};

export const getInstagramEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const match = url.match(/instagram\.com\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return `https://www.instagram.com/reel/${match[1]}/embed`;
    }
    return null;
  } catch {
    return null;
  }
};

export const getFacebookEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=false`;
    }
    return null;
  } catch {
    return null;
  }
};

export const getTwitterEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
    if (match && match[1]) {
      return `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}&theme=dark`;
    }
    return null;
  } catch {
    return null;
  }
};

export const getDriveEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
    return null;
  } catch {
    return null;
  }
};

export const isDirectVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url);
};

interface PublishedVideoPlayerCardProps {
  log: PublishingLog;
  canEditInsights?: boolean;
  onInsightsUpdated?: () => void;
}

export const PublishedVideoPlayerCard: React.FC<PublishedVideoPlayerCardProps> = ({
  log,
  canEditInsights = false,
  onInsightsUpdated
}) => {
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [editViews, setEditViews] = useState('');
  const [editComments, setEditComments] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editLikes, setEditLikes] = useState('');
  const [isSavingInsights, setIsSavingInsights] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const ins: SocialInsights = getVideoInsights(log);

  const ytEmbed = getYouTubeEmbedUrl(log.post_url);
  const igEmbed = getInstagramEmbedUrl(log.post_url);
  const fbEmbed = getFacebookEmbedUrl(log.post_url);
  const twEmbed = getTwitterEmbedUrl(log.post_url);
  const driveEmbed = getDriveEmbedUrl(log.post_url);
  const directVideo = isDirectVideoUrl(log.post_url);

  const isToday = (() => {
    if (!log.published_at) return false;
    const pubDate = new Date(log.published_at).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    return pubDate === today;
  })();

  const formatLogDateTime = (isoStr?: string): string => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);
    } catch {
      return isoStr;
    }
  };

  const openEditModal = () => {
    setEditViews(String(ins.views || ''));
    setEditComments(String(ins.comments || ''));
    setEditShares(String(ins.shares || ''));
    setEditLikes(String(ins.likes || ''));
    setShowInsightsModal(true);
  };

  const handleSaveInsights = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingInsights(true);
    try {
      const views = parseInt(editViews.replace(/,/g, ''), 10) || 0;
      const comments = parseInt(editComments.replace(/,/g, ''), 10) || 0;
      const shares = parseInt(editShares.replace(/,/g, ''), 10) || 0;
      const likes = parseInt(editLikes.replace(/,/g, ''), 10) || 0;

      const formatted = formatInsightsNote(log.notes, { views, comments, shares, likes });

      const { error } = await supabase
        .from('publishing_logs')
        .update({ notes: formatted })
        .eq('id', log.id);

      if (error) throw error;
      setShowInsightsModal(false);
      if (onInsightsUpdated) onInsightsUpdated();
    } catch (err: any) {
      alert(`Failed to save insights: ${err.message}`);
    } finally {
      setIsSavingInsights(false);
    }
  };

  const handleFetchYouTubeStats = async () => {
    if (!log.post_url || !isYouTubeUrl(log.post_url)) return;
    const apiKey = localStorage.getItem('STUDIO_YT_API_KEY');
    if (!apiKey) {
      alert('To fetch real-time YouTube insights automatically, enter your YouTube Data API v3 key in Settings.');
      return;
    }

    setIsFetchingLive(true);
    try {
      const stats = await fetchYouTubeLiveStats(log.post_url, apiKey);
      if (stats) {
        setEditViews(String(stats.views));
        setEditComments(String(stats.comments));
        setEditLikes(String(stats.likes));
        setFeedbackMsg('Fetched live stats from YouTube!');
        setTimeout(() => setFeedbackMsg(null), 3000);
      } else {
        alert('Could not retrieve YouTube video statistics. Check if video URL is valid and public.');
      }
    } catch (err: any) {
      alert(`YouTube fetch failed: ${err.message}`);
    } finally {
      setIsFetchingLive(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-md space-y-3.5 hover:border-zinc-700 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 border border-zinc-700 text-zinc-200">
            {formatPlatformLabel(log.platform)}
          </span>
          {log.channel_name && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-300">
              {log.channel_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isToday ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 border border-zinc-700 text-white flex items-center gap-1">
              <span>🔥</span>
              <span>POSTED TODAY</span>
            </span>
          ) : (
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatLogDateTime(log.published_at || log.reporting_date)}
            </span>
          )}
        </div>
      </div>

      {/* Video Title */}
      <h4 className="font-bold text-white text-sm sm:text-base leading-snug">
        {log.deliverable_title || log.notes || 'Published Social Video'}
      </h4>

      {/* Embedded Player */}
      {igEmbed ? (
        <div className="w-full flex justify-center bg-black rounded-2xl p-2 border border-zinc-800 shadow-md">
          <iframe
            src={igEmbed}
            title={log.deliverable_title || 'Instagram Reel Player'}
            className="w-full max-w-sm h-[520px] rounded-2xl border-0 overflow-hidden bg-black shadow-lg"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            scrolling="no"
          />
        </div>
      ) : ytEmbed ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
          <iframe
            src={ytEmbed}
            title={log.deliverable_title || 'YouTube Player'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      ) : fbEmbed ? (
        <div className="relative w-full aspect-video min-h-[340px] rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
          <iframe
            src={fbEmbed}
            title={log.deliverable_title || 'Facebook Video Player'}
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            scrolling="no"
          />
        </div>
      ) : twEmbed ? (
        <div className="w-full flex justify-center bg-black rounded-2xl p-2 border border-zinc-800 shadow-md">
          <iframe
            src={twEmbed}
            title={log.deliverable_title || 'X Tweet Video Player'}
            className="w-full max-w-md h-[460px] rounded-2xl border-0 overflow-hidden bg-black"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            scrolling="no"
          />
        </div>
      ) : driveEmbed ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
          <iframe
            src={driveEmbed}
            title={log.deliverable_title || 'Google Drive Player'}
            allow="autoplay"
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      ) : directVideo ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800">
          <video
            src={log.post_url}
            controls
            playsInline
            className="w-full h-full object-contain bg-black"
          />
        </div>
      ) : null}

      {/* Direct Link Row */}
      {log.post_url && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black border border-zinc-800">
          <span className="text-[11px] text-zinc-400 truncate max-w-[280px] sm:max-w-md">
            {log.post_url}
          </span>
          <a
            href={log.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
          >
            <span>Open Link</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Insights Section */}
      <div className="pt-2 border-t border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-zinc-300" />
            <span>VIDEO INSIGHTS</span>
            {ins.isRecorded && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-white text-black">
                ✓ Verified Real Stats
              </span>
            )}
          </span>

          <button
            onClick={openEditModal}
            className="px-3 py-1 rounded-xl bg-white text-black hover:bg-zinc-200 text-[11px] font-black flex items-center gap-1 transition shadow-sm"
          >
            <Edit3 className="w-3 h-3" />
            <span>{ins.isRecorded ? 'Update Real Stats' : '+ Enter Real Stats'}</span>
          </button>
        </div>

        {!ins.isRecorded ? (
          <div className="p-3.5 rounded-2xl bg-black border border-zinc-800/90 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-white">No live metrics logged yet</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Verified views, likes, and comments from Studio/Dashboard</div>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-400 shrink-0">
              0 VIEWS
            </div>
          </div>
        ) : (
          <>
            {/* Metric Badges */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-black border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 uppercase font-bold mb-0.5">
                  <Eye className="w-3 h-3 text-zinc-400" />
                  <span>Views</span>
                </div>
                <div className="text-sm font-black text-white">
                  {formatCompactNumber(ins.views)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 uppercase font-bold mb-0.5">
                  <Heart className="w-3 h-3 text-zinc-400" />
                  <span>Likes</span>
                </div>
                <div className="text-sm font-black text-white">
                  {formatCompactNumber(ins.likes)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 uppercase font-bold mb-0.5">
                  <MessageSquare className="w-3 h-3 text-zinc-400" />
                  <span>Comments</span>
                </div>
                <div className="text-sm font-black text-white">
                  {formatCompactNumber(ins.comments)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 uppercase font-bold mb-0.5">
                  <Share2 className="w-3 h-3 text-zinc-400" />
                  <span>Shares</span>
                </div>
                <div className="text-sm font-black text-white">
                  {formatCompactNumber(ins.shares)}
                </div>
              </div>
            </div>

            {/* Live Engagement Rate Footer */}
            <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-900 flex-wrap gap-1">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Verified Real Performance</span>
              </span>
              <span>
                Engagement: <strong className="text-white font-black">{ins.views > 0 ? (((ins.likes + ins.comments + ins.shares) / ins.views) * 100).toFixed(1) : '0'}%</strong>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Edit Insights Modal */}
      {showInsightsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white">Update Video Insights</h3>
                <p className="text-[11px] text-zinc-400 truncate max-w-xs">{log.deliverable_title || 'Social Video'}</p>
              </div>
              <button
                onClick={() => setShowInsightsModal(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isYouTubeUrl(log.post_url) && (
              <div className="p-3 rounded-2xl bg-black border border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-300 font-bold">Auto-fetch YouTube Live Stats</span>
                <button
                  type="button"
                  onClick={handleFetchYouTubeStats}
                  disabled={isFetchingLive}
                  className="px-3 py-1.5 rounded-xl bg-white text-black font-black text-xs hover:bg-zinc-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isFetchingLive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Fetch API</span>
                </button>
              </div>
            )}

            {feedbackMsg && (
              <div className="p-2.5 rounded-xl bg-zinc-800 text-white text-xs font-bold text-center border border-zinc-700">
                {feedbackMsg}
              </div>
            )}

            <form onSubmit={handleSaveInsights} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">Views</label>
                  <input
                    type="number"
                    value={editViews}
                    onChange={(e) => setEditViews(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full px-3 py-2 rounded-xl bg-black border border-zinc-800 text-white text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">Likes</label>
                  <input
                    type="number"
                    value={editLikes}
                    onChange={(e) => setEditLikes(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full px-3 py-2 rounded-xl bg-black border border-zinc-800 text-white text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">Comments</label>
                  <input
                    type="number"
                    value={editComments}
                    onChange={(e) => setEditComments(e.target.value)}
                    placeholder="e.g. 190"
                    className="w-full px-3 py-2 rounded-xl bg-black border border-zinc-800 text-white text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">Shares</label>
                  <input
                    type="number"
                    value={editShares}
                    onChange={(e) => setEditShares(e.target.value)}
                    placeholder="e.g. 340"
                    className="w-full px-3 py-2 rounded-xl bg-black border border-zinc-800 text-white text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInsightsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInsights}
                  className="px-4 py-2 rounded-xl bg-white text-black text-xs font-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {isSavingInsights ? 'Saving...' : 'Save Insights'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
