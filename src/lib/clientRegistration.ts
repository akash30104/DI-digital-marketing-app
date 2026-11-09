import { createClient } from '@supabase/supabase-js';
import { getStoredSupabaseConfig } from './supabase';
import { Profile } from '../types';

export interface RegisterClientResult {
  success: boolean;
  error?: string;
  client?: {
    id: string;
    email: string;
    full_name: string;
    brand_name: string;
    password: string;
  };
}

/**
 * Register a new Client Account with credentials created by Founder or SMM.
 * Uses an ephemeral client so that the currently logged-in Founder or SMM session is NOT touched.
 */
export async function registerNewClientAccount(
  email: string,
  pass: string,
  contactName: string,
  brandName: string
): Promise<RegisterClientResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = pass.trim();
  const cleanContact = contactName.trim();
  const cleanBrand = brandName.trim();

  if (!cleanEmail || !cleanPass || !cleanContact || !cleanBrand) {
    return { success: false, error: 'Please provide client contact name, brand name, email, and password.' };
  }

  if (cleanPass.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  const clientDisplayName = `${cleanContact} (${cleanBrand})`;

  try {
    const { url, key } = getStoredSupabaseConfig();
    
    // Create non-persisting client so the Founder/SMM session in localStorage remains untouched
    const ephemeralClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data, error } = await ephemeralClient.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: {
          full_name: clientDisplayName,
          role: 'client',
          brand_name: cleanBrand
        }
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Failed to create client user.' };
    }

    // Upsert into profiles table
    const { error: profileError } = await ephemeralClient
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: cleanEmail,
        full_name: clientDisplayName,
        role: 'client'
      });

    if (profileError) {
      console.warn('Note on client profile upsert:', profileError);
    }

    return {
      success: true,
      client: {
        id: data.user.id,
        email: cleanEmail,
        full_name: clientDisplayName,
        brand_name: cleanBrand,
        password: cleanPass
      }
    };
  } catch (err: any) {
    console.error('Error in registerNewClientAccount:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}
