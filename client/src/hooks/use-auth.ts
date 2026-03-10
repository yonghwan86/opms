import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  positionName?: string | null;
  departmentName?: string | null;
  role: string;
  headquartersId?: number | null;
  teamId?: number | null;
  enabled: boolean;
  mustChangePassword: boolean;
}

export function useAuth() {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.needsPasswordSetup) {
        qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    },
  });

  const setupPasswordMutation = useMutation({
    mutationFn: async (payload: { email: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/setup-password", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout", {});
    },
    onSuccess: () => {
      qc.clear();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    loginPending: loginMutation.isPending,
    loginError: loginMutation.error,
    setupPassword: setupPasswordMutation.mutateAsync,
    setupPasswordPending: setupPasswordMutation.isPending,
    logout: logoutMutation.mutateAsync,
    isMaster: user?.role === "MASTER",
  };
}
