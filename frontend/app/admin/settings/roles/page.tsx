'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FiSave, FiShield, FiCheck, FiX, FiRefreshCcw } from 'react-icons/fi'
import api from '@/lib/api'
import { extractUniqueModules, ALL_MENU_GROUPS } from '@/lib/menuConfig'
import { useAuthStore } from '@/lib/store/useAuthStore'
import toast, { Toaster } from 'react-hot-toast'

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'RECEPTIONIST',
  'FARMASI',
  'ACCOUNTING',
  'LOGISTIC',
  'STAFF',
  'NURSE'
]

// Fetch descriptive name for module from Sidebar mapping
const getModuleName = (moduleId: string) => {
  for (const section of ALL_MENU_GROUPS) {
    for (const group of section.groups) {
      if (group.moduleId === moduleId) return group.label
    }
  }
  return moduleId
}

const getModuleSection = (moduleId: string) => {
  for (const section of ALL_MENU_GROUPS) {
    for (const group of section.groups) {
      if (group.moduleId === moduleId) return section.section
    }
  }
  return 'Lainnya'
}

export default function RolePermissionsPage() {
  const { user } = useAuthStore()
  const isSuperAdminUser = user?.role === 'SUPER_ADMIN'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [permissions, setPermissions] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])

  useEffect(() => {
    // Dynamically get available modules from menuConfig
    const uniqueModules = extractUniqueModules()
    setModules(uniqueModules)
    fetchPermissions()
  }, [])

  const fetchPermissions = async () => {
    try {
      setLoading(true)
      const res = await api.get('/system/roles/permissions')
      setPermissions(res.data || [])
    } catch (error) {
      console.error('Failed to fetch permissions', error)
      toast.error('Gagal memuat konfigurasi hak akses.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (role: string, module: string) => {
    if (role === 'SUPER_ADMIN') return 
    if (!isSuperAdminUser) {
      toast.error('Hanya Super Admin yang dapat mengubah hak akses.')
      return
    }

    setPermissions(prev => {
      const existingIndex = prev.findIndex(p => p.role === role && p.module === module)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], canAccess: !next[existingIndex].canAccess }
        return next
      } else {
        return [...prev, { role, module, canAccess: true }]
      }
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      // Clean up before sending, ensure we have everything
      const payload = []
      for (const role of ROLES) {
        for (const moduleObj of modules) {
          const p = permissions.find(p => p.role === role && p.module === moduleObj.id)
          payload.push({
            role,
            module: moduleObj.id,
            canAccess: role === 'SUPER_ADMIN' ? true : (p ? p.canAccess : false)
          })
        }
      }

      await api.post('/system/roles/permissions', { permissions: payload })
      toast.success('Konfigurasi hak akses berhasil disimpan. Pengguna mungkin perlu relogin untuk melihat perubahan.')
    } catch (error) {
      console.error(error)
      toast.error('Gagal menyimpan konfigurasi.')
    } finally {
      setSaving(false)
    }
  }

  const hasAccess = (role: string, module: string) => {
    if (role === 'SUPER_ADMIN') return true
    const p = permissions.find(p => p.role === role && p.module === module)
    return p ? p.canAccess : false
  }

  return (
    <div className="p-6 w-full">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Hak Akses Modul
          </h1>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-muted)' }}>
            Atur modul mana yang dapat diakses oleh setiap role. (Super Admin selalu memiliki akses penuh).
          </p>
          <p className="text-xs font-medium text-gray-500 mt-1 italic">
            Klik pada ikon atau sel tabel untuk mengubah hak akses. Jangan lupa untuk menyimpan perubahan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPermissions}
            disabled={loading || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border hover:bg-gray-50 transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <FiRefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving || !isSuperAdminUser}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-md shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <FiSave className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden shadow-sm bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 border-b border-r bg-gray-50 font-black text-[11px] uppercase tracking-wider sticky left-0 z-10" style={{ color: 'var(--text-faint)', borderColor: 'var(--border)' }}>
                  Modul / Menu
                </th>
                {ROLES.map(role => (
                  <th key={role} className="p-4 border-b bg-gray-50 text-center font-black text-[11px] uppercase tracking-wider min-w-[120px]" style={{ color: 'var(--text-faint)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-center gap-1.5">
                      {role === 'SUPER_ADMIN' && <FiShield className="w-3.5 h-3.5 text-primary" />}
                      {role.replace('_', ' ')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.length === 0 && (
                <tr>
                  <td colSpan={ROLES.length + 1} className="p-8 text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                    Tidak ada modul terdeteksi
                  </td>
                </tr>
              )}
              {/* Group by Section */}
              {Array.from(new Set(modules.map(m => m.section))).map((sectionName) => (
                <React.Fragment key={sectionName}>
                  <tr className="bg-gray-50/80">
                    <td colSpan={ROLES.length + 1} className="px-4 py-2 border-b font-black text-[10px] uppercase tracking-[0.2em] text-primary">
                      {sectionName}
                    </td>
                  </tr>
                  {modules.filter(m => m.section === sectionName).map((module, idx) => {
                    const moduleId = module.id
                    return (
                      <motion.tr
                        key={moduleId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="p-4 border-b border-r font-bold text-sm bg-white sticky left-0 z-10" style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
                          <div className="flex flex-col">
                            <span>{module.label}</span>
                            <span className="text-[10px] font-mono text-gray-400 mt-0.5">{moduleId}</span>
                          </div>
                        </td>
                        {ROLES.map(role => {
                          const isSuperAdmin = role === 'SUPER_ADMIN'
                          const access = hasAccess(role, moduleId)

                          return (
                            <td 
                              key={`${moduleId}-${role}`} 
                              className={`p-4 border-b text-center transition-colors ${!isSuperAdmin && isSuperAdminUser ? 'cursor-pointer hover:bg-primary/5' : ''}`} 
                              style={{ borderColor: 'var(--border)' }}
                              onClick={() => !isSuperAdmin && handleToggle(role, moduleId)}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggle(role, moduleId)
                                }}
                                disabled={isSuperAdmin || !isSuperAdminUser}
                                className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-all ${
                                  isSuperAdmin 
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                    : !isSuperAdminUser
                                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                      : access 
                                        ? 'bg-primary text-white shadow-sm shadow-primary/30 hover:scale-110 active:scale-95' 
                                        : 'bg-gray-100 text-transparent hover:bg-gray-200 hover:text-gray-400 hover:scale-110'
                                }`}
                              >
                                {access ? <FiCheck className="w-4 h-4" /> : <FiX className="w-3 h-3 text-gray-300" />}
                              </button>
                            </td>
                          )
                        })}
                      </motion.tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
