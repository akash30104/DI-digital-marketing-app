/* ==============================================================================
   STUDIO DISKFLOW - SOCIAL MEDIA MANAGER APPROVAL & EDITING WORKFLOW UPDATE
   Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jjscejejzzspgnxyrsin/sql
   ============================================================================== */

-- 1. Ensure helper function identifies Social Media Managers
CREATE OR REPLACE FUNCTION public.is_social_media_manager()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'social_media_manager';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Grant Social Media Managers permission to approve deliverables & request changes
DROP POLICY IF EXISTS "Founders can update any deliverable" ON public.deliverables;
DROP POLICY IF EXISTS "Founders and SMM can update any deliverable" ON public.deliverables;

CREATE POLICY "Founders and SMM can update any deliverable"
    ON public.deliverables FOR UPDATE
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

-- 3. Ensure SMM can insert deliverables during footage registration
DROP POLICY IF EXISTS "Founders and SMM can insert deliverables" ON public.deliverables;
CREATE POLICY "Founders and SMM can insert deliverables"
    ON public.deliverables FOR INSERT
    TO authenticated
    WITH CHECK (public.is_founder() OR public.is_social_media_manager());
