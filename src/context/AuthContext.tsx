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
  signIn: (email: string, pass: string) => Promise<{ error?: string }>;
  signUp: (email: string, pass: string, name: string, role: UserRole) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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

  const signIn = async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) {
      return { error: error.message };
    }
    if (data.user) {
      await fetchProfile(data.user.id);
    }
    return {};
  };

  const signUp = async (email: string, pass: string, name: string, roleToRegister: UserRole) => {
    // Strict single founder verification on client before request
    if (roleToRegister === 'founder') {
      const alreadyClaimed = await checkFounderExists();
      if (alreadyClaimed) {
        return { error: 'A founder account already exists for this organization. Only one founder account is permitted.' };
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
      await fetchProfile(data.user.id);
      await refreshFounderStatus();
    }
    return {};
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
