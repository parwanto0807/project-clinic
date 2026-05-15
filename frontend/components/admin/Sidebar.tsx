'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FiHome, FiGlobe, FiUsers, FiCalendar, FiUserPlus,
  FiSettings, FiLogOut, FiChevronDown, FiDatabase,
  FiBriefcase, FiUserCheck, FiClock, FiActivity,
  FiPackage, FiShoppingBag, FiList, FiMenu, FiX, FiBox,
  FiChevronLeft, FiFolder, FiCpu, FiPlus, FiDollarSign, FiFileText, FiTrendingUp, FiLayers, FiBookOpen, FiLock, FiCreditCard,
  FiTool, FiRepeat, FiShield, FiBarChart2, FiAlertCircle, FiArchive
} from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import ClinicSwitcher from './ClinicSwitcher'

// --- Types & Constants ---
import {
  MAIN_MENU, LAYANAN_UTAMA_GROUPS, FINANCE_GROUPS, LOGISTIK_GROUPS, ASSET_GROUPS, MASTER_GROUPS
} from '@/lib/menuConfig'

// --- Floating Menu Component ---
const FloatingMenu = ({
  label,
  items,
  visible,
  top,
  pathname,
  onMouseEnter,
  onMouseLeave
}: {
  label: string;
  items?: any[];
  visible: boolean;
  top: number;
  pathname: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="fixed z-[100] min-w-[220px] rounded-2xl shadow-2xl border border-white/10 backdrop-blur-xl p-2.5"
          style={{ 
            left: '74px', 
            top: Math.max(10, Math.min(top, typeof window !== 'undefined' ? window.innerHeight - 300 : top)),
            backgroundColor: 'var(--sidebar-bg)',
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
            borderLeft: '3px solid var(--primary)'
          }}
        >
          <div className="px-3 py-2 mb-1.5 border-b border-white/5">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-50" style={{ color: 'var(--text-primary)' }}>
              {label}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {items && items.length > 0 ? (
              items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[13px] font-bold group/float"
                    style={{
                      backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--text-muted)',
                    }}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'group-hover/float:text-primary'}`} />
                    <span className="truncate tracking-tight">{item.label}</span>
                  </Link>
                )
              })
            ) : (
              <div className="px-3 py-2 text-[11px] font-bold italic opacity-30">No sub-items</div>
            )}
          </div>
          {/* Connector Arrow */}
          <div className="absolute left-[-6px] top-4 w-3 h-3 rotate-45 border-l border-b border-white/10" style={{ backgroundColor: 'var(--sidebar-bg)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// --- Nav Item Component ---
const SidebarNavItem = ({
  item,
  pathname,
  isCollapsed,
  isMobile
}: {
  item: any;
  pathname: string;
  isCollapsed: boolean;
  isMobile: boolean;
}) => {
  const [hover, setHover] = useState(false)
  const [menuTop, setMenuTop] = useState(0)
  const timeoutRef = useRef<any>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const isActive = pathname === item.href

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect()
      setMenuTop(rect.top)
    }
    setHover(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHover(false), 100)
  }

  return (
    <div
      ref={itemRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
    >
      <Link
        href={item.href}
        className={`flex items-center rounded-xl transition-all group ${isCollapsed && !isMobile ? 'justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-2.5'
          }`}
        style={{
          backgroundColor: isActive ? 'var(--sidebar-item-active)' : 'transparent',
          color: isActive ? 'var(--primary)' : 'var(--text-muted)',
          fontWeight: isActive ? '800' : '600',
        }}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {(!isCollapsed || isMobile) && <span className="text-[13px] truncate tracking-tight">{item.label}</span>}
        {isActive && !isCollapsed && (
          <motion.span layoutId="active-dot" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </Link>
      {isCollapsed && !isMobile && (
        <FloatingMenu 
          label={item.label} 
          visible={hover} 
          top={menuTop} 
          pathname={pathname}
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            setHover(true)
          }}
          onMouseLeave={() => setHover(false)}
        />
      )}
    </div>
  )
}

// --- Nav Group Component ---
const SidebarNavGroup = ({
  group,
  pathname,
  isCollapsed,
  isMobile,
  openGroups,
  toggleGroup,
  accentColor = 'primary',
  user
}: {
  group: any;
  pathname: string;
  isCollapsed: boolean;
  isMobile: boolean;
  openGroups: string[];
  toggleGroup: (label: string) => void;
  accentColor?: 'primary' | 'indigo';
  user?: any;
}) => {
  const [hover, setHover] = useState(false)
  const [menuTop, setMenuTop] = useState(0)
  const timeoutRef = useRef<any>(null)
  const groupRef = useRef<HTMLDivElement>(null)

  const isGroupActive = useMemo(() => group.items.some((i: any) => pathname === i.href), [group.items, pathname])
  const isOpen = openGroups.includes(group.label) || isGroupActive

  // Check Permissions
  const hasRoleAccess = group.roles ? group.roles.includes(user?.role) : false;
  const hasModuleAccess = user?.role === 'SUPER_ADMIN' || (group.moduleId && user?.permissions?.includes(group.moduleId));

  if (!hasRoleAccess && !hasModuleAccess) {
    return null;
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (groupRef.current) {
      const rect = groupRef.current.getBoundingClientRect()
      setMenuTop(rect.top)
    }
    setHover(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHover(false), 100)
  }

  const filteredItems = group.items.filter((item: any) => {
    if (item.roles) return item.roles.includes(user?.role)
    if (item.role) return user?.role === item.role
    return true
  })

  return (
    <div 
      ref={groupRef}
      className="relative" 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => toggleGroup(group.label)}
        className={`flex items-center rounded-xl transition-all ${isCollapsed && !isMobile ? 'justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-2.5 w-full'}`}
        style={{
          backgroundColor: isGroupActive && !isOpen ? 'var(--sidebar-item-active)' : 'transparent',
          color: isGroupActive ? 'var(--primary)' : 'var(--text-muted)',
        }}
      >
        <group.icon className={`w-5 h-5 flex-shrink-0`} />
        {(!isCollapsed || isMobile) && (
          <>
            <span className={`text-[13px] flex-1 text-left truncate font-extrabold tracking-tight`}>{group.label}</span>
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
              <FiChevronDown className="w-3.5 h-3.5 opacity-40" />
            </motion.div>
          </>
        )}
      </button>
      
      {isCollapsed && !isMobile && (
        <FloatingMenu 
          label={group.label} 
          items={filteredItems}
          visible={hover} 
          top={menuTop} 
          pathname={pathname}
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            setHover(true)
          }}
          onMouseLeave={() => setHover(false)}
        />
      )}

      <AnimatePresence initial={false}>
        {isOpen && (!isCollapsed || isMobile) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-4 mr-2"
          >
            <div
              className="mt-1 space-y-1 border-l-2 pl-3 py-1"
              style={{ borderColor: 'var(--sidebar-item-active)' }}
            >
              {group.items
                .filter((item: any) => {
                  if (item.roles) return item.roles.includes(user?.role)
                  if (item.role) return user?.role === item.role
                  return true
                })
                .map((item: any) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-bold`}
                      style={{
                        backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-muted)',
                        boxShadow: isActive ? '0 8px 16px -6px var(--primary)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.color = 'var(--primary)'
                          ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sidebar-item-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                          ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate tracking-tight">{item.label}</span>
                    </Link>
                  )
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const SidebarContent = ({
  isMobile = false,
  isCollapsed,
  user,
  logout,
  pathname,
  openGroups,
  toggleGroup,
  toggleCollapse
}: {
  isMobile?: boolean;
  isCollapsed: boolean;
  user: any;
  logout: () => void;
  pathname: string;
  openGroups: string[];
  toggleGroup: (label: string) => void;
  toggleCollapse: () => void;
}) => {
  const hasAccessToSection = (groups: any[]) => {
    if (user?.role === 'SUPER_ADMIN') return true;
    return groups.some(group => {
      const hasRoleAccess = group.roles ? group.roles.includes(user?.role) : false;
      const hasModuleAccess = group.moduleId && user?.permissions?.includes(group.moduleId);
      return hasRoleAccess || hasModuleAccess;
    });
  };

  const isFarmasi = user?.role === 'FARMASI'

  // ── Farmasi-only menu ──────────────────────────────────────────────────────
  const FARMASI_MENU = [
    { icon: FiHome,    label: 'Dashboard',              href: '/admin/farmasi' },
    { icon: FiBox,     label: 'Antrian Farmasi',        href: '/admin/transactions/pharmacy' },
    { icon: FiLayers,  label: 'Formula Racikan',        href: '/admin/farmasi/formula-racikan' },
    { icon: FiShoppingBag, label: 'Pembelian Karyawan', href: '/admin/farmasi/pembelian-karyawan' },
    { icon: FiPackage, label: 'Stok Obat',              href: '/admin/inventory' },
    { icon: FiRepeat,  label: 'Mutasi Stok',            href: '/admin/inventory/mutations' },
    { icon: FiMenu,    label: 'Data Obat & Alkes',      href: '/admin/master/medicines' },
  ]

  if (isFarmasi) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--sidebar-bg)' }}>
        {/* Brand & Toggle */}
        <div className={`flex-shrink-0 flex items-center transition-all duration-300 ${isCollapsed && !isMobile ? 'h-24 flex-col justify-center gap-4' : 'h-20 px-6 justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex-shrink-0 flex items-center justify-center shadow-lg shadow-emerald-200 text-white font-black text-lg">
              F
            </div>
            {(!isCollapsed || isMobile) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
                <span className="font-black text-base tracking-tight leading-none block" style={{ color: 'var(--text-primary)' }}>Yasfina</span>
                <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest mt-0.5 block">Farmasi</span>
              </motion.div>
            )}
          </div>

          {!isMobile && (
            <button
              onClick={toggleCollapse}
              className={`p-1.5 rounded-lg transition-all hover:bg-emerald-500/10 hover:text-emerald-500 flex items-center justify-center`}
              style={{ color: 'var(--text-faint)' }}
              title={isCollapsed ? "Buka Menu" : "Ciutkan Menu"}
            >
              {isCollapsed ? <FiMenu className="w-5 h-5" /> : <FiChevronLeft className="w-5 h-5" />}
            </button>
          )}
        </div>

        {/* Clinic Switcher */}
        {(!isCollapsed || isMobile) && (
          <div className="px-5 pb-4">
            <ClinicSwitcher full />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto custom-scrollbar pb-10">
          <div className="flex items-center justify-between px-3 pt-4 pb-2">
            {(!isCollapsed || isMobile) && (
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-faint)' }}>
                Menu Farmasi
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {FARMASI_MENU.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                isCollapsed={isCollapsed}
                isMobile={isMobile}
              />
            ))}
          </div>
        </nav>


      </div>
    )
  }

  // ── Default (non-Farmasi) menu ─────────────────────────────────────────────
  return (
  <div
    className="flex flex-col h-full"
    style={{ backgroundColor: 'var(--sidebar-bg)' }}
  >
    {/* Brand & Toggle */}
    <div className={`flex-shrink-0 flex items-center transition-all duration-300 ${isCollapsed && !isMobile ? 'h-24 flex-col justify-center gap-4' : 'h-20 px-6 justify-between'}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-indigo-600 rounded-lg flex-shrink-0 flex items-center justify-center shadow-lg shadow-primary/20 text-white font-black text-lg">
          Y
        </div>
        {(!isCollapsed || isMobile) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
            <span className="font-black text-base tracking-tight leading-none block" style={{ color: 'var(--text-primary)' }}>Yasfina</span>
            <span className="text-[9px] text-primary font-black uppercase tracking-widest mt-0.5 block">Management</span>
          </motion.div>
        )}
      </div>

      {!isMobile && (
        <button
          onClick={toggleCollapse}
          className={`p-1.5 rounded-lg transition-all hover:bg-primary/10 hover:text-primary flex items-center justify-center`}
          style={{ color: 'var(--text-faint)' }}
          title={isCollapsed ? "Buka Menu" : "Ciutkan Menu"}
        >
          {isCollapsed ? <FiMenu className="w-5 h-5" /> : <FiChevronLeft className="w-5 h-5" />}
        </button>
      )}
    </div>

    {/* Clinic Switcher */}
    {(!isCollapsed || isMobile) && (
      <div className="px-5 pb-4">
        <ClinicSwitcher full />
      </div>
    )}

    {/* Navigation */}
    <nav className="flex-1 px-3 overflow-y-auto custom-scrollbar pb-10">
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        {(!isCollapsed || isMobile) && (
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-faint)' }}>
            Menu Utama
          </p>
        )}
        {(!isCollapsed || isMobile) && (
          <button 
            onClick={() => {
              const allGroups = [
                ...MASTER_GROUPS, ...LAYANAN_UTAMA_GROUPS,
                ...FINANCE_GROUPS, ...LOGISTIK_GROUPS, ...ASSET_GROUPS,
              ].map(g => g.label)
              const areAllOpen = allGroups.every(g => openGroups.includes(g))
              if (areAllOpen) {
                toggleGroup('__COLLAPSE_ALL__')
              } else {
                toggleGroup('__EXPAND_ALL__')
              }
            }}
            className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-primary/10 transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            {[
              ...MASTER_GROUPS, ...LAYANAN_UTAMA_GROUPS,
              ...FINANCE_GROUPS, ...LOGISTIK_GROUPS, ...ASSET_GROUPS,
            ].every(g => openGroups.includes(g.label)) ? 'Collapse All' : 'Expand All'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {MAIN_MENU.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            pathname={pathname}
            isCollapsed={isCollapsed}
            isMobile={isMobile}
          />
        ))}
      </div>

      {hasAccessToSection(LAYANAN_UTAMA_GROUPS) && (
        <div className="flex flex-col gap-1 mt-2">
          {(!isCollapsed || isMobile) && (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] px-3 pb-2 pt-4" style={{ color: 'var(--text-faint)' }}>
              Layanan Utama
            </p>
          )}
          {LAYANAN_UTAMA_GROUPS.map((group) => (
            <SidebarNavGroup
              key={group.label}
              group={group}
              pathname={pathname}
              isCollapsed={isCollapsed}
              isMobile={isMobile}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              accentColor="primary"
              user={user}
            />
          ))}
        </div>
      )}

      {/* Keuangan & Akuntansi */}
      {hasAccessToSection(FINANCE_GROUPS) && (
        <div className="flex flex-col gap-1 mt-2">
          {(!isCollapsed || isMobile) && (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] px-3 pb-2 pt-4" style={{ color: 'var(--text-faint)' }}>
              Keuangan & Akuntansi
            </p>
          )}
          {FINANCE_GROUPS.map((group) => (
            <SidebarNavGroup
              key={group.label}
              group={group}
              pathname={pathname}
              isCollapsed={isCollapsed}
              isMobile={isMobile}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              accentColor="primary"
              user={user}
            />
          ))}
        </div>
      )}

      {/* Logistics and Inventory */}
      {hasAccessToSection(LOGISTIK_GROUPS) && (
        <div className="flex flex-col gap-1 mt-2">
          {(!isCollapsed || isMobile) && (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] px-3 pb-2 pt-4" style={{ color: 'var(--text-faint)' }}>
              Logistik & Inventaris
            </p>
          )}
          {LOGISTIK_GROUPS.map((group) => (
            <SidebarNavGroup
              key={group.label}
              group={group}
              pathname={pathname}
              isCollapsed={isCollapsed}
              isMobile={isMobile}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              accentColor="primary"
              user={user}
            />
          ))}
        </div>
      )}

      {/* Manajemen Aset */}
      {hasAccessToSection(ASSET_GROUPS) && (
        <div className="flex flex-col gap-1 mt-2">
          {(!isCollapsed || isMobile) && (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] px-3 pb-2 pt-4" style={{ color: 'var(--text-faint)' }}>
              Manajemen Aset
            </p>
          )}
          {ASSET_GROUPS.map((group) => (
            <SidebarNavGroup
              key={group.label}
              group={group}
              pathname={pathname}
              isCollapsed={isCollapsed}
              isMobile={isMobile}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              accentColor="primary"
              user={user}
            />
          ))}
        </div>
      )}

      {/* Master Data */}
      {hasAccessToSection(MASTER_GROUPS) && (
        <div className="flex flex-col gap-1 mt-2">
          {(!isCollapsed || isMobile) && (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] px-3 pb-2 pt-4" style={{ color: 'var(--text-faint)' }}>
              Pengaturan Master
            </p>
          )}
          {MASTER_GROUPS.map((group) => (
            <SidebarNavGroup
              key={group.label}
              group={group}
              pathname={pathname}
              isCollapsed={isCollapsed}
              isMobile={isMobile}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              accentColor="indigo"
              user={user}
            />
          ))}
        </div>
      )}
    </nav>


  </div>
  )
}

