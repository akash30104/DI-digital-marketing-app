import { supabase } from './supabase';

export interface TargetConfig {
  shorts: number;
  reels: number;
  full: number;
  fb: number;
  x: number;
  total: number;
  updated_at?: number;
  userId?: string;
}

export const DEFAULT_TARGETS: TargetConfig = {
  shorts: 4,
  reels: 4,
  full: 1,
  fb: 4,
  x: 4,
  total: 17,
  updated_at: 0
};

const STORAGE_KEY = 'di_daily_targets_v3';

export function getCachedTargets(userId?: string): TargetConfig {
  try {
    const key = userId ? `di_daily_targets_v3_${userId}` : STORAGE_KEY;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.shorts === 'number') {
        return {
          shorts: parsed.shorts,
          reels: parsed.reels,
          full: parsed.full,
          fb: parsed.fb ?? DEFAULT_TARGETS.fb,
          x: parsed.x ?? DEFAULT_TARGETS.x,
          total: parsed.shorts + parsed.reels + parsed.full + (parsed.fb ?? DEFAULT_TARGETS.fb) + (parsed.x ?? DEFAULT_TARGETS.x),
          updated_at: parsed.updated_at || 0,
          userId
        };
      }
    }

    // If querying for a specific user and no custom user target set yet, fall back to global cached targets
    if (userId && key !== STORAGE_KEY) {
      return { ...getCachedTargets(), userId };
    }

    const s = localStorage.getItem('DAILY_TARGET_SHORTS');
    const r = localStorage.getItem('DAILY_TARGET_REELS');
    const f = localStorage.getItem('DAILY_TARGET_FULL');
    const fb = localStorage.getItem('DAILY_TARGET_FB');
    const x = localStorage.getItem('DAILY_TARGET_X');
    const upd = localStorage.getItem('DAILY_TARGET_UPDATED_AT');

    const shorts = s ? parseInt(s, 10) : DEFAULT_TARGETS.shorts;
    const reels = r ? parseInt(r, 10) : DEFAULT_TARGETS.reels;
    const full = f ? parseInt(f, 10) : DEFAULT_TARGETS.full;
    const fbCount = fb ? parseInt(fb, 10) : DEFAULT_TARGETS.fb;
    const xCount = x ? parseInt(x, 10) : DEFAULT_TARGETS.x;
    const updated_at = upd ? parseInt(upd, 10) : 0;

    return {
      shorts,
      reels,
      full,
      fb: fbCount,
      x: xCount,
      total: shorts + reels + full + fbCount + xCount,
      updated_at
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export function cacheTargetsLocally(
  t: { shorts: number; reels: number; full: number; fb: number; x: number; updated_at?: number },
  userId?: string
): TargetConfig {
  const now = t.updated_at || Date.now();
  const config: TargetConfig = {
    shorts: Number(t.shorts) || DEFAULT_TARGETS.shorts,
    reels: Number(t.reels) || DEFAULT_TARGETS.reels,
    full: Number(t.full) || DEFAULT_TARGETS.full,
    fb: Number(t.fb) || DEFAULT_TARGETS.fb,
    x: Number(t.x) || DEFAULT_TARGETS.x,
    total: (Number(t.shorts) || DEFAULT_TARGETS.shorts) +
           (Number(t.reels) || DEFAULT_TARGETS.reels) +
           (Number(t.full) || DEFAULT_TARGETS.full) +
           (Number(t.fb) || DEFAULT_TARGETS.fb) +
           (Number(t.x) || DEFAULT_TARGETS.x),
    updated_at: now,
    userId
  };

  try {
    const key = userId ? `di_daily_targets_v3_${userId}` : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(config));
    if (!userId) {
      localStorage.setItem('DAILY_TARGET_SHORTS', String(config.shorts));
      localStorage.setItem('DAILY_TARGET_REELS', String(config.reels));
      localStorage.setItem('DAILY_TARGET_FULL', String(config.full));
      localStorage.setItem('DAILY_TARGET_FB', String(config.fb));
      localStorage.setItem('DAILY_TARGET_X', String(config.x));
      localStorage.setItem('DAILY_TARGET_UPDATED_AT', String(now));
    }
  } catch (e) {
    console.warn('Cache targets error:', e);
  }

  // Broadcast to all listening React views in real time!
  try {
    window.dispatchEvent(new CustomEvent('targets-updated', { detail: config }));
    window.dispatchEvent(new Event('storage'));
  } catch {}

  return config;
}

