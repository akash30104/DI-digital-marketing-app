import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { ReportingExport } from './ReportingExport';
import { 
  Target, Users, FileSpreadsheet, Save, CheckCircle2, 
  AlertCircle, Shield, Clock, HardDrive, Smartphone
} from 'lucide-react';

export const FounderMore: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'targets' | 'team' | 'exports'>('targets');

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
    </div>
  );
};
