import { supabase } from './supabase';

export interface TargetConfig {
  shorts: number;
  reels: number;
  full: number;
  fb: number;
  x: number;
  total: number;
}

export const DEFAULT_TARGETS: TargetConfig = {
  shorts: 4,
  reels: 4,
  full: 1,
  fb: 4,
  x: 4,
  total: 17
};

export function getCachedTargets(): TargetConfig {
  try {
    const s = localStorage.getItem('DAILY_TARGET_SHORTS');
    const r = localStorage.getItem('DAILY_TARGET_REELS');
    const f = localStorage.getItem('DAILY_TARGET_FULL');
    const fb = localStorage.getItem('DAILY_TARGET_FB');
    const x = localStorage.getItem('DAILY_TARGET_X');

    const shorts = s ? parseInt(s, 10) : DEFAULT_TARGETS.shorts;
    const reels = r ? parseInt(r, 10) : DEFAULT_TARGETS.reels;
    const full = f ? parseInt(f, 10) : DEFAULT_TARGETS.full;
    const fbCount = fb ? parseInt(fb, 10) : DEFAULT_TARGETS.fb;
    const xCount = x ? parseInt(x, 10) : DEFAULT_TARGETS.x;

    return {
      shorts,
      reels,
      full,
      fb: fbCount,
      x: xCount,
      total: shorts + reels + full + fbCount + xCount
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export function cacheTargetsLocally(t: { shorts: number; reels: number; full: number; fb: number; x: number }) {
  try {
    localStorage.setItem('DAILY_TARGET_SHORTS', String(t.shorts));
    localStorage.setItem('DAILY_TARGET_REELS', String(t.reels));
    localStorage.setItem('DAILY_TARGET_FULL', String(t.full));
    localStorage.setItem('DAILY_TARGET_FB', String(t.fb));
    localStorage.setItem('DAILY_TARGET_X', String(t.x));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.warn('Cache targets error:', e);
  }
}

/**
 * Loads the current active targets for today from Supabase
 * Uses daily_targets table AND founder profile bio backup to ensure 100% sync across all roles
 */
export async function fetchDailyTargets(): Promise<TargetConfig> {
  const cached = getCachedTargets();
  let current: TargetConfig = { ...cached };

  try {
    // 1. Fetch from daily_targets table (latest configuration)
    const { data: targetRecord } = await supabase
      .from('daily_targets')
      .select('*')
      .order('target_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (targetRecord) {
      if (targetRecord.youtube_shorts_target !== undefined && targetRecord.youtube_shorts_target !== null) {
        current.shorts = Number(targetRecord.youtube_shorts_target);
      }
      if (targetRecord.instagram_reels_target !== undefined && targetRecord.instagram_reels_target !== null) {
        current.reels = Number(targetRecord.instagram_reels_target);
      }
      if (targetRecord.youtube_full_target !== undefined && targetRecord.youtube_full_target !== null) {
        current.full = Number(targetRecord.youtube_full_target);
      }

      // Decode facebook & X targets
      if ((targetRecord as any).facebook_target !== undefined && (targetRecord as any).facebook_target !== null) {
        current.fb = Number((targetRecord as any).facebook_target);
      } else if (targetRecord.other_target) {
        if (targetRecord.other_target >= 1000) {
          current.fb = Math.floor(targetRecord.other_target / 1000);
        } else {
          current.fb = Math.ceil(targetRecord.other_target / 2);
        }
      }

      if ((targetRecord as any).x_target !== undefined && (targetRecord as any).x_target !== null) {
        current.x = Number((targetRecord as any).x_target);
      } else if (targetRecord.other_target) {
        if (targetRecord.other_target >= 1000) {
          current.x = targetRecord.other_target % 1000;
        } else {
          current.x = Math.floor(targetRecord.other_target / 2);
        }
      }
    }

    // 2. Cross-verify with Founder profile bio backup (guaranteed readable by SMM and all roles)
    try {
      const { data: founderProfile } = await supabase
        .from('profiles')
        .select('bio')
        .eq('role', 'founder')
        .limit(1)
        .maybeSingle();

      if (founderProfile?.bio && founderProfile.bio.startsWith('TARGETS:')) {
        const rawJson = founderProfile.bio.substring('TARGETS:'.length);
        const parsed = JSON.parse(rawJson);
        if (parsed.shorts !== undefined) current.shorts = Number(parsed.shorts);
        if (parsed.reels !== undefined) current.reels = Number(parsed.reels);
        if (parsed.full !== undefined) current.full = Number(parsed.full);
        if (parsed.fb !== undefined) current.fb = Number(parsed.fb);
        if (parsed.x !== undefined) current.x = Number(parsed.x);
      }
    } catch (pe) {
      console.warn('Founder profile bio check note:', pe);
    }

    current.total = current.shorts + current.reels + current.full + current.fb + current.x;
    cacheTargetsLocally(current);
    return current;
  } catch (err) {
    console.warn('Error fetching daily targets, using local cache:', err);
    return current;
  }
}

/**
 * Saves targets to both Supabase daily_targets and Founder Profile bio backup
 */
export async function saveDailyTargets(t: { shorts: number; reels: number; full: number; fb: number; x: number }): Promise<void> {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // 1. Save to local device storage immediately
  cacheTargetsLocally(t);

  // 2. Save to daily_targets table (encodes fb & x into other_target to prevent schema cache errors)
  const otherEncoded = (Number(t.fb) * 1000) + Number(t.x);
  try {
    const { error } = await supabase
      .from('daily_targets')
      .upsert({
        target_date: todayStr,
        youtube_shorts_target: Number(t.shorts),
        youtube_full_target: Number(t.full),
        instagram_reels_target: Number(t.reels),
        other_target: otherEncoded
      }, { onConflict: 'target_date' });

    if (error) console.warn('Supabase daily_targets upsert note:', error);
  } catch (e) {
    console.warn('daily_targets upsert exception:', e);
  }

  // 3. Save to founder profile bio as universal shared backup for SMM and team members
  try {
    const backupJson = JSON.stringify({
      shorts: Number(t.shorts),
      reels: Number(t.reels),
      full: Number(t.full),
      fb: Number(t.fb),
      x: Number(t.x),
      updated_at: new Date().toISOString()
    });

    const { error: bioErr } = await supabase
      .from('profiles')
      .update({ bio: `TARGETS:${backupJson}` })
      .eq('role', 'founder');

    if (bioErr) console.warn('Founder profile backup note:', bioErr);
  } catch (be) {
    console.warn('Profile targets backup exception:', be);
  }
}
