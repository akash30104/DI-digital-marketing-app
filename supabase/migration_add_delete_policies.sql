/* ==============================================================================
   STUDIO DISKFLOW - SUPABASE ROW LEVEL SECURITY (RLS) DELETE POLICIES
   Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jjscejejzzspgnxyrsin/sql
   ============================================================================== */

-- 1. Grant Founders & SMM permission to delete deliverables
DROP POLICY IF EXISTS "Founders and SMM can delete deliverables" ON public.deliverables;
CREATE POLICY "Founders and SMM can delete deliverables"
    ON public.deliverables FOR DELETE
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

-- 2. Grant Founders & SMM permission to delete recordings
DROP POLICY IF EXISTS "Founders and SMM can delete recordings" ON public.recordings;
CREATE POLICY "Founders and SMM can delete recordings"
    ON public.recordings FOR DELETE
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

-- 3. Grant Founders & SMM permission to delete publishing logs
DROP POLICY IF EXISTS "Founders and SMM can delete publishing_logs" ON public.publishing_logs;
CREATE POLICY "Founders and SMM can delete publishing_logs"
    ON public.publishing_logs FOR DELETE
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

-- 4. Grant Founders permission to delete team member profiles (except their own)
DROP POLICY IF EXISTS "Founders can delete profiles" ON public.profiles;
CREATE POLICY "Founders can delete profiles"
    ON public.profiles FOR DELETE
    TO authenticated
    USING (public.is_founder() AND id != auth.uid());
