'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FiActivity, FiUsers, FiClock, FiCheckCircle, FiArrowRight, 
  FiRefreshCw, FiAlertCircle, FiEdit3, FiClipboard, FiSearch, FiCalendar, FiZap,
  FiChevronRight, FiFilter, FiUser, FiInfo, FiLock, FiVolume2
} from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { announceQueue } from '@/lib/utils/speech'
import { socket, connectSocket } from '@/lib/socket'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { toast } from 'react-hot-toast'

interface Queue {
  id: string
  patientId: string
  clinicId: string
  doctorId: string | null
  registrationId: string | null
  queueNo: string
  status: 'waiting' | 'called' | 'triage' | 'ready' | 'ongoing' | 'completed' | 'no-show'
  patient: { name: string; medicalRecordNo: string; gender: string; allergies?: string }
  doctor: { name: string; specialization: string } | null
  department: { name: string } | null
  hasMedicalRecord: boolean
  createdAt: string
  medicalRecord?: {
    vitals?: {
      bloodPressure?: string
      temperature?: number
      weight?: number
      height?: number
    }
    chiefComplaint?: string
  }
}

export default function DoctorQueue() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'completed' | 'ready' | 'triage'>('ready')
  const isFetchingRef = useRef(false)
  const initialFetchedRef = useRef(false)
  const socketRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchQueues = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const { data } = await api.get('transactions/queues?today=true')
      setQueues(data || [])
    } catch (e) {
      console.error('Failed to fetch queues', e)
    } finally {
      isFetchingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 1. Initial Fetch
    if (!initialFetchedRef.current) {
      initialFetchedRef.current = true
      fetchQueues()
    }

    // 2. Setup Real-time listener
    const clinicId = user?.clinics?.[0]?.id || (user as any).clinicId
    if (clinicId) {
      connectSocket(clinicId)
      
      socket.on('queue-updated', (data) => {
        console.log('[Socket] Queue update received:', data)
        if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current)
        socketRefreshTimerRef.current = setTimeout(() => {
          fetchQueues()
        }, 250)
      })
    }

    return () => {
      socket.off('queue-updated')
      if (socketRefreshTimerRef.current) {
        clearTimeout(socketRefreshTimerRef.current)
        socketRefreshTimerRef.current = null
      }
    }
  }, [fetchQueues, user])

  const handleCallPatient = async (q: Queue) => {
    try {
      // Step 4: Update status to 'called' if it's currently 'ready'
      if (q.status === 'ready') {
        await api.patch(`transactions/queues/${q.id}/status`, { status: 'called' })
      }
      
      // Announce the patient
      announceQueue(q.queueNo, q.patient.name, 'Ruang Periksa Dokter')
    } catch (err) {
      console.error('Failed to call patient', err)
      toast.error('Gagal memanggil pasien')
    }
  }

  const handleStartConsultation = async (q: Queue) => {
    try {
      // Step 5: Update status to 'ongoing' before opening the menu
      if (q.status !== 'ongoing') {
        await api.patch(`transactions/queues/${q.id}/status`, { status: 'ongoing' })
      }
      router.push(`/doctor/queue/${q.id}`)
    } catch (err) {
      console.error('Failed to start consultation', err)
      toast.error('Gagal memulai pemeriksaan')
    }
  }

  const filteredQueues = useMemo(() => {
    let result = queues

    if (filter === 'ongoing') {
      // BERJALAN: Currently being examined only
      result = result.filter(q => q.status === 'ongoing')
    } else if (filter === 'completed') {
      result = result.filter(q => q.status === 'completed')
    } else if (filter === 'ready') {
      // ANTRIAN: Waiting for nurse/triage
      result = result.filter(q => q.status === 'waiting' || (q.status === 'called' && !q.hasMedicalRecord) || q.status === 'triage')
    } else if (filter === 'triage') {
      // VITAL SIGN / TRIAGE: Finished triage (Ready) OR Being called to doctor room
      result = result.filter(q => q.status === 'ready' || (q.status === 'called' && q.hasMedicalRecord))
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase()
      result = result.filter(q =>
        q.patient.name.toLowerCase().includes(lowerSearch) ||
        q.queueNo.toLowerCase().includes(lowerSearch) ||
        q.patient.medicalRecordNo.toLowerCase().includes(lowerSearch)
      )
    }

    return result
  }, [queues, searchTerm, filter])

  const stats = {
    ready: queues.filter(q => q.status === 'waiting' || (q.status === 'called' && !q.hasMedicalRecord) || q.status === 'triage').length,
    triage: queues.filter(q => q.status === 'ready' || (q.status === 'called' && q.hasMedicalRecord)).length,
    ongoing: queues.filter(q => q.status === 'ongoing').length,
    completed: queues.filter(q => q.status === 'completed').length,
  }

  const handleNavigation = (q: Queue) => {
    const isRestricted = ['waiting', 'called', 'triage', 'no-show'].includes(q.status)
    
    if (isRestricted) {
      toast.error('Pasien belum siap. Tunggu hingga perawat menyelesaikan input tanda vital.', {
        icon: '🔒',
        id: 'workflow-lock'
      })
      return
    }

    router.push(`/doctor/queue/${q.id}`)
  }

  const statCards = [
    { label: 'Triage', value: stats.ready, icon: FiActivity, color: 'text-amber-500', bg: 'bg-amber-50 shadow-amber-100/20' },
    { label: 'Vital Signs', value: stats.triage, icon: FiActivity, color: 'text-indigo-500', bg: 'bg-indigo-50 shadow-indigo-100/20' },
    { label: 'Selesai', value: stats.completed, icon: FiCheckCircle, color: 'text-slate-500', bg: 'bg-slate-50 shadow-slate-100/20' },
  ]

  const StatusPill = ({ status, hasMedicalRecord }: { status: string, hasMedicalRecord: boolean }) => {
    const map: any = {
      waiting: { label: 'FRONT OFFICE', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
      called: { 
        label: hasMedicalRecord ? 'DIPANGGIL DOKTER' : 'DIPANGGIL PERAWAT', 
        cls: hasMedicalRecord ? 'bg-indigo-600 text-white border-transparent animate-bounce' : 'bg-blue-50 text-blue-600 border-blue-200' 
      },
      triage: { label: 'SEDANG TRIAGE', cls: 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse font-black' },
      ready: { label: 'SIAP PERIKSA', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200 font-bold' },
      ongoing: { label: 'DALAM RUANGAN', cls: 'bg-indigo-600 text-white border-transparent shadow-md font-black' },
      completed: { label: 'SELESAI', cls: 'bg-slate-50 text-slate-400 border-slate-100' },
    }
    const s = map[status] || map.waiting
    return (
      <span className={`text-[9px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest flex items-center gap-1.5 w-fit ${s.cls}`}>
        {['waiting', 'called', 'triage'].includes(status) && !hasMedicalRecord && <FiLock className="w-2.5 h-2.5" />}
        {s.label}
      </span>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-24 bg-gray-50/30 min-h-screen w-full max-w-full overflow-x-hidden">
      {/* Premium Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 text-white shadow-xl shadow-indigo-900/20"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 blur-[120px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black tracking-widest uppercase text-indigo-200">
              <FiZap className="w-3 h-3 text-amber-400 fill-amber-400" />
              Doctor Workstation
            </div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight leading-tight">
              Dashboard <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-white">Antrian Pasien & Lab</span>
            </h1>
            <p className="text-indigo-100/60 font-medium max-w-md text-xs md:text-sm">
              Kelola sesi konsultasi Anda secara efisien dengan pemantauan antrian real-time.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col items-end text-right">
              <div className="flex items-center gap-2 text-indigo-100 font-bold text-sm mb-1">
                <FiCalendar className="w-4 h-4" />
                {format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}
              </div>
              <p className="text-indigo-100/30 text-[9px] font-black uppercase tracking-[0.3em]">Live Clinic Sync</p>
            </div>
            <button 
              onClick={() => {
                setLoading(true)
                fetchQueues()
              }}
              disabled={loading}
              className="group flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-white hover:bg-white/20 hover:border-white/30 transition-all active:scale-95 shadow-2xl shadow-indigo-500/10 disabled:opacity-50"
            >
              <div className={`p-2 bg-indigo-500/30 rounded-xl group-hover:bg-indigo-500/50 transition-colors ${loading ? 'animate-spin' : ''}`}>
                <FiRefreshCw className="w-4 h-4" />
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Refresh Data</p>
                <p className="text-[8px] text-indigo-200 font-bold opacity-70">Live Sync</p>
              </div>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 w-full">
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className={`bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all group overflow-hidden relative w-full`}
          >
             <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-slate-50 rounded-full blur-2xl group-hover:scale-150 transition-all opacity-40" />
            <div className="flex items-center gap-3 md:gap-4 relative z-10">
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform shrink-0`}>
                <stat.icon className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 truncate">{stat.label}</p>
                <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-none">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Active Work Area */}
      <div className="bg-white rounded-3xl md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full max-w-full">
        {/* Table Filters & Search */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6 bg-slate-50/20 w-full">
          <div className="flex p-1.5 bg-white border border-slate-200 rounded-xl md:rounded-2xl shadow-sm w-full lg:w-auto overflow-x-auto no-scrollbar">
            <div className="flex flex-nowrap min-w-max">
            {[
              { id: 'ready', label: 'Antrian', color: 'bg-amber-500' },
              { id: 'triage', label: 'Vital Sign / Triage', color: 'bg-indigo-600' },
              { id: 'ongoing', label: 'Berjalan', color: 'bg-indigo-600' },
              { id: 'completed', label: 'Selesai', color: 'bg-emerald-500' },
              { id: 'all', label: 'Semua', color: 'bg-slate-700' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  filter === tab.id
                    ? `${tab.color} text-white shadow-lg shadow-black/5`
                    : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          </div>

          <div className="relative group w-full">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Cari nama pasien, No. Antrian, atau RM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-black text-[11px] shadow-sm tracking-wide"
            />
          </div>
        </div>

        {/* High-Density Table (Desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">No</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pasien</th>
                {filter === 'triage' ? (
                  <>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tensi (TD)</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Suhu</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">BB/TB</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Keluhan</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID Rekam Medis</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Departemen</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Waktu Masuk</th>
                  </>
                )}
                {filter !== 'triage' && (
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <FiRefreshCw className="w-10 h-10 text-slate-200 animate-spin mx-auto mb-4" />
                    <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Memuat Data Antrian...</p>
                  </td>
                </tr>
              ) : filteredQueues.length > 0 ? (
                filteredQueues.map((q) => {
                  const isLocked = ['waiting', 'called', 'triage', 'no-show'].includes(q.status)
                  return (
                    <tr 
                      key={q.id} 
                      onClick={() => {
                        // Only "Ready" (Siap Periksa) is read-only.
                        // "DIPANGGIL DOKTER" (Called with vitals) OR "Ongoing" should be clickable.
                        if (filter === 'triage' && q.status === 'ready') return;
                        
                        if (q.status === 'completed') {
                          router.push(`/doctor/queue/${q.id}`);
                        } else if (!isLocked) {
                          handleStartConsultation(q);
                        } else {
                          handleNavigation(q);
                        }
                      }}
                      className={`group transition-all ${isLocked ? 'cursor-not-allowed bg-slate-50/30' : (filter === 'triage' && q.status === 'ready') ? 'cursor-default bg-slate-50/10' : 'hover:bg-slate-50 cursor-pointer'}`}
                    >
                      <td className="px-6 py-5">
                        <div className={`min-w-[3.5rem] w-fit px-3 h-10 rounded-xl flex items-center justify-center font-black text-sm border ${
                          q.status === 'ongoing' ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-200' : 
                          isLocked ? 'bg-white text-slate-300 border-slate-100' : 'bg-slate-50 text-slate-700 border-slate-100'
                        }`}>
                          {q.id.includes('temp') ? '-' : q.queueNo}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-0.5">
                          <p className={`text-sm font-black transition-colors ${isLocked ? 'text-slate-400' : 'text-slate-900 group-hover:text-primary'}`}>{q.patient.name}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${isLocked ? 'text-slate-300' : 'text-slate-400'}`}>
                            {['Laki-laki', 'L', 'M'].includes(q.patient.gender) ? 'PRIA' : 'WANITA'}
                          </p>
                        </div>
                      </td>
                      {filter === 'triage' ? (
                        <>
                          <td className="px-6 py-5 text-center">
                            <span className="text-sm font-black text-indigo-600">{q.medicalRecord?.vitals?.bloodPressure || '-'}</span>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="text-sm font-black text-amber-600">{q.medicalRecord?.vitals?.temperature || '-'}°C</span>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="text-xs font-bold text-slate-600">{q.medicalRecord?.vitals?.weight || '-'}/{q.medicalRecord?.vitals?.height || '-'}</span>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight line-clamp-2 italic max-w-xs transition-all group-hover:line-clamp-none">
                              "{q.medicalRecord?.chiefComplaint || 'Tidak ada keluhan.'}"
                            </p>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-5">
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-tighter ${isLocked ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-indigo-50 text-primary border-indigo-100'}`}>
                              {q.patient.medicalRecordNo}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex justify-center">
                                <StatusPill status={q.status} hasMedicalRecord={q.hasMedicalRecord} />
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${isLocked ? 'text-slate-300' : 'text-slate-500'}`}>{q.department?.name || 'POLI UMUM'}</p>
                          </td>
                          <td className="px-6 py-5">
                            <div className={`flex items-center gap-2 ${isLocked ? 'text-slate-300' : 'text-slate-500'}`}>
                              <FiClock className="w-3.5 h-3.5" />
                              <span className="text-xs font-bold">{format(new Date(q.createdAt), 'HH:mm')}</span>
                            </div>
                          </td>
                        </>
                      )}
                      
                      {filter !== 'triage' && (
                         <td className="px-6 py-5 text-right">
                            <button
                              disabled={isLocked}
                              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                q.status === 'ongoing' || q.status === 'called'
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200'
                                  : q.status === 'completed'
                                  ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  : isLocked
                                  ? 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100'
                                  : 'bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/10'
                              }`}
                            >
                              {q.status === 'completed' ? (
                                <><FiClipboard className="w-3.5 h-3.5" /> Buka Riwayat</>
                              ) : q.status === 'ongoing' ? (
                                <><FiEdit3 className="w-3.5 h-3.5" /> Lanjutkan</>
                              ) : q.status === 'called' && q.hasMedicalRecord ? (
                                <><FiActivity className="w-3.5 h-3.5" /> Mulai Periksa</>
                              ) : isLocked ? (
                                <><FiLock className="w-3.5 h-3.5" /> Antrean</>
                              ) : (
                                <><FiArrowRight className="w-3.5 h-3.5" /> Detail</>
                              )}
                            </button>
                         </td>
                      )}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-32 text-center bg-slate-50/10">
                    <div className="max-w-xs mx-auto">
                      <div className="w-20 h-20 bg-slate-100/50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FiUsers className="w-10 h-10 text-slate-300" />
                      </div>
                      <h4 className="text-lg font-black text-slate-900 mb-2 tracking-tight">Tidak Ada Pasien</h4>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase tracking-wider">
                        Daftar {filter} saat ini sedang kosong. Klik tombol refresh untuk memuat data terbaru.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Card Layout */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="px-6 py-20 text-center">
              <FiRefreshCw className="w-10 h-10 text-slate-200 animate-spin mx-auto mb-4" />
              <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Memuat Data Antrian...</p>
            </div>
          ) : filteredQueues.length > 0 ? (
            filteredQueues.map((q) => {
              const isLocked = ['waiting', 'called', 'triage', 'no-show'].includes(q.status)
              return (
                <div 
                  key={q.id}
                  onClick={() => {
                    if (filter === 'triage' && q.status === 'ready') return;
                    if (q.status === 'completed') {
                      router.push(`/doctor/queue/${q.id}`);
                    } else if (!isLocked) {
                      handleStartConsultation(q);
                    } else {
                      handleNavigation(q);
                    }
                  }}
                  className={`p-5 space-y-4 active:bg-slate-50 transition-colors ${isLocked ? 'bg-slate-50/30 opacity-80' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border ${
                        q.status === 'ongoing' ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-200' : 
                        isLocked ? 'bg-white text-slate-300 border-slate-100' : 'bg-slate-50 text-slate-700 border-slate-100'
                      }`}>
                        {q.queueNo}
                      </div>
                      <div>
                        <p className={`text-sm font-black transition-colors ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>{q.patient.name}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${isLocked ? 'text-slate-300' : 'text-slate-400'}`}>
                          {q.patient.medicalRecordNo} • {['Laki-laki', 'L', 'M'].includes(q.patient.gender) ? 'PRIA' : 'WANITA'}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={q.status} hasMedicalRecord={q.hasMedicalRecord} />
                  </div>

                  {filter === 'triage' && (
                    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Tensi</p>
                        <p className="text-[10px] font-black text-indigo-600">{q.medicalRecord?.vitals?.bloodPressure || '-'}</p>
                      </div>
                      <div className="text-center border-x border-slate-200">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Suhu</p>
                        <p className="text-[10px] font-black text-amber-600">{q.medicalRecord?.vitals?.temperature || '-'}°C</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">BB/TB</p>
                        <p className="text-[10px] font-black text-slate-700">{q.medicalRecord?.vitals?.weight || '-'}/{q.medicalRecord?.vitals?.height || '-'}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                      <FiClock className="w-3.5 h-3.5" /> {format(new Date(q.createdAt), 'HH:mm')} • {q.department?.name || 'UMUM'}
                    </div>
                    {filter !== 'triage' && (
                       <button
                        disabled={isLocked}
                        className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${
                          q.status === 'ongoing' || q.status === 'called'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : q.status === 'completed'
                            ? 'bg-slate-100 text-slate-500'
                            : isLocked
                            ? 'bg-slate-50 text-slate-300'
                            : 'bg-primary text-white shadow-sm'
                        }`}
                      >
                        {q.status === 'completed' ? 'Riwayat' : q.status === 'ongoing' ? 'Lanjut' : isLocked ? 'Tunggu' : 'Detail'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="py-20 text-center bg-slate-50/10">
              <FiUsers className="w-10 h-10 text-slate-200 mx-auto mb-4" />
              <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Tidak Ada Pasien</p>
            </div>
          )}
        </div>
        
        {/* Footer Guidance */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
               <FiInfo className="text-indigo-500 w-4 h-4" /> 
               Pasien harus melewati tahap Triage sebelum dokter dapat memulai pemeriksaan medis.
            </p>
            <div className="flex flex-wrap items-center gap-4">
               <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400"><FiLock className="text-slate-300" /> TERKUNCI (TRIAGE)</span>
               <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> SIAP PERIKSA</span>
               <span className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600"><div className="w-2 h-2 rounded-full bg-indigo-600" /> AKTIF</span>
            </div>
        </div>
      </div>
    </div>
  )
}
