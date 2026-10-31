import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Default configuration with runtime localStorage fallback
export function getStoredSupabaseConfig() {
  const customUrl = localStorage.getItem('STUDIO_SUPABASE_URL');
  const customKey = localStorage.getItem('STUDIO_SUPABASE_KEY');
  
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  return {
    url: customUrl || envUrl || 'https://xyzcompany.supabase.co',
    key: customKey || envKey || 'dummy_anon_key'
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

// Security Helper: Check if Founder exists (public RPC / query)
export async function checkFounderExists(): Promise<boolean> {
  try {
    // 1. Try public RPC
    const { data, error } = await supabase.rpc('check_founder_exists');
    if (!error && typeof data === 'boolean') {
      return data;
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
      return true;
    }
  } catch (e) {
    // ignore
  }

  return false;
}
