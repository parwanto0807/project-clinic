import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'DOCTOR' | 'NURSE' | 'RECEPTIONIST' | 'FARMASI' | 'ACCOUNTING' | 'LOGISTIC' | 'STAFF'

interface Clinic {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  isMain?: boolean
}

interface User {
  id: string
  email: string
  username: string
  name: string
  role: Role
  image?: string
  clinics?: Clinic[]
  permissions?: string[]
}

interface AuthState {
  user: User | null
  activeClinicId: string | null
  isAuthenticated: boolean
  sessionExpiredMessage: string | null
  // Token lives in HttpOnly cookie — never stored in JS
  setAuth: (user: User, clinicId?: string) => void
  setActiveClinicId: (id: string) => void
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearSessionMessage: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      activeClinicId: null,
      isAuthenticated: false,
      sessionExpiredMessage: null,

      setAuth: (user, clinicId) => {
        const activeId = clinicId || user.clinics?.[0]?.id || null
        if (typeof window !== 'undefined' && activeId) {
          localStorage.setItem('activeClinicId', activeId)
        }
        set({ user, isAuthenticated: true, activeClinicId: activeId, sessionExpiredMessage: null })
      },

      setActiveClinicId: (id) => {
        if (typeof window !== 'undefined') localStorage.setItem('activeClinicId', id)
        set({ activeClinicId: id })
      },

      logout: async () => {
        try {
          // Backend clears BOTH auth_token and refresh_token cookies
          await api.post('auth/logout')
        } catch {
          // Proceed even if network fails
        } finally {
          _clearLocalState()
          set({ user: null, activeClinicId: null, isAuthenticated: false, sessionExpiredMessage: null })
          window.location.href = '/login'
        }
      },

      checkAuth: async () => {
        try {
          const response = await api.get('auth/me')
          const userData = response.data

          let currentActiveId = get().activeClinicId
          if (!currentActiveId && userData.clinics?.length > 0) {
            currentActiveId = userData.clinics[0].id
            if (typeof window !== 'undefined' && currentActiveId) {
              localStorage.setItem('activeClinicId', currentActiveId)
            }
          }

          set({ user: userData, activeClinicId: currentActiveId, isAuthenticated: true })
        } catch {
          // Cookie expired or invalid — clear state but don't redirect here
          // (api.ts interceptor handles redirect for non-login pages)
          _clearLocalState()
          set({ user: null, activeClinicId: null, isAuthenticated: false })
        }
      },

      clearSessionMessage: () => set({ sessionExpiredMessage: null }),
    }),
    {
      name: 'auth-storage',
      // Only persist non-sensitive UI state — token is in HttpOnly cookie
      partialize: (state) => ({
        user: state.user,
        activeClinicId: state.activeClinicId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

function _clearLocalState() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('activeClinicId')
  localStorage.removeItem('token') // clean up any legacy token
}
