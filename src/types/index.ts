export type UserRole = 'founder' | 'editor' | 'social_media_manager' | 'client';

export type DeliverableType = 'reel' | 'full_length_video' | 'other';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export type EditingStatus = 
  | 'not_started'
  | 'assigned'
  | 'editing_in_progress'
  | 'internal_review'
  | 'submitted_for_approval'
  | 'changes_requested'
  | 'smm_approved'
  | 'founder_approved'
  | 'client_approved'
  | 'approved'
  | 'ready_to_publish'
  | 'published'
  | 'blocked'
  | 'cancelled';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type PlatformType = 
  | 'youtube_shorts' 
  | 'youtube_full' 
  | 'instagram_reels' 
  | 'facebook' 
  | 'x' 
  | 'other';

export type ApprovalStage = 'smm' | 'founder' | 'client';

export type ApprovalDecision = 'approved' | 'changes_requested' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  is_suspended?: boolean;
  phone?: string;
  bio?: string;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  founder_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
  client_id?: string;
  client_name?: string;
  client_brand?: string;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  created_at: string;
  is_legacy?: boolean;
}

export interface Client {
  id: string;
  name: string;
  company_name?: string;
  brand_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  assigned_smm_id?: string;
  assigned_smm_name?: string;
  status: 'active' | 'inactive' | 'onboarding';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Project {
  id: string;
  client_id?: string;
  client_name?: string;
  client_brand?: string;
  name: string;
  description?: string;
  assigned_smm_id?: string;
  assigned_smm_name?: string;
  smm_id?: string;
  smm_name?: string;
  assigned_editor_ids?: string[];
  assigned_editor_names?: string[];
  start_date: string;
  deadline?: string;
  required_videos_count: number;
  required_video_count?: number;
  completed_video_count?: number;
  platforms: PlatformType[];
  channels?: string[];
  channel_ids?: string[];
  requires_client_approval?: boolean;
  approval_requirements?: {
    smm_approval_required?: boolean;
    founder_approval_required?: boolean;
    client_approval_required?: boolean;
  };
  status: 'planning' | 'active' | 'in_progress' | 'completed' | 'paused';
  created_at?: string;
  updated_at?: string;
}

export interface SocialChannel {
  id: string;
  client_id?: string;
  client_name?: string;
  platform: 'instagram' | 'youtube' | 'facebook' | 'x';
  channel_name: string;
  channel_url: string;
  account_id?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Recording {
  id: string;
  title: string;
  episode_number?: number;
  recording_date: string;
  date_received: string;
  hard_disk_name: string;
  hard_disk_id?: string;
  folder_path: string;
  source_footage_reference?: string;
  notes?: string;
  registered_by?: string;
  client_id?: string;
  project_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VideoVersion {
  id: string;
  task_id: string;
  version_number: number;
  editor_id?: string;
  editor_name?: string;
  submitted_by?: string;
  google_drive_link?: string;
  video_url?: string;
  notes?: string;
  submitted_at: string;
  status?: 'pending_smm' | 'smm_approved' | 'founder_approved' | 'client_approved' | 'changes_requested';
}

export interface ApprovalFeedback {
  id: string;
  task_id: string;
  version_id?: string;
  version_number?: number;
  stage: ApprovalStage;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_role: UserRole;
  decision: ApprovalDecision;
  comments: string;
  created_at: string;
}

export interface Deliverable {
  id: string;
  recording_id: string;
  project_id?: string;
  client_id?: string;
  client_name?: string;
  client_brand?: string;
  title: string;
  deliverable_type: DeliverableType;
  assigned_editor_id?: string;
  editor_name?: string;
  editing_status: EditingStatus;
  progress_percentage: number;
  priority: Priority;
  deadline?: string;
  preview_link?: string;
  final_video_link?: string;
  thumbnail_url?: string;
  caption?: string;
  description?: string;
  instructions?: string;
  aspect_ratio?: AspectRatio;
  expected_duration?: string;
  reference_video_url?: string;
  source_footage_url?: string;
  hashtags?: string;
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
  accepted_at?: string;
  created_at?: string;
  updated_at?: string;
  // Joins
  recording_title?: string;
  episode_number?: number;
  hard_disk_name?: string;
  folder_path?: string;
  project_name?: string;
  versions?: VideoVersion[];
  feedback_history?: ApprovalFeedback[];
}

export interface PublishingProof {
  id: string;
  task_id: string;
  project_id?: string;
  client_id?: string;
  publisher_id?: string;
  published_by?: string;
  publisher_name?: string;
  platform: PlatformType;
  channel_name: string;
  post_url: string;
  published_at: string;
  screenshot_url?: string;
  notes?: string;
  status?: string;
  created_at: string;
}

export interface PublishingLog {
  id: string;
  deliverable_id: string;
  recording_id: string;
  platform: PlatformType;
  publication_status: 'not_published' | 'scheduled' | 'published' | 'failed' | 'unpublished';
  published_by: string;
  published_at: string;
  post_url?: string;
  channel_name?: string;
  notes?: string;
  reporting_date: string;
  created_at?: string;
  deliverable_title?: string;
  publisher_name?: string;
  screenshot_url?: string;
  client_name?: string;
}

export interface DailyTarget {
  id: string;
  target_date: string;
  youtube_shorts_target: number;
  instagram_reels_target: number;
  youtube_full_target: number;
  facebook_target?: number;
  x_target?: number;
  other_target: number;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  body: string;
  link?: string;
  type?: 'invitation' | 'task_assigned' | 'task_accepted' | 'submission' | 'approval' | 'revision' | 'published' | 'proof' | 'system';
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  actor_email?: string;
  actor_id?: string;
  user_role?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface DailySummary {
  reporting_date: string;
  published: {
    youtube_shorts: number;
    youtube_full: number;
    instagram_reels: number;
    facebook?: number;
    x?: number;
    other: number;
    total: number;
  };
  targets: {
    youtube_shorts: number;
    youtube_full: number;
    instagram_reels: number;
    facebook?: number;
    x?: number;
    other: number;
    total: number;
  };
  pipeline: {
    in_editing: number;
    pending_approval: number;
    changes_requested: number;
    ready_to_publish: number;
    overdue_tasks: number;
  };
}
