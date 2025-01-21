import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';

type SupabaseContextType = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: 'business' | 'customer' | 'employee') => Promise<void>;
  signOut: () => Promise<void>;
  isLoading: boolean;
};

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Fetch profile data safely
  const getProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      console.log('Profile fetched successfully:', data);
      return data as Profile;
    } catch (error) {
      console.error('Error in getProfile:', error);
      return null;
    }
  };

  // Update auth state and profile
  const updateAuthState = async (session: Session | null) => {
    console.log('Updating auth state with session:', session);
    setSession(session);
    setUser(session?.user ?? null);

    if (session?.user) {
      const profile = await getProfile(session.user.id);
      console.log('Setting profile:', profile);
      setProfile(profile);
      if (profile) {
        // Redirect based on user role
        if (profile.role === 'business' || profile.role === 'employee') {
          setLocation('/');
        } else {
          setLocation('/');
        }
      }
    } else {
      setProfile(null);
      setLocation('/auth');
    }
  };

  useEffect(() => {
    // Handle initial session
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await updateAuthState(session);
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('Auth state changed:', _event, session);
      await updateAuthState(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Attempting sign in for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await updateAuthState(data.session);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, role: 'business' | 'customer' | 'employee') => {
    try {
      console.log('Attempting sign up for:', email, 'with role:', role);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role }
        }
      });
      if (error) throw error;

      if (data.session) {
        // Create profile after successful signup
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user?.id,
            email: data.user?.email,
            role: role,
            username: email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          throw profileError;
        }

        await updateAuthState(data.session);
      }
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await updateAuthState(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    profile,
    session,
    signIn,
    signUp,
    signOut,
    isLoading
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
}