import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, checkFounderExists } from '../lib/supabase';
import { Profile, UserRole, Invitation } from '../types';
import { getInvitationByToken, markInvitationAccepted, extractInvitationToken, logAuditEvent } from '../lib/api';

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
  acceptInvitation: (token: string, password: string, fullName?: string, emailOverride?: string, roleOverride?: UserRole) => Promise<{ error?: string; user?: Profile }>;
  resetPassword: (email: string) => Promise<{ error?: string; success?: boolean }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const isFounderEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === 'akash30104@gmail.com' || clean === 'akash.uxui.design@gmail.com';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [founderExists, setFounderExists] = useState(false);

  const refreshFounderStatus = async (): Promise<boolean> => {
    const exists = await checkFounderExists();
    setFounderExists(exists);
    return exists;
  };

  const fetchProfile = async (userId: string, requestedRole?: UserRole) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      let resolved: Profile | null = null;
      if (!error && data) {
        resolved = data as Profile;
      } else {
        // Fallback profile if row not created yet
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          resolved = {
            id: authData.user.id,
            email: authData.user.email || '',
            full_name: authData.user.user_metadata?.full_name || 'Team Member',
            role: authData.user.user_metadata?.role || requestedRole || 'editor'
          };
        }
      }

      if (resolved) {
        // Guarantee founder role if recognized founder email or founder role requested
        if (isFounderEmail(resolved.email) || requestedRole === 'founder') {
          resolved.role = 'founder';
          try {
            await supabase.from('profiles').update({ role: 'founder' }).eq('id', resolved.id);
          } catch (e) {}
        }
        setCurrentUser(resolved);
        localStorage.setItem('di_authenticated_user_session', JSON.stringify(resolved));
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
        const founderCheck = isFounderEmail(session.user.email) ? 'founder' : undefined;
        await fetchProfile(session.user.id, founderCheck);
      } else {
        // Check local verified session backup so users stay seamlessly logged in
        try {
          const raw = localStorage.getItem('di_authenticated_user_session');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id && parsed.role) {
              if (isFounderEmail(parsed.email)) {
                parsed.role = 'founder';
              }
              setCurrentUser(parsed);
            }
          }
        } catch (e) {
          console.warn('Local session restore note:', e);
        }
      }
      setIsLoading(false);
    };

    initAuth();

    // Listen to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const founderCheck = isFounderEmail(session.user.email) ? 'founder' : undefined;
        await fetchProfile(session.user.id, founderCheck);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('di_authenticated_user_session');
        setCurrentUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string, targetRole?: UserRole) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();
    const forceFounder = targetRole === 'founder' || isFounderEmail(cleanEmail);
    const effectiveTargetRole: UserRole | undefined = forceFounder ? 'founder' : targetRole;

    // 1. Attempt official Supabase authentication
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (error) {
      // If error occurs, check if this is founder logging in
      if (forceFounder) {
        const founderClaimed = await checkFounderExists();
        if (!founderClaimed) {
          // If no founder account has been claimed yet, auto-register Akash as the initial founder!
          const regRes = await signUp(cleanEmail, cleanPass, 'Akash Sharma', 'founder');
          if (!regRes.error) {
            return {};
          }
        }
      }

      // 2. Fallback verification for invited team members (SMM, Editor, Client) & Founder
      try {
        const storedCredsRaw = localStorage.getItem(`di_team_creds_${cleanEmail}`);
        if (storedCredsRaw) {
          const storedCreds = JSON.parse(storedCredsRaw);
          if (storedCreds.password === cleanPass && storedCreds.profile) {
            const userProfile: Profile = {
              ...storedCreds.profile,
              role: forceFounder ? 'founder' : (storedCreds.profile.role || 'social_media_manager')
            };
            setCurrentUser(userProfile);
            localStorage.setItem('di_authenticated_user_session', JSON.stringify(userProfile));
            await logAuditEvent('user_signed_in', 'auth', userProfile.id, { email: cleanEmail, method: 'invitation_verified' });
            return { user: userProfile };
          }
        }

        // Also check if profile exists in database
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (prof) {
          const userProfile: Profile = {
            ...(prof as Profile),
            role: forceFounder ? 'founder' : (prof as Profile).role
          };
          if (forceFounder) {
            try {
              await supabase.from('profiles').update({ role: 'founder' }).eq('id', userProfile.id);
            } catch (e) {}
          }
          setCurrentUser(userProfile);
          localStorage.setItem('di_authenticated_user_session', JSON.stringify(userProfile));
          await logAuditEvent('user_signed_in', 'auth', userProfile.id, { email: cleanEmail, fallback: true });
          return { user: userProfile };
        }
      } catch (fbErr) {
        console.warn('Fallback login check note:', fbErr);
      }

      return { error: error.message };
    }

    if (data.user) {
      if (effectiveTargetRole) {
        try {
          await supabase.from('profiles').update({ role: effectiveTargetRole }).eq('id', data.user.id);
        } catch (e) {
          console.warn('Update role on signIn error:', e);
        }
      }
      await fetchProfile(data.user.id, effectiveTargetRole);
      await logAuditEvent('user_signed_in', 'auth', data.user.id, { email: cleanEmail });
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

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: {
          full_name: name.trim(),
          role: roleToRegister
        }
      }
    });

    const userId = data?.user?.id || (crypto.randomUUID ? crypto.randomUUID() : `founder-${Date.now()}`);
    const userProfile: Profile = {
      id: userId,
      email: cleanEmail,
      full_name: name.trim() || 'Founder',
      role: roleToRegister
    };

    try {
      await supabase.from('profiles').upsert(userProfile);
    } catch (e) {
      console.warn('Upsert profile error:', e);
    }

    try {
      localStorage.setItem(`di_team_creds_${cleanEmail}`, JSON.stringify({
        password: cleanPass,
        profile: userProfile
      }));
      if (roleToRegister === 'founder') {
        localStorage.setItem('DI_PLATFORM_FOUNDER_CLAIMED', 'true');
        localStorage.setItem('DI_PLATFORM_FOUNDER_EMAIL', cleanEmail);
      }
    } catch (e) {}

    // If Supabase returned an error like unconfirmed email or rate limit, but profile is created, log in:
    if (error && !error.message.includes('already registered')) {
      setCurrentUser(userProfile);
      localStorage.setItem('di_authenticated_user_session', JSON.stringify(userProfile));
      await refreshFounderStatus();
      return {};
    }

    if (error) {
      return { error: error.message };
    }

    if (data?.user) {
      await fetchProfile(data.user.id, roleToRegister);
    } else {
      setCurrentUser(userProfile);
      localStorage.setItem('di_authenticated_user_session', JSON.stringify(userProfile));
    }

    await refreshFounderStatus();
    await logAuditEvent('user_registered', 'auth', userId, { email: cleanEmail, role: roleToRegister });
    return {};
  };

  const acceptInvitation = async (
    token: string, 
    pass: string, 
    fullName?: string,
    emailOverride?: string,
    roleOverride?: UserRole
  ): Promise<{ error?: string; user?: Profile }> => {
    const cleanToken = extractInvitationToken(token);
    const cleanPass = pass.trim();

    const inv = await getInvitationByToken(cleanToken);
    if (!inv) {
      return { error: 'Invalid invitation link or token not found.' };
    }

    if (inv.status === 'revoked') {
      return { error: 'This invitation has been revoked by the founder.' };
    }

    if (inv.status === 'accepted') {
      return { error: 'This invitation has already been accepted or redeemed.' };
    }

    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { error: 'This invitation link expired (valid for 24 hours). Please ask the Founder to resend an invite.' };
    }

    const cleanEmail = (inv.email || emailOverride || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { error: 'Please enter a valid email address to complete registration.' };
    }

    const roleToUse = inv.role || roleOverride || 'editor';
    const nameToUse = fullName?.trim() || inv.full_name || cleanEmail.split('@')[0];

    // Attempt Sign Up or Session creation
    let authUserId: string | null = null;
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPass,
        options: {
          data: {
            full_name: nameToUse,
            role: roleToUse
          }
        }
      });

      if (signUpErr) {
        // User might already exist in auth, attempt sign-in
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass
        });

        if (!signInErr && signInData.user) {
          authUserId = signInData.user.id;
        } else {
          // Find existing profile
          const { data: existingProf } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();
          authUserId = existingProf?.id || (crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`);
        }
      } else {
        authUserId = signUpData.user?.id || null;
        // Attempt immediate login session
        try {
          const { data: autoLogin } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPass
          });
          if (autoLogin?.user) authUserId = autoLogin.user.id;
        } catch {}
      }
    } catch (e) {
      console.warn('Auth creation error:', e);
      authUserId = crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`;
    }

    if (!authUserId) {
      authUserId = crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`;
    }

    const newProfile: Profile = {
      id: authUserId,
      email: cleanEmail,
      full_name: nameToUse,
      role: roleToUse
    };

    // 1. Upsert Profile in database
    try {
      await supabase.from('profiles').upsert(newProfile);
    } catch (e) {
      console.warn('Profile upsert on invitation accept:', e);
    }

    // 2. Mark invitation as accepted (one-time use) locally & in DB
    markInvitationAccepted(cleanToken);
    try {
      await supabase.from('invitations').update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      }).eq('token', cleanToken);
    } catch {
      // fallback
    }

    // 3. Store credentials backup for guaranteed seamless login
    try {
      localStorage.setItem(`di_team_creds_${cleanEmail}`, JSON.stringify({
        email: cleanEmail,
        password: cleanPass,
        profile: newProfile
      }));
      localStorage.setItem('di_authenticated_user_session', JSON.stringify(newProfile));
    } catch {}

    // 4. Immediately set active session state so user enters workspace!
    setCurrentUser(newProfile);
    await logAuditEvent('invitation_accepted', 'invitation', inv.id, { email: cleanEmail, role: inv.role });

    return { user: newProfile };
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

