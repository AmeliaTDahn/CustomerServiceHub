import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type UserData = {
  identifier: string;
  password: string;
  role?: string;
  authMethod: 'email' | 'phone';
};

type VerificationData = {
  identifier: string;
  code: string;
  authMethod: 'email' | 'phone';
};

type User = {
  id: string;
  email?: string;
  phone?: string;
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
  body?: UserData | VerificationData
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
  const response = await fetch('/api/user', {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }

    if (response.status >= 500) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
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
    mutationFn: (userData) => handleRequest('/api/login', 'POST', userData),
    onSuccess: (result) => {
      if (result.ok && result.user) {
        queryClient.setQueryData(['user'], result.user);
      }
    },
  });

  const logoutMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest('/api/logout', 'POST'),
    onSuccess: () => {
      queryClient.setQueryData(['user'], null);
    },
  });

  const registerMutation = useMutation<RequestResult, Error, UserData>({
    mutationFn: (userData) => handleRequest('/api/register', 'POST', userData),
    onSuccess: (result) => {
      if (result.ok && result.user) {
        queryClient.setQueryData(['user'], result.user);
      }
    },
  });

  const verifyRegistrationMutation = useMutation<RequestResult, Error, VerificationData>({
    mutationFn: (verificationData) => handleRequest('/api/verify', 'POST', verificationData),
    onSuccess: (result) => {
      if (result.ok && result.user) {
        queryClient.setQueryData(['user'], result.user);
      }
    },
  });

  const deleteAccountMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest('/api/account', 'DELETE'),
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
    verifyRegistration: verifyRegistrationMutation.mutateAsync,
    deleteAccount: deleteAccountMutation.mutateAsync,
    refetch
  };
}