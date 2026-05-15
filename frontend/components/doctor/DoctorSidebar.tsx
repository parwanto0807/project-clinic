'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  FiHome, FiMenu, FiX, FiUsers, FiClock, FiLogOut, FiBookOpen
} from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'

const DOCTOR_MENU = [
  { icon: FiHome, label: 'Dashboard', href: '/doctor' },
  { icon: FiClock, label: 'Antrian Hari Ini', href: '/doctor/queue' },
  { icon: FiUsers, label: 'Riwayat Pasien', href: '/doctor/patients' },
  { icon: FiBookOpen, label: 'Master ICD-10', href: '/doctor/icd10' },
]

const DoctorSidebarItem = ({ 
  item, 
  pathname, 
  isMobile 
}: { 
  item: any; 
  pathname: string; 
  isMobile: boolean;
}) => {
  const isActive = pathname === item.href

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold ${
        isActive
          ? 'bg-primary/10 text-primary shadow-sm shadow-primary/10'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
      <span className="text-sm truncate">{item.label}</span>
      {isActive && <motion.span layoutId="active-dot" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </Link>
  )
}

export default function DoctorSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Brand */}
      <div className="flex-shrink-0 flex items-center h-24 px-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 text-white font-black text-xl">
            Y
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
            <span className="font-black text-lg text-gray-900 tracking-tight leading-none block">Yasfina</span>
            <span className="text-[9px] text-primary font-black uppercase tracking-widest mt-1 block">Doctor</span>
          </motion.div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 pb-3">
          MENU UTAMA
        </p>
        <div className="space-y-1">
          {DOCTOR_MENU.map((item) => (
            <DoctorSidebarItem 
              key={item.href} 
              item={item} 
              pathname={pathname} 
              isMobile={isMobile}
            />
          ))}
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100 space-y-3 bg-white">
        <div className="px-4 py-3 rounded-2xl bg-gray-50/80 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-primary flex items-center justify-center text-white font-bold text-xs">
              {user?.name?.[0] || 'D'}
            </div>
            <div className="flex-1">
              <p className="text-xs font-black text-gray-900 truncate">{user?.name || 'Doctor'}</p>
              <p className="text-[9px] font-bold text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold"
        >
          <FiLogOut className="w-5 h-5" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <>
        {/* Mobile Header Toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-white border border-gray-200 shadow-md"
        >
          {isOpen ? <FiX /> : <FiMenu />}
        </button>

        {/* Mobile Sidebar */}
        {isOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
            <div className="absolute top-0 left-0 w-64 h-full">
              <SidebarContent />
            </div>
          </motion.div>
        )}
      </>
    )
  }

  return (
    <div className="hidden lg:flex w-64 border-r border-gray-100 fixed h-screen left-0 top-0">
      <SidebarContent />
    </div>
  )
}
