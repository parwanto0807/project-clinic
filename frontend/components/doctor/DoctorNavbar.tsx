'use client'

import { useAuthStore } from '@/lib/store/useAuthStore'
import { useUIStore } from '@/lib/store/useUIStore'
import { useRouter, usePathname } from 'next/navigation'
import { FiUser, FiSettings, FiLogOut, FiClock, FiActivity } from 'react-icons/fi'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'

export default function DoctorNavbar() {
  const { user, logout, activeClinicId } = useAuthStore()
  const { isDoctorSidebarCollapsed } = useUIStore()
  const router = useRouter()
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')

  const activeClinic = useMemo(() => {
    return user?.clinics?.find(c => c.id === activeClinicId)
  }, [user, activeClinicId])

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const pageTitle = useMemo(() => {
    if (pathname === '/doctor') return 'Beranda Dashboard'
    if (pathname.startsWith('/doctor/queue')) return 'Antrian & Pemeriksaan'
    if (pathname.startsWith('/doctor/patients')) return 'Database Rekam Medis'
    if (pathname.startsWith('/doctor/profile')) return 'Profil Dokter'
    if (pathname.startsWith('/doctor/settings')) return 'Pengaturan Stasiun'
    return 'Doctor Station'
  }, [pathname])

  return (
    <div className={`fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100/50 shadow-sm transition-all duration-300 ${isDoctorSidebarCollapsed ? 'lg:left-20' : 'lg:left-64'}`}>
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        {/* Left: Dynamic Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="sm:hidden w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <FiActivity className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-sm sm:text-lg font-black text-gray-900 truncate tracking-tight">
                {pageTitle}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-primary font-black uppercase tracking-widest hidden sm:block">
                  {activeClinic?.name || 'Yasfina Health System'}
                </p>
                {activeClinic?.address && (
                  <>
                    <div className="w-1 h-1 rounded-full bg-gray-300 hidden sm:block"></div>
                    <p className="text-[10px] text-gray-400 font-bold truncate max-w-[200px] hidden sm:block">
                      {activeClinic.address}
                    </p>
                  </>
                )}
                <div className="w-1 h-1 rounded-full bg-gray-300 hidden sm:block"></div>
                <p className="text-[10px] text-slate-500 font-black flex items-center gap-1.5 transition-all">
                  <FiClock className="w-3 h-3" />
                  {currentTime}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: User Menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 sm:gap-3 pl-1 pr-1 sm:pl-4 sm:pr-4 py-1 sm:py-2 rounded-2xl border border-gray-100 sm:border-gray-200 hover:bg-gray-50 hover:border-indigo-200 transition-all group"
          >
            <div className="w-8 h-8 rounded-xl overflow-hidden bg-gradient-to-tr from-indigo-500 to-primary flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform relative">
              {user?.image ? (
                <img 
                  src={user.image.startsWith('http') ? user.image : `${api.defaults.baseURL?.replace('/api/', '') || ''}${user.image}`} 
                  alt={user.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.name?.toLowerCase().startsWith('dr') && user?.name?.split(' ').length > 1
                  ? user?.name?.split(' ')[1]?.charAt(0)
                  : user?.name?.[0] || 'D'
              )}
            </div>
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-black text-gray-900 leading-tight">
                {user?.name?.toLowerCase().startsWith('dr') && user?.name?.split(' ').length > 1
                  ? user?.name?.split(' ').slice(0, 2).join(' ')
                  : user?.name?.split(' ')[0] || 'Doctor'}
              </span>
              <span className="text-[8px] text-primary font-black uppercase tracking-wider">Station Active</span>
            </div>
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-3 w-56 bg-white border border-gray-200 rounded-[1.5rem] shadow-2xl shadow-indigo-900/10 z-50 overflow-hidden"
                >
                  <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
                    <p className="text-xs font-black text-gray-900 uppercase tracking-wide truncate">{user?.name}</p>
                    <p className="text-[9px] text-gray-400 font-bold mt-1 truncate">{user?.email}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => {
                        router.push('/doctor/profile')
                        setDropdownOpen(false)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs text-gray-600 hover:bg-indigo-50 hover:text-primary rounded-xl transition-all font-black uppercase tracking-widest"
                    >
                      <FiUser className="w-4 h-4" />
                      View Profile
                    </button>
                  </div>
                  <div className="p-2 border-t border-gray-100">
                    <button
                      onClick={() => {
                        handleLogout()
                        setDropdownOpen(false)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs text-red-500 hover:bg-red-50 rounded-xl transition-all font-black uppercase tracking-widest"
                    >
                      <FiLogOut className="w-4 h-4" />
                      Terminating Session
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
