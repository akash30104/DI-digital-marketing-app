export type UserRole = 'founder' | 'editor' | 'social_media_manager' | 'client';

export type DeliverableType = 'reel' | 'full_length_video' | 'other';

export type EditingStatus = 
  | 'not_started'
  | 'assigned'
  | 'editing_in_progress'
  | 'internal_review'
  | 'submitted_for_approval'
  | 'changes_requested'
  | 'approved'
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

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
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
  created_at?: string;
  updated_at?: string;
}

export interface Deliverable {
  id: string;
  recording_id: string;
  title: string;
  deliverable_type: DeliverableType;
  assigned_editor_id?: string;
  editing_status: EditingStatus;
  progress_percentage: number;
  priority: Priority;
  deadline?: string;
  preview_link?: string;
  final_video_link?: string;
  thumbnail_url?: string;
  caption?: string;
  description?: string;
  hashtags?: string;
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
  created_at?: string;
  updated_at?: string;
  // Joins
  recording_title?: string;
  episode_number?: number;
  editor_name?: string;
  hard_disk_name?: string;
  folder_path?: string;
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

export interface DailySummary {
  reporting_date: string;
  published: {
    youtube_shorts: number;
    youtube_full: number;
    instagram_reels: number;
    other: number;
    total: number;
  };
  targets: {
    youtube_shorts: number;
    youtube_full: number;
    instagram_reels: number;
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

export interface ActivityLog {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  previous_status?: string;
  new_status?: string;
  details?: Record<string, any>;
  created_at: string;
  user_name?: string;
}
