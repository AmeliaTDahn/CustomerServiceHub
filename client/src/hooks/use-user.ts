import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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

async function handleRequest(
  url: string,
  method: string,
  body?: UserData
): Promise<RequestResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status >= 500) {
        return { ok: false, message: response.statusText };
      }

      const message = await response.text();
      return { ok: false, message };
    }

    const data = await response.json();
    return { ok: true, user: data.user };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}

async function fetchUser(): Promise<User | null> {
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role },
          emailRedirectTo: `${window.location.origin}/verify`
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
    onSuccess: (result) => {
      if (result.ok && result.user) {
        queryClient.setQueryData(['user'], result.user);
      }
    },
  });

  const deleteAccountMutation = useMutation<RequestResult, Error>({
    mutationFn: async () => {
      const { error } = await supabase.auth.admin.deleteUser(user?.id!);
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
    deleteAccount: deleteAccountMutation.mutateAsync,
    refetch
  };
}