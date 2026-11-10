import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, checkFounderExists } from '../lib/supabase';
import { Profile, UserRole, Invitation } from '../types';
import { getInvitationByToken, logAuditEvent } from '../lib/api';

interface AuthContextType {
  currentUser: Profile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  founderExists: boolean;
  isSuspended: boolean;
  refreshFounderStatus: () => Promise<boolean>;
  signIn: (email: string, pass: string, targetRole?: UserRole) => Promise<{ error?: string }>;
  signUp: (email: string, pass: string, name: string, role: UserRole, allowMultipleFounders?: boolean) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchRole: (newRole: UserRole) => Promise<void>;
  acceptInvitation: (token: string, password: string, fullName?: string) => Promise<{ error?: string; user?: Profile }>;
  resetPassword: (email: string) => Promise<{ error?: string; success?: boolean }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [founderExists, setFounderExists] = useState(false);

  const refreshFounderStatus = async (): Promise<boolean> => {
    const exists = await checkFounderExists();
    setFounderExists(exists);
    return exists;
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setCurrentUser(data as Profile);
      } else {
        // Fallback profile if row not created yet
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          setCurrentUser({
            id: authData.user.id,
            email: authData.user.email || '',
            full_name: authData.user.user_metadata?.full_name || 'Team Member',
            role: authData.user.user_metadata?.role || 'editor'
          });
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  useEffect(() => {
    // Initial session restore
    const initAuth = async () => {
      setIsLoading(true);
      await refreshFounderStatus();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setIsLoading(false);
    };

    initAuth();

    // Listen to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setCurrentUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string, targetRole?: UserRole) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) {
      return { error: error.message };
    }
    if (data.user) {
      if (targetRole) {
        try {
          await supabase.from('profiles').update({ role: targetRole }).eq('id', data.user.id);
        } catch (e) {
          console.warn('Update role on signIn error:', e);
        }
      }
      await fetchProfile(data.user.id);
      await logAuditEvent('user_signed_in', 'auth', data.user.id, { email });
    }
    return {};
  };

  const signUp = async (email: string, pass: string, name: string, roleToRegister: UserRole) => {
    // Strictly only ONE founder is permitted in the entire company platform
    if (roleToRegister === 'founder') {
      const alreadyClaimed = await checkFounderExists();
      if (alreadyClaimed) {
        return { error: 'Only one Founder account is permitted for this platform.' };
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: {
          full_name: name,
          role: roleToRegister
        }
      }
    });

    if (error) {
      return { error: error.message };
    }

    if (data.user) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: email,
          full_name: name,
          role: roleToRegister
        });
      } catch (e) {
        console.warn('Upsert profile error:', e);
      }
      await fetchProfile(data.user.id);
      await refreshFounderStatus();
      await logAuditEvent('user_registered', 'auth', data.user.id, { email, role: roleToRegister });
    }
    return {};
  };

  const acceptInvitation = async (token: string, pass: string, fullName?: string): Promise<{ error?: string; user?: Profile }> => {
    const inv = await getInvitationByToken(token);
    if (!inv) {
      return { error: 'Invalid invitation link or token not found.' };
    }

    if (inv.status !== 'pending') {
      return { error: 'This invitation has already been accepted or revoked.' };
    }

    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { error: 'This invitation link expired (valid for 24 hours). Please ask the Founder to resend an invite.' };
    }

    const nameToUse = fullName || inv.full_name || inv.email.split('@')[0];

    // Attempt Sign Up or Password update
    let authUserId: string | null = null;
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: inv.email,
      password: pass,
      options: {
        data: {
          full_name: nameToUse,
          role: inv.role
        }
      }
    });

    if (signUpErr) {
      // User might already exist in auth, attempt sign-in
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: inv.email,
        password: pass
      });

      if (signInErr) {
        return { error: `Authentication failed: ${signUpErr.message}` };
      }
      authUserId = signInData.user?.id || null;
    } else {
      authUserId = signUpData.user?.id || null;
    }

    if (!authUserId) {
      return { error: 'Failed to create user account session.' };
    }

    // Upsert Profile
    try {
      await supabase.from('profiles').upsert({
        id: authUserId,
        email: inv.email,
        full_name: nameToUse,
        role: inv.role
      });
    } catch (e) {
      console.warn('Profile upsert on invitation accept:', e);
    }

    // Invalidate invitation immediately (one-time use)
    try {
      await supabase.from('invitations').update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      }).eq('token', token);
    } catch {
      // fallback
    }

    await fetchProfile(authUserId);
    await logAuditEvent('invitation_accepted', 'invitation', inv.id, { email: inv.email, role: inv.role });

    return { user: currentUser || undefined };
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/#reset-password`
      });
      if (error) return { error: error.message };
      return { success: true };
    } catch (err: any) {
      return { error: err.message || 'Failed to send password reset email.' };
    }
  };

  const switchRole = async (newRole: UserRole) => {
    if (!currentUser?.id) return;
    try {
      await supabase.from('profiles').update({ role: newRole }).eq('id', currentUser.id);
      await fetchProfile(currentUser.id);
      await logAuditEvent('role_switched', 'profile', currentUser.id, { new_role: newRole });
    } catch (err) {
      console.error('Error switching role:', err);
    }
  };

  const signOut = async () => {
    if (currentUser) {
      await logAuditEvent('user_signed_out', 'auth', currentUser.id);
    }
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  const refreshProfile = async () => {
    if (currentUser?.id) {
      await fetchProfile(currentUser.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || 'editor',
        isAuthenticated: !!currentUser,
        isLoading,
        founderExists,
        isSuspended: !!currentUser?.is_suspended,
        refreshFounderStatus,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        switchRole,
        acceptInvitation,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

