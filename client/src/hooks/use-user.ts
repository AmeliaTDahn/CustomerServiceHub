import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

type UserData = {
  email: string;
  password: string;
  role?: string;
};

type User = {
  id: string;
  email: string;
  role: string;
};

type RequestResult = {
  ok: true;
  user?: User;
} | {
  ok: false;
  message: string;
};

async function fetchUser(): Promise<User | null> {
  const supabase = await getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email!,
    role: session.user.user_metadata.role
  };
}

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, error, isLoading, refetch } = useQuery<User | null, Error>({
    queryKey: ['user'],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false
  });

  const loginMutation = useMutation<RequestResult, Error, UserData>({
    mutationFn: async ({ email, password }) => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { ok: false, message: error.message };
      }

      return { 
        ok: true, 
        user: {
          id: data.user.id,
          email: data.user.email!,
          role: data.user.user_metadata.role
        }
      };
    },
    onSuccess: (result) => {
      if (result.ok && result.user) {
        queryClient.setQueryData(['user'], result.user);
      }
    },
  });

  const logoutMutation = useMutation<RequestResult, Error>({
    mutationFn: async () => {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.setQueryData(['user'], null);
    },
  });

  const registerMutation = useMutation<RequestResult, Error, UserData>({
    mutationFn: async ({ email, password, role }) => {
      const supabase = await getSupabase();
      // First, sign up the user without auto-confirming
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role },
          emailRedirectTo: undefined // Disable email redirect
        }
      });

      if (error) {
        return { ok: false, message: error.message };
      }

      return { 
        ok: true,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email!,
          role: data.user.user_metadata.role
        } : undefined
      };
    },
  });

  const verifyOtpMutation = useMutation<RequestResult, Error, { email: string; token: string }>({
    mutationFn: async ({ email, token }) => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (error) {
        return { ok: false, message: error.message };
      }

      return {
        ok: true,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email!,
          role: data.user.user_metadata.role
        } : undefined
      };
    },
    onSuccess: (result) => {
      if (result.ok && result.user) {
        queryClient.setQueryData(['user'], result.user);
      }
    },
  });

  const deleteAccountMutation = useMutation<RequestResult, Error>({
    mutationFn: async () => {
      const supabase = await getSupabase();
      const session = await supabase.auth.getSession();
      if (!session.data.session?.user.id) {
        return { ok: false, message: "Not authenticated" };
      }

      const { error } = await supabase.auth.admin.deleteUser(
        session.data.session.user.id
      );

      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.setQueryData(['user'], null);
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    verifyOtp: verifyOtpMutation.mutateAsync,
    deleteAccount: deleteAccountMutation.mutateAsync,
    refetch
  };
}