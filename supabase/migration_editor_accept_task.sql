/* ==============================================================================
   STUDIO DISKFLOW - VIDEO EDITOR TASK ACCEPTANCE & WORKFLOW POLICY UPDATE
   Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jjscejejzzspgnxyrsin/sql
   ============================================================================== */

-- 1. Ensure editors can claim/accept open tasks and update their deliverables
DROP POLICY IF EXISTS "Editors can update assigned deliverable work" ON public.deliverables;
DROP POLICY IF EXISTS "Editors can accept and update deliverables" ON public.deliverables;

CREATE POLICY "Editors can accept and update deliverables"
    ON public.deliverables FOR UPDATE
    TO authenticated
    USING (
        assigned_editor_id = auth.uid() 
        OR assigned_editor_id IS NULL 
        OR public.is_founder() 
        OR public.is_social_media_manager()
    )
    WITH CHECK (
        editing_status <> 'approved'
        OR public.is_founder()
        OR public.is_social_media_manager()
    );
