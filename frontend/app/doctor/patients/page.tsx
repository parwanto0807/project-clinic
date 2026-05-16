'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FiSearch, FiRefreshCw, FiUser, FiActivity, FiChevronRight,
  FiChevronLeft, FiMoreVertical, FiExternalLink, FiFilter, FiCalendar, FiPhone
} from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/useAuthStore'

interface Patient {
  id: string
  name: string
  medicalRecordNo: string
  gender: string
  dateOfBirth: string
  phone: string
  isActive: boolean
  createdAt: string
}

interface Meta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export default function DoctorPatients() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const [page, setPage] = useState(1)

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('master/patients', { 
        params: { 
          search: searchTerm,
          page: page,
          limit: 10
        } 
      })
      
      // Handle paginated response
      if (data.data) {
        setPatients(data.data)
        setMeta(data.meta)
      } else {
        setPatients(data)
        setMeta({ total: data.length, page: 1, limit: data.length, totalPages: 1 })
      }
    } catch (e) {
      console.error('Failed to fetch patients', e)
    } finally {
      setLoading(false)
    }
  }, [searchTerm, page])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  // Reset page when search changes
  useEffect(() => {
    setPage(1)
  }, [searchTerm])

  return (
    <div className="space-y-6 pb-24 bg-gray-50/30 min-h-screen">
      {/* Dynamic Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-slate-900 rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 text-white shadow-2xl shadow-slate-200"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full -mr-32 -mt-32 animate-pulse" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/20 text-[10px] font-black tracking-[0.2em] uppercase text-emerald-400">
              <FiUser className="w-3 h-3" /> Database Pasien Saya
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Pasien Terkait <span className="text-emerald-400">Anda</span></h1>
            <p className="text-slate-400 font-medium text-xs md:text-sm max-w-md">
              Akses cepat ke riwayat medis dan profil pasien yang pernah Anda tangani di Yasfina.
            </p>
          </div>
          <button 
            onClick={fetchPatients} 
            className="p-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl text-white hover:bg-white/10 transition-all shadow-xl"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </motion.div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 group w-full">
          <FiSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 group-focus-within:text-emerald-500 transition-colors" />
          <input
            type="text"
            placeholder="Cari nama pasien, no. RM, atau identitas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-14 pr-6 py-3 md:py-4 bg-white border border-slate-100 rounded-2xl md:rounded-3xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all font-bold text-xs md:text-sm shadow-sm placeholder:text-slate-300"
          />
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-3xl border border-slate-100 shadow-sm">
           <button className="p-3 text-slate-400 hover:text-emerald-600 transition-colors">
             <FiFilter className="w-5 h-5" />
           </button>
        </div>
      </div>

      {/* Compact High-Density Table */}
      <div className="bg-white rounded-3xl md:rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        {/* Compact High-Density Table (Desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Pasien</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">No. Rekam Medis</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Gender</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Kontak</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Kunjungan Terakhir</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-8 bg-slate-50 rounded-xl" />
                    </td>
                  </tr>
                ))
              ) : patients.length > 0 ? (
                patients.map((patient) => (
                  <tr 
                    key={patient.id} 
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/doctor/patients/${patient.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-sm group-hover:bg-emerald-500 group-hover:text-white transition-all">
                          {patient.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 leading-none">{patient.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                            Lahir: {new Date(patient.dateOfBirth).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg uppercase tracking-widest">
                        {patient.medicalRecordNo}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-600 italic">
                        {patient.gender === 'M' ? '♂ Laki-laki' : '♀ Perempuan'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <FiPhone className="w-3 h-3 text-slate-300" /> {patient.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <FiCalendar className="w-3 h-3 text-emerald-400" />
                        {new Date(patient.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2.5 rounded-xl text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
                         <FiExternalLink className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-24 text-center">
                    <FiUser className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                    <p className="text-xs font-black text-slate-300 uppercase tracking-[0.4em]">Tidak Ada Data Pasien</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Card Layout */}
        <div className="md:hidden divide-y divide-slate-50">
          {loading ? (
             Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-6 animate-pulse space-y-3">
                <div className="h-4 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-50 rounded w-3/4" />
              </div>
            ))
          ) : patients.length > 0 ? (
            patients.map((patient) => (
              <div 
                key={patient.id}
                onClick={() => router.push(`/doctor/patients/${patient.id}`)}
                className="p-5 active:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-sm">
                        {patient.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 leading-none">{patient.name}</p>
                        <p className="text-[10px] font-black text-indigo-600 mt-1 uppercase tracking-widest">{patient.medicalRecordNo}</p>
                      </div>
                   </div>
                   <FiExternalLink className="text-slate-300 w-5 h-5" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Gender & Lahir</p>
                    <p className="text-[10px] font-bold text-slate-600">
                      {patient.gender === 'M' ? 'Laki-laki' : 'Perempuan'} • {new Date(patient.dateOfBirth).getFullYear()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Kunjungan Terakhir</p>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <FiCalendar className="w-3 h-3 text-emerald-400" />
                      {new Date(patient.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 text-center">
              <FiUser className="w-12 h-12 text-slate-100 mx-auto mb-4" />
              <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Kosong</p>
            </div>
          )}
        </div>

        {/* Professional Pagination Footer */}
        <div className="px-6 md:px-8 py-6 bg-slate-50/50 border-t border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-[10px] md:text-xs font-bold text-slate-400 capitalize text-center md:text-left">
            Menampilkan <span className="text-slate-900">{meta.total > 0 ? (page - 1) * meta.limit + 1 : 0}</span> sampai <span className="text-slate-900">{Math.min(page * meta.limit, meta.total)}</span> dari <span className="text-slate-900">{meta.total}</span> pasien
          </p>
          
          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-2 text-slate-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
            >
              <FiChevronLeft className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: meta.totalPages }).map((_, i) => {
                const pNum = i + 1
                // Show only current, first, last, and relative pages if many
                if (
                  meta.totalPages > 7 &&
                  pNum !== 1 &&
                  pNum !== meta.totalPages &&
                  Math.abs(pNum - page) > 1
                ) {
                   if (pNum === 2 || pNum === meta.totalPages - 1) return <span key={pNum} className="px-2 text-slate-300 font-bold">...</span>
                   return null
                }
                
                return (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${
                      page === pNum 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                      : 'text-slate-500 hover:bg-white hover:text-emerald-600'
                    }`}
                  >
                    {pNum}
                  </button>
                )
              })}
            </div>

            <button 
              disabled={page === meta.totalPages || loading}
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              className="p-2 text-slate-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
            >
              <FiChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
