/* ==============================================================================
   DIGITAL INERTIA - SOCIAL MEDIA PUBLISHING CHANNEL NAME UPDATE
   Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jjscejejzzspgnxyrsin/sql
   ============================================================================== */

-- 1. Add channel_name column to publishing_logs table
ALTER TABLE public.publishing_logs 
ADD COLUMN IF NOT EXISTS channel_name TEXT;

-- 2. Add index for faster channel-based queries
CREATE INDEX IF NOT EXISTS idx_publishing_logs_channel_name ON public.publishing_logs(channel_name);

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
