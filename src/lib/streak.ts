import { PublishingLog } from '../types';

export interface StreakInfo {
  currentStreak: number;
  publishedToday: boolean;
  lastPublishedDate: string | null;
  statusMessage: string;
}

/**
 * Calculates consecutive daily publishing streak in Asia/Kolkata timezone.
 */
export function calculatePublishingStreak(logs: PublishingLog[]): StreakInfo {
  if (!logs || logs.length === 0) {
    return {
      currentStreak: 0,
      publishedToday: false,
      lastPublishedDate: null,
      statusMessage: 'Start your publishing streak today!'
    };
  }

  // Get distinct dates when at least 1 video was published
  const publishedDatesSet = new Set<string>();
  logs.forEach(log => {
    if (log.publication_status === 'published' && log.reporting_date) {
      publishedDatesSet.add(log.reporting_date);
    }
  });

  const sortedDates = Array.from(publishedDatesSet).sort().reverse();
  if (sortedDates.length === 0) {
    return {
      currentStreak: 0,
      publishedToday: false,
      lastPublishedDate: null,
      statusMessage: 'Start your publishing streak today!'
    };
  }

  // Get today's date formatted in Asia/Kolkata
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // Calculate yesterday's date in Asia/Kolkata
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(yesterday);

  const publishedToday = publishedDatesSet.has(todayStr);
  const publishedYesterday = publishedDatesSet.has(yesterdayStr);

  let streak = 0;
  let checkDate = publishedToday ? new Date(now) : publishedYesterday ? new Date(yesterday) : null;

  if (checkDate) {
    while (true) {
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(checkDate);
      if (publishedDatesSet.has(dateStr)) {
        streak++;
        // Move back 1 day
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  let statusMessage = '';
  if (publishedToday) {
    statusMessage = `🔥 ${streak} Day Streak! Great job publishing today.`;
  } else if (publishedYesterday) {
    statusMessage = `🔥 ${streak} Day Streak active! Post today's content to keep it alive.`;
  } else {
    statusMessage = 'Streak reset. Publish today to begin a new streak!';
  }

  return {
    currentStreak: streak,
    publishedToday,
    lastPublishedDate: sortedDates[0],
    statusMessage
  };
}

export const OFFICIAL_CHANNELS = [
  'Digital Inertia',
  'Unfiltered Podcast',
  'LLBS Podcast',
  'Best Podcast'
] as const;

export type OfficialChannel = typeof OFFICIAL_CHANNELS[number];

/**
 * Extracts channel name from log (supporting native column or encoded notes tag).
 */
export function getLogChannelName(log: { channel_name?: string; notes?: string }): string {
  if (log.channel_name && log.channel_name.trim()) {
    return log.channel_name.trim();
  }
  if (log.notes) {
    const match = log.notes.match(/\[Channel:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'Digital Inertia';
}

/**
 * Strips out the internal [Channel: ...] tag from notes.
 */
export function getLogCleanNotes(notes?: string): string {
  if (!notes) return '';
  return notes.replace(/\[Channel:\s*[^\]]+\]\s*/i, '').replace(/\[Platform:\s*[^\]]+\]\s*/i, '').trim();
}

/**
 * Formats platform type into user-facing name.
 */
export function formatPlatformLabel(platform: string, notes?: string): string {
  if (notes) {
    const match = notes.match(/\[Platform:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      const p = match[1].toLowerCase().trim();
      if (p === 'facebook') return 'Facebook';
      if (p === 'x' || p === 'twitter') return 'X (Twitter)';
      if (p === 'youtube_shorts') return 'YouTube Shorts';
      if (p === 'youtube_full') return 'YouTube Full';
      if (p === 'instagram_reels') return 'Instagram Reels';
      return match[1].trim();
    }
  }

  switch (platform) {
    case 'youtube_shorts':
      return 'YouTube Shorts';
    case 'youtube_full':
      return 'YouTube Full';
    case 'youtube':
      return 'YouTube';
    case 'instagram_reels':
    case 'instagram':
      return 'Instagram Reels';
    case 'facebook':
      return 'Facebook';
    case 'x':
    case 'twitter':
      return 'X (Twitter)';
    default:
      return 'Other Platform';
  }
}

/**
 * Normalizes platform identifier from log, decoding from notes fallback if needed.
 */
export function getLogPlatform(log: { platform: string; notes?: string }): string {
  if (log.platform && log.platform !== 'other') return log.platform;
  if (log.notes) {
    const match = log.notes.match(/\[Platform:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      const p = match[1].toLowerCase().trim();
      if (p.includes('short')) return 'youtube_shorts';
      if (p.includes('reel') || p.includes('instagram')) return 'instagram_reels';
      if (p.includes('full') || p.includes('youtube')) return 'youtube_full';
      if (p.includes('facebook')) return 'facebook';
      if (p.includes('x') || p.includes('twitter')) return 'x';
    }
  }
  return log.platform;
}

/**
 * Extracts a human-friendly title from a publishing log.
 */
export function getLogCleanTitle(log: { deliverables?: { title?: string }; notes?: string; deliverable_title?: string }): string {
  if (log.deliverables?.title) return log.deliverables.title;
  if (log.deliverable_title && !log.deliverable_title.startsWith('[Channel:')) {
    return log.deliverable_title;
  }
  if (log.notes) {
    const clean = log.notes
      .replace(/\[Channel:\s*[^\]]+\]/gi, '')
      .replace(/\[Platform:\s*[^\]]+\]/gi, '')
      .trim();
    if (clean) return clean.split('\n')[0];
  }
  return 'Published Video';
}
