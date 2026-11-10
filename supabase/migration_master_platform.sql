/* ==============================================================================
   DIGITAL MARKETING TEAM & VIDEO WORKFLOW MANAGEMENT PLATFORM
   MASTER DATABASE MIGRATION & RLS POLICIES
   Database: Supabase PostgreSQL
   Project Dashboard: https://supabase.com/dashboard/project/jjscejejzzspgnxyrsin/sql
   ============================================================================== */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Helper Security Functions
CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'founder';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_social_media_manager()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'social_media_manager';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'editor';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    founder_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Profiles Enhancements
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 4. Clients Table (Isolated Workspaces)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    assigned_smm_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'onboarding')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_org ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_smm ON public.clients(assigned_smm_id);

-- 5. Invitations Table (One-time links, 24h expiration)
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('founder', 'social_media_manager', 'editor', 'client')),
    full_name TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);

-- 6. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    assigned_smm_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline DATE,
    required_videos_count INT DEFAULT 1,
    platforms TEXT[] DEFAULT ARRAY['youtube_shorts', 'instagram_reels']::TEXT[],
    channels TEXT[] DEFAULT ARRAY[]::TEXT[],
    requires_client_approval BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('planning', 'active', 'in_progress', 'completed', 'paused')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_client ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_smm ON public.projects(assigned_smm_id);

-- 7. Project Members (Assigning multiple editors)
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_in_project TEXT DEFAULT 'editor',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- 8. Social Media Channels Table
CREATE TABLE IF NOT EXISTS public.social_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'facebook', 'x')),
    channel_name TEXT NOT NULL,
    channel_url TEXT NOT NULL,
    account_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_channels_client ON public.social_channels(client_id);

-- 9. Enhance deliverables table for project linkage & workflow
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '16:9', '1:1', '4:5'));
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS expected_duration TEXT;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS reference_video_url TEXT;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS source_footage_url TEXT;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- 10. Video Versions Table (Never overwrite submissions)
CREATE TABLE IF NOT EXISTS public.video_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES public.deliverables(id) ON DELETE CASCADE,
    version_number INT NOT NULL DEFAULT 1,
    editor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    google_drive_link TEXT NOT NULL,
    notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending_smm' CHECK (status IN ('pending_smm', 'smm_approved', 'founder_approved', 'client_approved', 'changes_requested'))
);

CREATE INDEX IF NOT EXISTS idx_video_versions_task ON public.video_versions(task_id);

-- 11. Approval Feedback & Audit History
CREATE TABLE IF NOT EXISTS public.approval_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES public.deliverables(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.video_versions(id) ON DELETE SET NULL,
    stage TEXT NOT NULL CHECK (stage IN ('smm', 'founder', 'client')),
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer_name TEXT NOT NULL,
    reviewer_role TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
    comments TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_feedback_task ON public.approval_feedback(task_id);

-- 12. Publishing Proofs Table (Mandatory Verification)
CREATE TABLE IF NOT EXISTS public.publishing_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES public.deliverables(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    publisher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    post_url TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    screenshot_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publishing_proofs_task ON public.publishing_proofs(task_id);

-- 13. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Clients Policies
DROP POLICY IF EXISTS "Founders and SMM can manage clients" ON public.clients;
CREATE POLICY "Founders and SMM can manage clients"
    ON public.clients FOR ALL
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

DROP POLICY IF EXISTS "Clients can read own client record" ON public.clients;
CREATE POLICY "Clients can read own client record"
    ON public.clients FOR SELECT
    TO authenticated
    USING (
        email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        OR id IN (SELECT client_id FROM public.invitations WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
    );

-- Projects Policies
DROP POLICY IF EXISTS "Founders and SMM can manage projects" ON public.projects;
CREATE POLICY "Founders and SMM can manage projects"
    ON public.projects FOR ALL
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

DROP POLICY IF EXISTS "Editors can read projects they are assigned to" ON public.projects;
CREATE POLICY "Editors can read projects they are assigned to"
    ON public.projects FOR SELECT
    TO authenticated
    USING (
        id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
        OR id IN (SELECT project_id FROM public.deliverables WHERE assigned_editor_id = auth.uid())
    );

-- Social Channels Policies
DROP POLICY IF EXISTS "Founders and SMM can manage social_channels" ON public.social_channels;
CREATE POLICY "Founders and SMM can manage social_channels"
    ON public.social_channels FOR ALL
    TO authenticated
    USING (public.is_founder() OR public.is_social_media_manager());

DROP POLICY IF EXISTS "Clients can manage own social_channels" ON public.social_channels;
CREATE POLICY "Clients can manage own social_channels"
    ON public.social_channels FOR ALL
    TO authenticated
    USING (
        client_id IN (
            SELECT id FROM public.clients 
            WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Invitations Policies
DROP POLICY IF EXISTS "Founders can manage invitations" ON public.invitations;
CREATE POLICY "Founders can manage invitations"
    ON public.invitations FOR ALL
    TO authenticated
    USING (public.is_founder());

DROP POLICY IF EXISTS "Public can view valid invitations by token" ON public.invitations;
CREATE POLICY "Public can view valid invitations by token"
    ON public.invitations FOR SELECT
    TO anon, authenticated
    USING (status = 'pending' AND expires_at > NOW());

-- Video Versions Policies
DROP POLICY IF EXISTS "Team members and clients can view video_versions" ON public.video_versions;
CREATE POLICY "Team members and clients can view video_versions"
    ON public.video_versions FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Editors can insert video_versions for assigned tasks" ON public.video_versions;
CREATE POLICY "Editors can insert video_versions for assigned tasks"
    ON public.video_versions FOR INSERT
    TO authenticated
    WITH CHECK (
        editor_id = auth.uid() 
        OR public.is_founder() 
        OR public.is_social_media_manager()
    );

-- Approval Feedback Policies
DROP POLICY IF EXISTS "Authenticated can read feedback" ON public.approval_feedback;
CREATE POLICY "Authenticated can read feedback"
    ON public.approval_feedback FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Reviewers can insert approval feedback" ON public.approval_feedback;
CREATE POLICY "Reviewers can insert approval feedback"
    ON public.approval_feedback FOR INSERT
    TO authenticated
    WITH CHECK (reviewer_id = auth.uid());

-- Publishing Proofs Policies
DROP POLICY IF EXISTS "Authenticated can view publishing_proofs" ON public.publishing_proofs;
CREATE POLICY "Authenticated can view publishing_proofs"
    ON public.publishing_proofs FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "SMM and Founders can submit proofs" ON public.publishing_proofs;
CREATE POLICY "SMM and Founders can submit proofs"
    ON public.publishing_proofs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_founder() OR public.is_social_media_manager());

-- Audit Logs Policies
DROP POLICY IF EXISTS "Founders can view audit logs" ON public.audit_logs;
CREATE POLICY "Founders can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.is_founder());

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);
