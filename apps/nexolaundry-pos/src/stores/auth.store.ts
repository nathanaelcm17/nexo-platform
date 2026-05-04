import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
}

interface AuthTenant {
  tenantId: string;
  slug: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tenantSlug:   string | null;
  user:         AuthUser   | null;
  tenant:       AuthTenant | null;
  setAuth: (data: {
    accessToken:  string;
    refreshToken: string;
    user:   AuthUser;
    tenant: AuthTenant;
  }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken:  null,
      refreshToken: null,
      tenantSlug:   null,
      user:         null,
      tenant:       null,
      setAuth: ({ accessToken, refreshToken, user, tenant }) =>
        set({ accessToken, refreshToken, tenantSlug: tenant.slug, user, tenant }),
      clearAuth: () =>
        set({ accessToken: null, refreshToken: null, tenantSlug: null, user: null, tenant: null }),
    }),
    { name: 'nexo-auth' },
  ),
);
