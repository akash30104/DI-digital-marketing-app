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
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetSuccess, setTargetSuccess] = useState(false);

  // Team state
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Fetch current targets
  const fetchTargets = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('daily_targets')
        .select('*')
        .eq('target_date', todayStr)
        .maybeSingle();

      if (data) {
        setShortsTarget(data.youtube_shorts_target || 3);
        setFullTarget(data.youtube_full_target || 1);
        setReelsTarget(data.instagram_reels_target || 3);
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
      const todayStr = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('daily_targets')
        .upsert({
          target_date: todayStr,
          youtube_shorts_target: Number(shortsTarget),
          youtube_full_target: Number(fullTarget),
          instagram_reels_target: Number(reelsTarget),
          other_target: 0
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
      <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveSubTab('targets')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
            activeSubTab === 'targets'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Target className="w-4 h-4" />
          Daily Targets
        </button>

        <button
          onClick={() => setActiveSubTab('team')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
            activeSubTab === 'team'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Team ({profiles.length})
        </button>

        <button
          onClick={() => setActiveSubTab('exports')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
            activeSubTab === 'exports'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Data Exports
        </button>
      </div>

      {/* 1. Targets Screen */}
      {activeSubTab === 'targets' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Configure Daily Publishing Targets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Targets set the daily goals visible across the Founder Dashboard and iPhone home-screen widget.
            </p>
          </div>

          <form onSubmit={saveTargets} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                YouTube Shorts Daily Goal (videos/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={shortsTarget}
                onChange={(e) => setShortsTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Instagram Reels Daily Goal (videos/day)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={reelsTarget}
                onChange={(e) => setReelsTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                YouTube Full-Length Videos Daily Goal (episodes/day)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={fullTarget}
                onChange={(e) => setFullTarget(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={savingTargets}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingTargets ? 'Saving...' : 'Save Publishing Targets'}
              </button>

              {targetSuccess && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Targets updated!
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* 2. Team Screen */}
      {activeSubTab === 'team' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Registered Team Accounts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Active members authenticated via Supabase Row Level Security
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {profiles.map(p => (
              <div key={p.id} className="py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {p.full_name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {p.email}
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  p.role === 'founder'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : p.role === 'editor'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                }`}>
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
