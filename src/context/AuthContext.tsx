import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, checkFounderExists } from '../lib/supabase';
import { Profile, UserRole } from '../types';

interface AuthContextType {
  currentUser: Profile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  founderExists: boolean;
  refreshFounderStatus: () => Promise<boolean>;
  signIn: (email: string, pass: string, targetRole?: UserRole) => Promise<{ error?: string }>;
  signUp: (email: string, pass: string, name: string, role: UserRole, allowMultipleFounders?: boolean) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchRole: (newRole: UserRole) => Promise<void>;
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
    }
    return {};
  };

  const signUp = async (email: string, pass: string, name: string, roleToRegister: UserRole, allowMultipleFounders = false) => {
    // Check if founder already claimed unless bypassed via developer founder option
    if (roleToRegister === 'founder' && !allowMultipleFounders) {
      const alreadyClaimed = await checkFounderExists();
      if (alreadyClaimed) {
        return { error: 'A primary founder account already exists. Tap the logo above for the Developer Option to add another founder.' };
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
    }
    return {};
  };

  const switchRole = async (newRole: UserRole) => {
    if (!currentUser?.id) return;
    try {
      await supabase.from('profiles').update({ role: newRole }).eq('id', currentUser.id);
      await fetchProfile(currentUser.id);
    } catch (err) {
      console.error('Error switching role:', err);
    }
  };

  const signOut = async () => {
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
        refreshFounderStatus,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        switchRole,
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
