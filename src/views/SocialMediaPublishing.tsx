import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Deliverable, PublishingLog, PlatformType } from '../types';
import { StatusBadge } from '../components/StatComponents';
import { Send, PlaySquare, Camera, ExternalLink, Check, X, CheckCircle2 } from 'lucide-react';

export const SocialMediaPublishing: React.FC = () => {
  const { currentUser } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [publishedToday, setPublishedToday] = useState<PublishingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formatFilter, setFormatFilter] = useState<'all' | 'reel' | 'full_length_video'>('all');

  // Confirmation Modal
  const [confirmTarget, setConfirmTarget] = useState<{ deliverable: Deliverable; platform: PlatformType } | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    try {
      // 1. Fetch Approved Deliverables
      const { data: dels } = await supabase
        .from('deliverables')
        .select('*')
        .eq('editing_status', 'approved')
        .order('created_at', { ascending: false });

      if (dels) {
        setDeliverables(dels as Deliverable[]);
      }

      // 2. Fetch Today's Publishing Logs
      const { data: logs } = await supabase
        .from('publishing_logs')
        .select('*')
        .eq('reporting_date', todayStr);

      if (logs) {
        setPublishedToday(logs as PublishingLog[]);
      }
    } catch (e) {
      console.error('Failed to load publishing data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfirmPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmTarget || !currentUser) return;

    setIsPublishing(true);
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    try {
      const { data, error } = await supabase
        .from('publishing_logs')
        .insert([
          {
            deliverable_id: confirmTarget.deliverable.id,
            recording_id: confirmTarget.deliverable.recording_id,
            platform: confirmTarget.platform,
            publication_status: 'published',
            published_by: currentUser.id,
            published_at: new Date().toISOString(),
            post_url: postUrl.trim() || null,
            notes: notes.trim() || null,
            reporting_date: todayStr
          }
        ])
        .select()
        .single();

      if (!error && data) {
        setPublishedToday(prev => [...prev, data as PublishingLog]);
        showToast(`Published to ${formatPlatformName(confirmTarget.platform)}! 🎉`);
        setConfirmTarget(null);
        setPostUrl('');
        setNotes('');
      }
    } catch (e) {
      console.error('Error recording publication:', e);
    } finally {
      setIsPublishing(false);
    }
  };

  const formatPlatformName = (p: PlatformType) => {
    switch (p) {
      case 'youtube_shorts': return 'YouTube Shorts';
      case 'youtube_full': return 'YouTube Full';
      case 'instagram_reels': return 'Instagram Reels';
      default: return 'Other Platform';
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredDeliverables = formatFilter === 'all'
    ? deliverables
    : deliverables.filter(d => d.deliverable_type === formatFilter);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Social Media Publishing
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Mark platforms independently, verify live post URLs, and update daily counts.
        </p>
      </div>

      {/* Format Filter Tabs */}
      <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl max-w-sm">
        <button
          onClick={() => setFormatFilter('all')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            formatFilter === 'all' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          All Approved
        </button>
        <button
          onClick={() => setFormatFilter('reel')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            formatFilter === 'reel' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          Reels / Shorts
        </button>
        <button
          onClick={() => setFormatFilter('full_length_video')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            formatFilter === 'full_length_video' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          Full Episodes
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading approved deliverables...</div>
      ) : filteredDeliverables.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <p className="font-bold text-slate-900 dark:text-white">No videos ready to publish.</p>
          <p className="text-xs text-slate-400">
            Approved cuts from your Founder will appear here ready to be published to YouTube and Instagram.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDeliverables.map((item) => {
            const ytPublished = publishedToday.find(
              l => l.deliverable_id === item.id && (l.platform === 'youtube_shorts' || l.platform === 'youtube_full')
            );
            const igPublished = publishedToday.find(
              l => l.deliverable_id === item.id && l.platform === 'instagram_reels'
            );

            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                      {item.deliverable_type === 'full_length_video' ? '📺 Full Video' : '📱 Reel / Short'}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Founder Approved
                    </span>
                  </div>

                  {item.final_video_link && (
                    <a
                      href={item.final_video_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <span>Final Video</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  {item.title}
                </h4>

                {/* Independent Platform Actions */}
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                  {/* YouTube Platform Row */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <PlaySquare className="w-4 h-4 text-red-600" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">YouTube</span>
                      {ytPublished ? (
                        <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Published
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Not Published</span>
                      )}
                    </div>

                    {ytPublished ? (
                      ytPublished.post_url ? (
                        <a
                          href={ytPublished.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <span>View Post</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Recorded</span>
                      )
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmTarget({
                            deliverable: item,
                            platform: item.deliverable_type === 'full_length_video' ? 'youtube_full' : 'youtube_shorts'
                          });
                          setPostUrl('');
                          setNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-sm shadow-red-500/20 active:scale-95"
                      >
                        Mark Published
                      </button>
                    )}
                  </div>

                  {/* Instagram Platform Row */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-pink-600" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">Instagram</span>
                      {igPublished ? (
                        <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Published
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Not Published</span>
                      )}
                    </div>

                    {igPublished ? (
                      igPublished.post_url ? (
                        <a
                          href={igPublished.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-pink-600 hover:underline flex items-center gap-1"
                        >
                          <span>View Post</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Recorded</span>
                      )
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmTarget({
                            deliverable: item,
                            platform: 'instagram_reels'
                          });
                          setPostUrl('');
                          setNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                      >
                        Mark Published
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Confirm {formatPlatformName(confirmTarget.platform)} Publication
              </h3>
              <button
                onClick={() => setConfirmTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPublish} className="p-4 space-y-4">
              <div>
                <span className="text-xs text-slate-400 font-medium">Target Deliverable:</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {confirmTarget.deliverable.title}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Live Post URL (YouTube / Instagram link)
                </label>
                <input
                  type="url"
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://youtube.com/shorts/... or https://instagram.com/reel/..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Notes / Hashtags (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Published on main channel, trending tags used"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all"
                >
                  {isPublishing ? 'Recording...' : 'Confirm Publication'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-lg animate-in slide-in-from-bottom duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
