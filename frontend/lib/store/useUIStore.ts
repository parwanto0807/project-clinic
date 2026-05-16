import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIStore {
  isDoctorSidebarCollapsed: boolean
  toggleDoctorSidebar: () => void
  setDoctorSidebarCollapsed: (collapsed: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      isDoctorSidebarCollapsed: false,
      toggleDoctorSidebar: () => set((state) => ({ isDoctorSidebarCollapsed: !state.isDoctorSidebarCollapsed })),
      setDoctorSidebarCollapsed: (collapsed: boolean) => set({ isDoctorSidebarCollapsed: collapsed }),
    }),
    {
      name: 'clinic-ui-store',
    }
  )
)
