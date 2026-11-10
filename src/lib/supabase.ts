import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://jjscejejzzspgnxyrsin.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqc2NlamVqenpzcGdueHlyc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzU2NjYsImV4cCI6MjEwNjQxMTY2Nn0.6lcNkVZrDBRLXF_laYFVJLStVLkP68r7tK9PPETOEsM';

// Default configuration with runtime localStorage fallback
export function getStoredSupabaseConfig() {
  const customUrl = localStorage.getItem('STUDIO_SUPABASE_URL');
  const customKey = localStorage.getItem('STUDIO_SUPABASE_KEY');
  
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  return {
    url: customUrl || envUrl || DEFAULT_SUPABASE_URL,
    key: customKey || envKey || DEFAULT_SUPABASE_ANON_KEY
  };
}

let currentConfig = getStoredSupabaseConfig();

export let supabase: SupabaseClient = createClient(currentConfig.url, currentConfig.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

export function reconfigureSupabase(url: string, key: string) {
  localStorage.setItem('STUDIO_SUPABASE_URL', url.trim());
  localStorage.setItem('STUDIO_SUPABASE_KEY', key.trim());
  supabase = createClient(url.trim(), key.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

// Security Helper: Check if Founder exists (public RPC / query / persistent flag)
export async function checkFounderExists(): Promise<boolean> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('DI_PLATFORM_FOUNDER_CLAIMED') === 'true') {
      return true;
    }
  } catch (e) {}

  try {
    // 1. Try public RPC
    const { data, error } = await supabase.rpc('check_founder_exists');
    if (!error && typeof data === 'boolean' && data) {
      try { localStorage.setItem('DI_PLATFORM_FOUNDER_CLAIMED', 'true'); } catch (e) {}
      return true;
    }
  } catch (e) {
    // Fall through to query profiles table
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'founder')
      .limit(1);

    if (!error && data && data.length > 0) {
      try { localStorage.setItem('DI_PLATFORM_FOUNDER_CLAIMED', 'true'); } catch (e) {}
      return true;
    }
  } catch (e) {
    // ignore
  }

  return false;
}