export default function Sidebar({
  mobileOpen: externalMobileOpen,
  onMobileClose,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
} = {}) {
  const pathname = usePathname()
  const { logout, user } = useAuthStore()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  // Controlled from parent (AdminLayout) or self-managed
  const mobileOpen = externalMobileOpen ?? false
  const closeMobile = () => onMobileClose?.()

  useEffect(() => {
    setMounted(true)
    
    // Check for desktop screen
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024)
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    
    // Check for saved preference, default to expanded (false) if never set
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') {
      setIsCollapsed(true)
    } else {
      setIsCollapsed(false)
    }

    const allGroups = [
      ...MASTER_GROUPS, ...LAYANAN_UTAMA_GROUPS,
      ...FINANCE_GROUPS, ...LOGISTIK_GROUPS, ...ASSET_GROUPS,
    ]
    const activeGroup = allGroups.find(g => g.items.some((i: any) => i.href === pathname))
    if (activeGroup) {
      setOpenGroups(prev => prev.includes(activeGroup.label) ? prev : [...prev, activeGroup.label])
    }

    return () => window.removeEventListener('resize', checkDesktop)
  }, [pathname])

  // Close mobile drawer on route change
  useEffect(() => { closeMobile() }, [pathname])

  const toggleCollapse = () => {
    const newVal = !isCollapsed
    setIsCollapsed(newVal)
    localStorage.setItem('sidebar-collapsed', String(newVal))
  }

  const toggleGroup = (label: string) => {
    if (isCollapsed) {
      setIsCollapsed(false)
      localStorage.setItem('sidebar-collapsed', 'false')
    }

    if (label === '__EXPAND_ALL__') {
      const allLabels = [
        ...MASTER_GROUPS, ...LAYANAN_UTAMA_GROUPS,
        ...FINANCE_GROUPS, ...LOGISTIK_GROUPS, ...ASSET_GROUPS,
      ].map(g => g.label)
      setOpenGroups(allLabels)
      return
    }

    if (label === '__COLLAPSE_ALL__') {
      setOpenGroups([])
      return
    }

    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  if (!mounted) return null

  const contentProps = { isCollapsed, user, logout, pathname, openGroups, toggleGroup, toggleCollapse }

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-[50]"
            onClick={closeMobile}
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer — slides in from left */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="lg:hidden fixed left-0 top-0 h-[100dvh] w-72 z-[60] flex flex-col shadow-2xl border-r"
            style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
          >
            {/* Close button */}
            <button
              onClick={closeMobile}
              className="absolute top-4 right-4 p-2 rounded-xl z-[70] transition-all hover:bg-red-500 hover:text-white"
              style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
            >
              <FiX className="w-4 h-4" />
            </button>
            <SidebarContent isMobile {...contentProps} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar - Rendered only on screens >= 1024px */}
      {isDesktop && (
        <>
          <motion.aside
            animate={{ width: isCollapsed ? 70 : 260 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="hidden lg:flex fixed left-0 top-0 h-screen z-50 flex-col overflow-hidden border-r"
            style={{
              backgroundColor: 'var(--sidebar-bg)',
              borderColor: 'var(--sidebar-border)',
              boxShadow: '4px 0 24px -10px rgba(0,0,0,0.1)',
            }}
          >
            <SidebarContent {...contentProps} />
          </motion.aside>

          {/* Desktop spacer to push main content */}
          <motion.div
            animate={{ width: isCollapsed ? 70 : 260 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="hidden lg:block flex-shrink-0"
          />
        </>
      )}
    </>
  )
}
