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

      console.log('Profile fetched:', data);
      return data as Profile;
    } catch (error) {
      console.error('Error in getProfile:', error);
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          return;
        }

        if (session?.user) {
          setSession(session);
          setUser(session.user);
          const profile = await getProfile(session.user.id);
          setProfile(profile);
        }
      } catch (error) {
        console.error('Error during auth initialization:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const profile = await getProfile(session.user.id);
        setProfile(profile);
        if (profile) {
          setLocation('/');
        }
      } else {
        setProfile(null);
        setLocation('/auth');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Auth state change listener will handle the rest
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, role: 'business' | 'customer' | 'employee') => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Create initial profile
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          username: email,
          role: role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          throw profileError;
        }
      }

      // Auth state change listener will handle the rest
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return (
    <SupabaseContext.Provider
      value={{
        user,
        profile,
        session,
        signIn,
        signUp,
        signOut,
        isLoading,
      }}
    >
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