'use client'

import { useState, useRef, useEffect } from 'react'
import { FiSearch, FiBell, FiUser, FiChevronDown, FiMenu, FiLogOut, FiLock, FiUserCheck, FiSun, FiMoon } from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { useThemeStore } from '@/lib/store/useThemeStore'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import ClinicSwitcher from './ClinicSwitcher'
import api from '@/lib/api'

interface AdminNavbarProps {
  onMobileMenuOpen?: () => void
}

export default function AdminNavbar({ onMobileMenuOpen }: AdminNavbarProps) {
  const user = useAuthStore(state => state.user)
  const activeClinicId = useAuthStore(state => state.activeClinicId)
  const logout = useAuthStore(state => state.logout)
  const { theme, toggleTheme } = useThemeStore()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const clinics = user?.clinics || []
  const activeClinic = clinics.find(c => c.id === activeClinicId) || clinics[0]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header
      className="h-11 sm:h-12 backdrop-blur-md border-b flex items-center justify-between px-2 sm:px-3 sticky top-0 z-40 shadow-sm"
      style={{ backgroundColor: 'var(--navbar-bg)', borderColor: 'var(--navbar-border)' }}
    >
      {/* Left: Hamburger (mobile) + Search + Branch */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile hamburger — triggers sidebar drawer */}
        <button
          onClick={onMobileMenuOpen}
          className="lg:hidden p-2 rounded-lg transition-all active:scale-95 flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
          aria-label="Buka menu"
        >
          <FiMenu className="w-4 h-4" />
        </button>

        {/* Search — only on xl+ */}
        <div className="relative hidden xl:block">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--text-faint)' }} />
          <input
            type="text"
            placeholder="Cari sesuatu..."
            className="w-48 pl-8 pr-3 py-1.5 border rounded-lg focus:ring-1 focus:ring-primary/20 focus:border-primary/30 transition-all text-[10px] font-medium placeholder:opacity-50"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--text-secondary)' }}
          />
        </div>

        {/* Active branch badge */}
        {activeClinic && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-default transition-all min-w-0"
            style={{ backgroundColor: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.12)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" />
            <span className="text-[10px] font-extrabold text-primary tracking-tight truncate max-w-[120px] sm:max-w-[160px]">
              {activeClinic.name}
            </span>
          </div>
        )}
      </div>

      {/* Right: Notifications + Theme Toggle + Profile */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl transition-all hover:rotate-[15deg] active:scale-90"
          style={{ 
            backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(14,165,233,0.05)', 
            color: theme === 'dark' ? '#fbbf24' : '#0ea5e9',
            border: theme === 'dark' ? '1px solid rgba(251,191,36,0.1)' : '1px solid rgba(14,165,233,0.1)'
          }}
          title={theme === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
        >
          {theme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
        </button>

        {/* Notification bell */}
        <button
          className="relative p-2 rounded-xl transition-all"
          style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
        >
          <FiBell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
        </button>

        <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: 'var(--border)' }} />

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-2 group"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 relative overflow-hidden rounded-lg border transition-all flex items-center justify-center shadow-sm"
              style={{ 
                borderColor: 'rgba(255,255,255,0.1)', 
                background: 'linear-gradient(135deg, var(--primary) 0%, #0ea5e9 100%)' 
              }}
            >
              {user?.image ? (
                <img 
                  src={user.image.startsWith('http') ? user.image : `${api.defaults.baseURL?.replace('/api/', '') || ''}${user.image}`} 
                  alt={user.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] sm:text-xs font-black text-white uppercase tracking-tighter">
                  {user?.name?.toLowerCase().startsWith('dr') && user?.name?.split(' ').length > 1
                    ? user?.name?.split(' ')[1]?.charAt(0)
                    : user?.name?.charAt(0) || 'U'}
                </span>
              )}
              {/* Subtle glass reflection */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/20 pointer-events-none" />
            </div>

            {/* Name + role — hidden on mobile */}
            <div className="hidden sm:block text-left">
              <p className="text-[11px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                {user?.name?.toLowerCase().startsWith('dr') && user?.name?.split(' ').length > 1
                  ? user?.name?.split(' ').slice(0, 2).join(' ')
                  : user?.name?.split(' ')[0] || 'Admin'}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-tight" style={{ color: 'var(--text-faint)' }}>
                {user?.role}
              </p>
            </div>

            <FiChevronDown
              className={`w-3 h-3 transition-transform duration-200 hidden sm:block ${isDropdownOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--text-faint)' }}
            />
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl border py-2 z-50 overflow-hidden"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                {/* Profile summary */}
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-faint)' }}>Masuk sebagai</p>
                  <p className="text-sm font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-tight">{user?.role}</p>
                </div>

                <div className="px-2 pt-1">
                  <Link
                    href="/admin/profile"
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold rounded-xl transition-all"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setIsDropdownOpen(false)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
                      <FiUserCheck className="w-3.5 h-3.5" />
                    </div>
                    Profil Saya
                  </Link>

                  <div className="h-px my-1.5 mx-2" style={{ backgroundColor: 'var(--border)' }} />

                  <button
                    onClick={() => { setIsDropdownOpen(false); logout() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
                      <FiLogOut className="w-3.5 h-3.5" />
                    </div>
                    Keluar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
