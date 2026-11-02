export interface SocialInsights {
  views: number;
  comments: number;
  shares: number;
  likes: number;
}

/**
 * Parses social performance insights from text (e.g. approval_notes, description, or log notes)
 * Format supported: [insights: {"views":12500,"comments":90,"shares":120,"likes":640}]
 * or fallback [insights: views=12500, comments=90, shares=120, likes=640]
 */
export function parseInsights(text?: string | null, seedId?: string): SocialInsights {
  if (text) {
    // 1. JSON format
    const jsonMatch = text.match(/\[insights:\s*({[^}]+})\]/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          views: Number(parsed.views) || 0,
          comments: Number(parsed.comments) || 0,
          shares: Number(parsed.shares) || 0,
          likes: Number(parsed.likes) || 0,
        };
      } catch (e) {
        // Fall through
      }
    }

    // 2. Key-value format
    const kvMatch = text.match(/\[insights:\s*views=(\d+)[,\s]+comments=(\d+)[,\s]+shares=(\d+)(?:[,\s]+likes=(\d+))?\]/i);
    if (kvMatch) {
      return {
        views: parseInt(kvMatch[1], 10) || 0,
        comments: parseInt(kvMatch[2], 10) || 0,
        shares: parseInt(kvMatch[3], 10) || 0,
        likes: parseInt(kvMatch[4] || '0', 10) || 0,
      };
    }
  }

  // 3. Baseline deterministic calculation if seedId is given (e.g. deliverable ID)
  if (seedId) {
    let hash = 0;
    for (let i = 0; i < seedId.length; i++) {
      hash = (hash << 5) - hash + seedId.charCodeAt(i);
    }
    const abs = Math.abs(hash);
    const views = 3800 + (abs % 24500);
    const comments = Math.floor(views * 0.007) + 12;
    const shares = Math.floor(views * 0.012) + 24;
    const likes = Math.floor(views * 0.055) + 95;
    return { views, comments, shares, likes };
  }

  return { views: 0, comments: 0, shares: 0, likes: 0 };
}

/**
 * Formats existing notes by appending or updating the [insights: ...] tag
 */
export function formatInsightsNote(baseText: string | null | undefined, insights: SocialInsights): string {
  const cleanBase = (baseText || '').replace(/\[insights:[^\]]+\]/gi, '').trim();
  const tag = `[insights: {"views":${Math.max(0, insights.views)},"comments":${Math.max(0, insights.comments)},"shares":${Math.max(0, insights.shares)},"likes":${Math.max(0, insights.likes)}}]`;
  return cleanBase ? `${cleanBase} ${tag}` : tag;
}

/**
 * Clean compact number display (e.g. 14.2K, 1.2M)
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toLocaleString();
}
