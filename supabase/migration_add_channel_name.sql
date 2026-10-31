/* ==============================================================================
   DIGITAL INERTIA - SOCIAL MEDIA PUBLISHING CHANNEL & PLATFORM UPDATE
   Channels: Digital Inertia, Unfiltered Podcast, LLBS Podcast, Best Podcast
   Platforms: YouTube (Shorts & Full), Instagram, Facebook, X (Twitter)
   Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jjscejejzzspgnxyrsin/sql
   ============================================================================== */

-- 1. Add channel_name column to publishing_logs table
ALTER TABLE public.publishing_logs 
ADD COLUMN IF NOT EXISTS channel_name TEXT;

CREATE INDEX IF NOT EXISTS idx_publishing_logs_channel_name ON public.publishing_logs(channel_name);

-- 2. Update platform check constraint to support Facebook and X
ALTER TABLE public.publishing_logs DROP CONSTRAINT IF EXISTS publishing_logs_platform_check;
ALTER TABLE public.publishing_logs ADD CONSTRAINT publishing_logs_platform_check 
CHECK (platform IN ('youtube_shorts', 'youtube_full', 'instagram_reels', 'facebook', 'x', 'other'));

-- 3. Ensure Social Media Managers can insert & update publishing logs with channel_name
DROP POLICY IF EXISTS "SMM can insert publishing logs" ON public.publishing_logs;
CREATE POLICY "SMM can insert publishing logs"
    ON public.publishing_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'social_media_manager' OR profiles.role = 'founder')
        )
    );

DROP POLICY IF EXISTS "SMM can update publishing logs" ON public.publishing_logs;
CREATE POLICY "SMM can update publishing logs"
    ON public.publishing_logs FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'social_media_manager' OR profiles.role = 'founder')
        )
    );