/**
 * Loads the current active targets for today.
 * Supports per-SMM targets as well as global organizational targets.
 */
export async function fetchDailyTargets(userId?: string): Promise<TargetConfig> {
  const cached = getCachedTargets(userId);

  // If a specific SMM's target is requested, the user-configured local target is authoritative
  if (userId) {
    return cached;
  }

  try {
    // Fetch from daily_targets table for global founder view
    const { data: targetRecord } = await supabase
      .from('daily_targets')
      .select('*')
      .order('target_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (targetRecord) {
      if (cached.updated_at && (Date.now() - cached.updated_at < 86400000)) {
        return cached;
      }

      let shorts = targetRecord.youtube_shorts_target != null ? Number(targetRecord.youtube_shorts_target) : cached.shorts;
      let reels = targetRecord.instagram_reels_target != null ? Number(targetRecord.instagram_reels_target) : cached.reels;
      let full = targetRecord.youtube_full_target != null ? Number(targetRecord.youtube_full_target) : cached.full;
      let fb = cached.fb;
      let x = cached.x;

      if ((targetRecord as any).facebook_target != null) {
        fb = Number((targetRecord as any).facebook_target);
      } else if (targetRecord.other_target) {
        if (targetRecord.other_target >= 1000) {
          fb = Math.floor(targetRecord.other_target / 1000);
        } else {
          fb = Math.ceil(targetRecord.other_target / 2);
        }
      }

      if ((targetRecord as any).x_target != null) {
        x = Number((targetRecord as any).x_target);
      } else if (targetRecord.other_target) {
        if (targetRecord.other_target >= 1000) {
          x = targetRecord.other_target % 1000;
        } else {
          x = Math.floor(targetRecord.other_target / 2);
        }
      }

      const remoteConfig: TargetConfig = {
        shorts,
        reels,
        full,
        fb,
        x,
        total: shorts + reels + full + fb + x,
        updated_at: Date.now()
      };
      cacheTargetsLocally(remoteConfig);
      return remoteConfig;
    }
  } catch (err) {
    console.warn('Error fetching daily targets from Supabase, using local cache:', err);
  }

  return cached;
}

/**
 * Saves targets locally and synchronizes to Supabase.
 * If userId is provided, saves specifically for that SMM without altering other SMMs' targets.
 */
export async function saveDailyTargets(
  t: { shorts: number; reels: number; full: number; fb: number; x: number },
  userId?: string
): Promise<TargetConfig> {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // 1. Save to local device storage immediately & broadcast to all components
  const config = cacheTargetsLocally({ ...t, updated_at: Date.now() }, userId);

  // 2. If global targets, sync to Supabase daily_targets table
  if (!userId) {
    const otherEncoded = (Number(config.fb) * 1000) + Number(config.x);
    try {
      const { error } = await supabase
        .from('daily_targets')
        .upsert({
          target_date: todayStr,
          youtube_shorts_target: config.shorts,
          youtube_full_target: config.full,
          instagram_reels_target: config.reels,
          other_target: otherEncoded
        }, { onConflict: 'target_date' });

      if (error) {
        console.warn('Supabase daily_targets upsert note (will use local cache):', error.message);
      }
    } catch (e) {
      console.warn('daily_targets upsert exception:', e);
    }
  }

  return config;
}
