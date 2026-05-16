'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  FiHome, FiMenu, FiX, FiUsers, FiClock, FiLogOut, FiBookOpen, FiChevronLeft, FiChevronRight
} from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { useUIStore } from '@/lib/store/useUIStore'

const DOCTOR_MENU = [
  { icon: FiHome, label: 'Dashboard', href: '/doctor' },
  { icon: FiClock, label: 'Antrian Hari Ini', href: '/doctor/queue' },
  { icon: FiUsers, label: 'Riwayat Pasien', href: '/doctor/patients' },
  { icon: FiBookOpen, label: 'Master ICD-10', href: '/doctor/icd10' },
]

const DoctorSidebarItem = ({ 
  item, 
  pathname, 
  isMobile,
  isCollapsed
}: { 
  item: any; 
  pathname: string; 
  isMobile: boolean;
  isCollapsed: boolean;
}) => {
  const isActive = pathname === item.href

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 py-3 rounded-xl transition-all font-bold group relative ${
        isCollapsed ? 'justify-center px-0' : 'px-4'
      } ${
        isActive
          ? 'bg-primary/10 text-primary shadow-sm shadow-primary/10'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
      title={isCollapsed ? item.label : undefined}
    >
      <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary' : ''}`} />
      {!isCollapsed && <span className="text-sm truncate">{item.label}</span>}
      
      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white font-bold text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[100] shadow-xl shadow-gray-900/20 translate-x-2 group-hover:translate-x-0">
          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45 rounded-sm" />
          {item.label}
        </div>
      )}

      {!isCollapsed && isActive && <motion.span layoutId="active-dot" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </Link>
  )
}

export default function DoctorSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { isDoctorSidebarCollapsed: isCollapsed, toggleDoctorSidebar } = useUIStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white relative">
      {/* Toggle Button for Desktop */}
      {!isMobile && (
        <button
          onClick={toggleDoctorSidebar}
          className="absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-primary hover:border-primary shadow-sm z-50 transition-colors"
        >
          {isCollapsed ? <FiChevronRight className="w-3 h-3" /> : <FiChevronLeft className="w-3 h-3" />}
        </button>
      )}

      {/* Brand */}
      <div className={`flex-shrink-0 flex items-center h-24 border-b border-gray-100 ${isCollapsed ? 'justify-center px-0' : 'px-6'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 text-white font-black text-xl">
            Y
          </div>
          {!isCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
              <span className="font-black text-lg text-gray-900 tracking-tight leading-none block">Yasfina</span>
              <span className="text-[9px] text-primary font-black uppercase tracking-widest mt-1 block">Doctor</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-6 space-y-2 ${isCollapsed ? 'px-3' : 'px-4'}`}>
        {!isCollapsed && (
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 pb-3">
            MENU UTAMA
          </p>
        )}
        <div className="space-y-1">
          {DOCTOR_MENU.map((item) => (
            <DoctorSidebarItem 
              key={item.href} 
              item={item} 
              pathname={pathname} 
              isMobile={isMobile}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      </nav>

      {/* User Profile */}
      <div className={`border-t border-gray-100 space-y-3 bg-white ${isCollapsed ? 'p-3' : 'p-4'}`}>
        {!isCollapsed ? (
          <div className="px-4 py-3 rounded-2xl bg-gray-50/80 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-tr from-indigo-500 to-primary flex items-center justify-center text-white font-bold text-xs">
                {user?.name?.[0] || 'D'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-gray-900 truncate">{user?.name || 'Doctor'}</p>
                <p className="text-[9px] font-bold text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-indigo-500 to-primary flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {user?.name?.[0] || 'D'}
          </div>
        )}

        <button
          onClick={logout}
          title={isCollapsed ? 'Logout' : undefined}
          className={`w-full flex items-center transition-all font-bold text-red-500 hover:bg-red-50 ${isCollapsed ? 'justify-center p-3 rounded-xl' : 'gap-3 px-4 py-3 rounded-xl'}`}
        >
          <FiLogOut className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden flex justify-around items-center bg-white/90 backdrop-blur-2xl border-t border-gray-100/50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe-area">
        {DOCTOR_MENU.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-3 flex-1 relative transition-colors ${
                isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <item.icon className={`w-5 h-5 mb-1 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
              {isActive && (
                <motion.div layoutId="mobile-active-tab" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-b-full" />
              )}
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`hidden lg:flex border-r border-gray-100 fixed h-screen left-0 top-0 transition-all duration-300 z-50 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <SidebarContent />
    </div>
  )
}
