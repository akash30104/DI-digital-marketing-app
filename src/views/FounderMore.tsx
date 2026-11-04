import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { ReportingExport } from './ReportingExport';
import { 
  Target, Users, FileSpreadsheet, Save, CheckCircle2, 
  AlertCircle, Shield, Clock, HardDrive, Smartphone, Trash2, RotateCcw 
} from 'lucide-react';
import { 
  purgeAllDeliverables, purgeAllRecordings, purgeAllPublishingHistory 
} from '../lib/deletionFilter';

export const FounderMore: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'targets' | 'team' | 'exports' | 'cleanup'>('targets');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);

  // Targets state
  const [shortsTarget, setShortsTarget] = useState(3);
  const [fullTarget, setFullTarget] = useState(1);
  const [reelsTarget, setReelsTarget] = useState(3);
  const [fbTarget, setFbTarget] = useState(2);
  const [xTarget, setXTarget] = useState(2);
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetSuccess, setTargetSuccess] = useState(false);

  // Team state
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Fetch current targets
  const fetchTargets = async () => {
    try {
      // Load any locally saved targets first
      const savedFb = localStorage.getItem('DAILY_TARGET_FB');
      const savedX = localStorage.getItem('DAILY_TARGET_X');
      const savedShorts = localStorage.getItem('DAILY_TARGET_SHORTS');
      const savedReels = localStorage.getItem('DAILY_TARGET_REELS');
      const savedFull = localStorage.getItem('DAILY_TARGET_FULL');

      if (savedFb) setFbTarget(parseInt(savedFb) || 2);
      if (savedX) setXTarget(parseInt(savedX) || 2);
      if (savedShorts) setShortsTarget(parseInt(savedShorts) || 3);
      if (savedReels) setReelsTarget(parseInt(savedReels) || 3);
      if (savedFull) setFullTarget(parseInt(savedFull) || 1);

      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const { data } = await supabase
        .from('daily_targets')
        .select('*')
        .eq('target_date', todayStr)
        .maybeSingle();

      if (data) {
        if (data.youtube_shorts_target !== undefined && data.youtube_shorts_target !== null) setShortsTarget(data.youtube_shorts_target);
        if (data.youtube_full_target !== undefined && data.youtube_full_target !== null) setFullTarget(data.youtube_full_target);
        if (data.instagram_reels_target !== undefined && data.instagram_reels_target !== null) setReelsTarget(data.instagram_reels_target);
        if ((data as any).facebook_target !== undefined && (data as any).facebook_target !== null) {
          setFbTarget((data as any).facebook_target);
        } else if (!savedFb && data.other_target) {
          setFbTarget(Math.ceil(data.other_target / 2));
        }
        if ((data as any).x_target !== undefined && (data as any).x_target !== null) {
          setXTarget((data as any).x_target);
        } else if (!savedX && data.other_target) {
          setXTarget(Math.floor(data.other_target / 2));
        }
      }
    } catch (err) {
      console.error('Failed to fetch targets:', err);
    }
  };

  const saveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTargets(true);
    setTargetSuccess(false);
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      
      // Persist in localStorage
      localStorage.setItem('DAILY_TARGET_FB', String(fbTarget));
      localStorage.setItem('DAILY_TARGET_X', String(xTarget));
      localStorage.setItem('DAILY_TARGET_SHORTS', String(shortsTarget));
      localStorage.setItem('DAILY_TARGET_REELS', String(reelsTarget));
      localStorage.setItem('DAILY_TARGET_FULL', String(fullTarget));

      const { error } = await supabase
        .from('daily_targets')
        .upsert({
          target_date: todayStr,
          youtube_shorts_target: Number(shortsTarget),
          youtube_full_target: Number(fullTarget),
          instagram_reels_target: Number(reelsTarget),
          other_target: Number(fbTarget) + Number(xTarget)
        }, { onConflict: 'target_date' });

      if (error) throw error;
      setTargetSuccess(true);
      setTimeout(() => setTargetSuccess(false), 3000);
    } catch (err: any) {
      alert(`Failed to save targets: ${err.message}`);
    } finally {
      setSavingTargets(false);
    }
  };

  // Fetch Team Profiles
  const fetchTeam = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').order('role');
      if (data) setProfiles(data);
    } catch (err) {
      console.error('Failed to load team:', err);
    }
  };

  const showCleanToast = (msg: string) => {
    setCleanMessage(msg);
    setTimeout(() => setCleanMessage(null), 3500);
  };

  const handleDeletePublishingHistory = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL publishing history (posted reels & proof links)? This will reset daily counts.');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllPublishingHistory();
      showCleanToast('All publishing history deleted successfully!');
    } catch (e: any) {
      alert(`Failed to delete history: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteTasks = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL tasks and deliverables?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllDeliverables();
      showCleanToast('All editing tasks & deliverables deleted successfully!');
    } catch (e: any) {
      alert(`Failed to delete tasks: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteRecordings = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete ALL podcasts and shoot recordings?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllRecordings();
      showCleanToast('All shoot recordings & podcasts deleted successfully!');
    } catch (e: any) {
      alert(`Failed to delete recordings: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteNonFounderUsers = async () => {
    const ok = window.confirm('⚠️ Are you sure you want to delete all team members (except founder)?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .neq('role', 'founder');
      if (error) console.warn('Supabase profile delete note:', error);
      await fetchTeam();
      showCleanToast('Team accounts deleted!');
    } catch (e: any) {
      alert(`Failed to delete users: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleFullReset = async () => {
    const ok = window.confirm('🚨 FULL SYSTEM RESET: This will permanently delete ALL tasks, posted reels, recordings, and non-founder users. Are you absolutely sure?');
    if (!ok) return;
    setIsCleaning(true);
    try {
      await purgeAllPublishingHistory();
      await purgeAllRecordings();
      await purgeAllDeliverables();

      try {
        await supabase.from('profiles').delete().neq('role', 'founder');
      } catch (pe) {
        console.warn('Profile cleanup note:', pe);
      }
      await fetchTeam();
      showCleanToast('System completely reset to fresh state! 🎉');
    } catch (e: any) {
      alert(`Reset failed: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  useEffect(() => {
    fetchTargets();
    fetchTeam();
  }, []);

  return (
    <div className="space-y-6 pb-20">
      {/* Sub-tab Navigation */}
      <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-2xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveSubTab('targets')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'targets'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Target className="w-4 h-4" />
          Daily Targets
        </button>

        <button
          onClick={() => setActiveSubTab('team')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'team'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Team ({profiles.length})
        </button>

        <button
          onClick={() => setActiveSubTab('exports')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'exports'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Data Exports
        </button>

        <button
          onClick={() => setActiveSubTab('cleanup')}
          className={`flex-1 min-w-[120px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'cleanup'
              ? 'bg-white text-black font-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Data &amp; History Reset
        </button>
      </div>

      {/* 1. Targets Screen */}
      {activeSubTab === 'targets' && (
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl">
          <div className="mb-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-white" />
              Configure Daily Publishing Targets
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Targets set the daily goals visible across the Founder Dashboard and iPhone home-screen widget.
            </p>
          </div>

          <form onSubmit={saveTargets} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                YouTube Shorts Daily Goal (videos/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={shortsTarget}
                onChange={(e) => setShortsTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Instagram Reels Daily Goal (videos/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={reelsTarget}
                onChange={(e) => setReelsTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                YouTube Full-Length Videos Daily Goal (episodes/day)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={fullTarget}
                onChange={(e) => setFullTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Facebook Daily Goal (posts/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={fbTarget}
                onChange={(e) => setFbTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                X (Twitter) Daily Goal (posts/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={xTarget}
                onChange={(e) => setXTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={savingTargets}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black bg-white hover:bg-zinc-200 text-black shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingTargets ? 'Saving...' : 'Save Publishing Targets'}
              </button>

              {targetSuccess && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-white">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  Targets updated!
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* 2. Team Screen */}
      {activeSubTab === 'team' && (
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl">
          <div className="mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-white" />
              Registered Team Accounts
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Active members authenticated via Supabase Row Level Security
            </p>
          </div>

          <div className="divide-y divide-zinc-800">
            {profiles.map(p => (
              <div key={p.id} className="py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">
                    {p.full_name}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {p.email}
                  </div>
                </div>

                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-zinc-800 text-zinc-200 border border-zinc-700">
                  {p.role.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exports Screen */}
      {activeSubTab === 'exports' && (
        <ReportingExport />
      )}

      {/* 4. Data & History Reset Screen */}
      {activeSubTab === 'cleanup' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-zinc-300" />
                Data &amp; History Reset Control
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Safely delete all tasks, published reels history, and test records to start fresh.
              </p>
            </div>

            {cleanMessage && (
              <div className="p-3.5 rounded-2xl bg-white text-black font-black text-xs flex items-center gap-2 shadow-md">
                <CheckCircle2 className="w-4 h-4 text-black" />
                <span>{cleanMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Reset History */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete All Publishing History</h4>
                  <p className="text-xs text-zinc-400">Permanently deletes all posted reels, live proofs, and resets today's output count and streak.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeletePublishingHistory}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete All History
                </button>
              </div>

              {/* Reset Tasks & Deliverables */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete All Tasks &amp; Deliverables</h4>
                  <p className="text-xs text-zinc-400">Deletes all assigned reels and full-length video cuts across all editors.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeleteTasks}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete All Tasks
                </button>
              </div>

              {/* Reset Shoot Recordings */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete All Shoot Recordings (Podcasts)</h4>
                  <p className="text-xs text-zinc-400">Deletes all registered podcasts and footage transfers.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeleteRecordings}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete All Shoots
                </button>
              </div>

              {/* Delete Test Non-Founder Users */}
              <div className="p-4 rounded-2xl bg-black border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">Delete Team Accounts (Except Founder)</h4>
                  <p className="text-xs text-zinc-400">Cleans up test editors and social media manager accounts.</p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleDeleteNonFounderUsers}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  Delete Team Users
                </button>
              </div>

              {/* Full Factory Clean Start */}
              <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                <div>
                  <h4 className="font-black text-white text-sm flex items-center gap-1.5">
                    <span>🚨 Full System Reset</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Purges all tasks, posted reels, shoots, and caches in a single action for a completely clean fresh start.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isCleaning}
                  onClick={handleFullReset}
                  className="px-6 py-2.5 rounded-full bg-white text-black font-black text-xs hover:bg-zinc-200 shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1.5" />
                  {isCleaning ? 'Resetting...' : 'Full System Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
