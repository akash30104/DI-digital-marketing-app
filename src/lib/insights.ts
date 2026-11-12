export interface SocialInsights {
  views: number;
  comments: number;
  shares: number;
  likes: number;
  isRecorded: boolean;
  isAutoCalculated?: boolean;
}

/**
 * Extracts YouTube video ID from various YouTube URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:shorts\/|v=|youtu\.be\/|\/v\/|\/embed\/)([a-zA-Z0-9_-]{11})/i);
  return match ? match[1] : null;
}

export function isYouTubeUrl(url?: string | null): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export function isInstagramUrl(url?: string | null): boolean {
  if (!url) return false;
  return /instagram\.com\/(?:reel|p|tv)\//i.test(url);
}

/**
 * Parses real social performance insights from text (e.g. notes or approval_notes)
 * Format supported: [insights: {"views":12500,"comments":90,"shares":120,"likes":640}]
 * or fallback [insights: views=12500, comments=90, shares=120, likes=640]
 */
export function parseInsights(text?: string | null): SocialInsights {
  if (text) {
    // 1. JSON format
    const jsonMatch = text.match(/\[insights:\s*({[^}]+})\]/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          views: Math.max(0, Number(parsed.views) || 0),
          comments: Math.max(0, Number(parsed.comments) || 0),
          shares: Math.max(0, Number(parsed.shares) || 0),
          likes: Math.max(0, Number(parsed.likes) || 0),
          isRecorded: true,
          isAutoCalculated: false,
        };
      } catch (e) {
        // Fall through
      }
    }

    // 2. Key-value format
    const kvMatch = text.match(/\[insights:\s*views=(\d+)[,\s]+comments=(\d+)[,\s]+shares=(\d+)(?:[,\s]+likes=(\d+))?\]/i);
    if (kvMatch) {
      return {
        views: Math.max(0, parseInt(kvMatch[1], 10) || 0),
        comments: Math.max(0, parseInt(kvMatch[2], 10) || 0),
        shares: Math.max(0, parseInt(kvMatch[3], 10) || 0),
        likes: Math.max(0, parseInt(kvMatch[4] || '0', 10) || 0),
        isRecorded: true,
        isAutoCalculated: false,
      };
    }
  }

  return { views: 0, comments: 0, shares: 0, likes: 0, isRecorded: false };
}

/**
 * Automatically computes realistic, deterministic live video performance insights
 * based on platform, video id/url seed, and publication elapsed time.
 * If manual insights are recorded in notes, those are returned with isRecorded=true.
 */
export function getVideoInsights(log?: {
  id?: string;
  post_url?: string;
  platform?: string;
  published_at?: string;
  created_at?: string;
  notes?: string | null;
}): SocialInsights {
  if (!log) {
    return { views: 0, comments: 0, shares: 0, likes: 0, isRecorded: false, isAutoCalculated: false };
  }

  // 1. If real manual/API insights are recorded in notes, use them directly
  if (log.notes) {
    const parsed = parseInsights(log.notes);
    if (parsed.isRecorded && (parsed.views > 0 || parsed.likes > 0 || parsed.comments > 0 || parsed.shares > 0)) {
      return { ...parsed, isRecorded: true, isAutoCalculated: false };
    }
  }

  // 2. ZERO FAKE DATA: Strictly return unrecorded metrics (0 views, isRecorded: false)
  // No synthetic hash-based numbers. Verified real metrics only.
  return {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    isRecorded: false,
    isAutoCalculated: false,
  };
}

/**
 * Formats existing notes by appending or updating the [insights: ...] tag
 */
export function formatInsightsNote(baseText: string | null | undefined, insights: Partial<SocialInsights>): string {
  const cleanBase = (baseText || '').replace(/\[insights:[^\]]+\]/gi, '').trim();
  const views = Math.max(0, Number(insights.views) || 0);
  const comments = Math.max(0, Number(insights.comments) || 0);
  const shares = Math.max(0, Number(insights.shares) || 0);
  const likes = Math.max(0, Number(insights.likes) || 0);

  const tag = `[insights: {"views":${views},"comments":${comments},"shares":${shares},"likes":${likes}}]`;
  return cleanBase ? `${cleanBase} ${tag}` : tag;
}

/**
 * Clean compact number display (e.g. 14.2K, 1.2M, 0)
 */
export function formatCompactNumber(num: number): string {
  if (!num || isNaN(num) || num <= 0) return '0';
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toLocaleString();
}

/**
 * Fetches real, live video statistics directly from YouTube Data API v3
 * Requires a free YouTube Data API key.
 */
export async function fetchYouTubeLiveStats(
  videoId: string,
  apiKey?: string
): Promise<{ views: number; likes: number; comments: number } | null> {
  const key = apiKey || (typeof window !== 'undefined' ? localStorage.getItem('youtube_api_key') : null);
  if (!key) return null;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key.trim())}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('YouTube API error:', err);
      return null;
    }
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const stats = data.items[0].statistics;
      return {
        views: parseInt(stats.viewCount || '0', 10) || 0,
        likes: parseInt(stats.likeCount || '0', 10) || 0,
        comments: parseInt(stats.commentCount || '0', 10) || 0,
      };
    }
  } catch (err) {
    console.error('Failed to fetch YouTube stats:', err);
  }
  return null;
}
