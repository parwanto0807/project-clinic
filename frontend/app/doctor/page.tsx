'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FiActivity, FiUsers, FiClock, FiCheckCircle, FiArrowRight, 
  FiRefreshCw, FiAlertCircle, FiEdit3, FiClipboard, FiSearch, FiCalendar, FiZap,
  FiLock, FiUser
} from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/useAuthStore'
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
    id: string
    vitals?: {
      bloodPressure?: string
      temperature?: number
      weight?: number
      height?: number
    }
    chiefComplaint?: string
    subjective?: string
    objective?: string
    diagnosis?: string
    treatmentPlan?: string
    consultationDraft?: any
  }
}

export default function DoctorDashboard() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [greeting, setGreeting] = useState('')
  
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
        console.log('[Socket] Queue update received on Doctor Dashboard:', data)
        if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current)
        socketRefreshTimerRef.current = setTimeout(() => {
          fetchQueues()
        }, 250)
      })
    }

    // 3. Dynamic Greeting
    const hour = new Date().getHours()
    if (hour < 11) setGreeting('Selamat Pagi')
    else if (hour < 15) setGreeting('Selamat Siang')
    else if (hour < 19) setGreeting('Selamat Sore')
    else setGreeting('Selamat Malam')

    return () => {
      socket.off('queue-updated')
      if (socketRefreshTimerRef.current) {
        clearTimeout(socketRefreshTimerRef.current)
        socketRefreshTimerRef.current = null
      }
    }
  }, [fetchQueues, user])

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

  // Memoized Queue Statistics
  const stats = useMemo(() => {
    return {
      waiting: queues.filter(q => q.status === 'waiting' || (q.status === 'called' && !q.hasMedicalRecord) || q.status === 'triage').length,
      ready: queues.filter(q => q.status === 'ready' || (q.status === 'called' && q.hasMedicalRecord)).length,
      ongoing: queues.filter(q => q.status === 'ongoing').length,
      completed: queues.filter(q => q.status === 'completed').length,
      total: queues.length
    }
  }, [queues])

  const statCards = [
    { label: 'Antrian Triage', value: stats.waiting, icon: FiUsers, color: 'text-amber-500', bg: 'bg-amber-50 shadow-amber-100/20' },
    { label: 'Siap Periksa', value: stats.ready, icon: FiActivity, color: 'text-indigo-500', bg: 'bg-indigo-50 shadow-indigo-100/20' },
    { label: 'Sedang Periksa', value: stats.ongoing, icon: FiZap, color: 'text-purple-500', bg: 'bg-purple-50 shadow-purple-100/20' },
    { label: 'Selesai', value: stats.completed, icon: FiCheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50 shadow-emerald-100/20' },
  ]

  const getFilteredList = useCallback((list: Queue[]) => {
    if (!searchTerm) return list
    const lowerSearch = searchTerm.toLowerCase()
    return list.filter(q =>
      q.patient.name.toLowerCase().includes(lowerSearch) ||
      q.queueNo.toLowerCase().includes(lowerSearch) ||
      q.patient.medicalRecordNo.toLowerCase().includes(lowerSearch)
    )
  }, [searchTerm])

  const columns = useMemo(() => {
    return [
      {
        id: 'waiting',
        title: 'Antrian Triage',
        subtitle: 'Tunggu Vitals / Triage',
        colorClass: {
          text: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-100',
          accent: 'border-l-amber-500',
          badge: 'bg-amber-100 text-amber-800',
        },
        icon: FiUsers,
        items: getFilteredList(queues.filter(q => q.status === 'waiting' || (q.status === 'called' && !q.hasMedicalRecord) || q.status === 'triage')),
      },
      {
        id: 'ready',
        title: 'Siap Periksa',
        subtitle: 'Triage Selesai (Vitals)',
        colorClass: {
          text: 'text-indigo-600',
          bg: 'bg-indigo-50',
          border: 'border-indigo-100',
          accent: 'border-l-indigo-500',
          badge: 'bg-indigo-100 text-indigo-800',
        },
        icon: FiActivity,
        items: getFilteredList(queues.filter(q => q.status === 'ready' || (q.status === 'called' && q.hasMedicalRecord))),
      },
      {
        id: 'ongoing',
        title: 'Berjalan',
        subtitle: 'Dalam Ruangan',
        colorClass: {
          text: 'text-purple-600',
          bg: 'bg-purple-50',
          border: 'border-purple-100',
          accent: 'border-l-purple-500',
          badge: 'bg-purple-100 text-purple-800',
        },
        icon: FiZap,
        items: getFilteredList(queues.filter(q => q.status === 'ongoing')),
      },
      {
        id: 'completed',
        title: 'Selesai',
        subtitle: 'Pemeriksaan Selesai',
        colorClass: {
          text: 'text-emerald-600',
          bg: 'bg-emerald-50',
          border: 'border-emerald-100',
          accent: 'border-l-emerald-500',
          badge: 'bg-emerald-100 text-emerald-800',
        },
        icon: FiCheckCircle,
        items: getFilteredList(queues.filter(q => q.status === 'completed')),
      },
    ]
  }, [queues, getFilteredList])

  return (
    <div className="space-y-6 pb-12 w-full max-w-full overflow-x-hidden">
      {/* Dynamic Header / Greeting card */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-900/20"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 blur-[80px] rounded-full -mr-15 -mt-15"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black tracking-widest uppercase text-indigo-200">
              <FiZap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              Doctor Station
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-none">
              {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-white">Dr. {user?.name?.split(' ')[0]}</span>
            </h1>
            <p className="text-indigo-100/70 font-medium max-w-md text-sm">
              Anda memiliki {stats.ready} pasien siap diperiksa.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col items-end text-right">
              <div className="flex items-center gap-2 text-indigo-100 font-bold text-sm mb-0.5">
                <FiCalendar className="w-3.5 h-3.5" />
                {format(new Date(), 'EEEE, d MMM yyyy', { locale: id })}
              </div>
              <p className="text-indigo-100/40 text-[9px] font-black uppercase tracking-[0.2em]">Yasfina Management</p>
            </div>

            <button
              onClick={() => {
                setLoading(true)
                fetchQueues()
              }}
              disabled={loading}
              className="group flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-white hover:bg-white/20 hover:border-white/30 transition-all active:scale-95 shadow-2xl shadow-indigo-50/10 disabled:opacity-50"
            >
              <div className={`p-2 bg-indigo-500/30 rounded-xl group-hover:bg-indigo-500/50 transition-colors ${loading ? 'animate-spin' : ''}`}>
                <FiRefreshCw className="w-4 h-4" />
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Refresh Data</p>
                <p className="text-[8px] text-indigo-200 font-bold opacity-70">Sync Queue List</p>
              </div>
            </button>
          </div>
        </div>
      </motion.div>


      {/* Unified Patient Queue monitoring Board */}
      <div className="bg-white rounded-3xl md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full max-w-full">
        {/* Board Search & Header */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20 w-full">
          <div>
            <h2 className="text-sm font-black text-slate-800 tracking-tight uppercase">Monitoring Alur Antrian Pasien</h2>
            <p className="text-[9px] text-slate-400 font-bold tracking-wider uppercase mt-0.5">Real-time status pasien di klinik</p>
          </div>
          
          <div className="relative group w-full md:w-96">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Cari nama pasien, No. Antrian, atau RM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-black text-[11px] shadow-sm tracking-wide"
            />
          </div>
        </div>

        {/* 4-Columns Grid (Kanban Board) */}
        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-full overflow-x-hidden">
          {columns.map((col) => {
            const Icon = col.icon
            return (
              <div 
                key={col.id} 
                className="flex flex-col bg-slate-50/40 rounded-[2rem] border border-slate-100/80 p-4 h-full min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100/50">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl ${col.colorClass.bg} ${col.colorClass.text}`}>
                       <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">{col.title}</h3>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">{col.subtitle}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${col.colorClass.badge}`}>
                    {col.items.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[550px] no-scrollbar pb-6">
                  {loading ? (
                    // Loading Skeletons
                    <div className="space-y-3">
                      {[1, 2].map((n) => (
                        <div key={n} className="bg-white rounded-2xl p-4 border border-slate-100 animate-pulse space-y-3">
                          <div className="flex justify-between">
                            <div className="h-6 w-12 bg-slate-100 rounded-lg"></div>
                            <div className="h-4 w-10 bg-slate-100 rounded-md"></div>
                          </div>
                          <div className="h-4 w-28 bg-slate-100 rounded-md"></div>
                          <div className="h-3 w-16 bg-slate-100 rounded-md"></div>
                        </div>
                      ))}
                    </div>
                  ) : col.items.length > 0 ? (
                    col.items.map((q) => {
                      const isLocked = ['waiting', 'called', 'triage', 'no-show'].includes(q.status)
                      return (
                        <motion.div
                          key={q.id}
                          whileHover={col.id === 'ready' ? {} : { y: -2 }}
                          onClick={() => {
                            if (col.id === 'ready') return // Must wait for staff to click 'Periksa'
                            if (q.status === 'completed') {
                              router.push(`/doctor/queue/${q.id}`)
                            } else if (!isLocked) {
                              handleStartConsultation(q)
                            } else {
                              handleNavigation(q)
                            }
                          }}
                          className={`bg-white rounded-2xl p-4 border ${col.colorClass.border} border-l-[4px] ${col.colorClass.accent} shadow-sm ${
                            col.id === 'ready' ? 'cursor-default' : 'cursor-pointer hover:shadow-md'
                          } transition-all flex flex-col gap-3 relative overflow-hidden group ${
                            isLocked ? 'hover:border-slate-200' : ''
                          }`}
                        >
                          {/* Queue No and Arrival Time */}
                          <div className="flex items-center justify-between">
                            <span className={`px-2.5 py-1 rounded-xl font-black text-xs border ${
                              q.status === 'ongoing'
                                ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-150'
                                : isLocked
                                ? 'bg-slate-50 text-slate-350 border-slate-100'
                                : `${col.colorClass.bg} ${col.colorClass.text} ${col.colorClass.border}`
                            }`}>
                              {q.queueNo}
                            </span>
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase">
                              <FiClock className="w-3 h-3" />
                              {format(new Date(q.createdAt), 'HH:mm')}
                            </div>
                          </div>

                          {/* Patient Info */}
                          <div>
                            <h4 className="text-xs font-black text-slate-900 leading-tight group-hover:text-primary transition-colors tracking-tight">
                              {q.patient.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[8px] font-black tracking-tighter px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">
                                {q.patient.medicalRecordNo}
                              </span>
                              <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">
                                {['Laki-laki', 'L', 'M'].includes(q.patient.gender) ? 'PRIA' : 'WANITA'}
                              </span>
                            </div>
                          </div>

                          {/* Vitals and Complaints */}
                          {q.medicalRecord?.vitals && (col.id === 'ready' || col.id === 'ongoing') && (
                            <div className="grid grid-cols-3 gap-1 p-2 bg-slate-50/50 rounded-xl border border-slate-100 text-center">
                              <div>
                                <p className="text-[7px] font-black text-slate-400 uppercase">Tensi</p>
                                <p className="text-[9px] font-black text-indigo-600">{q.medicalRecord.vitals.bloodPressure || '-'}</p>
                              </div>
                              <div className="border-x border-slate-100">
                                <p className="text-[7px] font-black text-slate-400 uppercase">Suhu</p>
                                <p className="text-[9px] font-black text-amber-600">{q.medicalRecord.vitals.temperature ? `${q.medicalRecord.vitals.temperature}°C` : '-'}</p>
                              </div>
                              <div>
                                <p className="text-[7px] font-black text-slate-400 uppercase">BB/TB</p>
                                <p className="text-[9px] font-black text-slate-700">{q.medicalRecord.vitals.weight || '-'}/{q.medicalRecord.vitals.height || '-'}</p>
                              </div>
                            </div>
                          )}

                          {q.medicalRecord?.chiefComplaint && (col.id === 'ready' || col.id === 'ongoing') && (
                            <p className="text-[8px] font-bold text-slate-500 italic bg-slate-50/30 p-2 rounded-xl border border-slate-100/50 line-clamp-2">
                              <span className="font-black text-slate-400">Keluhan: </span>
                              "{q.medicalRecord.chiefComplaint}"
                            </p>
                          )}

                          {/* Department */}
                          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                            Poli: {q.department?.name || 'Poli Umum'}
                          </div>

                          {/* Card Action Button */}
                          <div className="mt-1">
                            {col.id === 'waiting' ? (
                              <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-50 text-slate-400 border border-slate-100 text-[8px] font-black uppercase tracking-widest">
                                <FiLock className="w-2.5 h-2.5" />
                                {q.status === 'triage' ? 'Sedang Triage' : 'Tunggu Triage'}
                              </div>
                            ) : col.id === 'ready' ? (
                              <div className="w-full">
                                <div className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 select-none">
                                  <FiCheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                                  Sudah Input Triage / Vital Sign
                                </div>
                              </div>
                            ) : col.id === 'ongoing' ? (
                              (() => {
                                const hasDraft = !!(q.medicalRecord?.consultationDraft ||
                                  q.medicalRecord?.subjective ||
                                  q.medicalRecord?.objective ||
                                  q.medicalRecord?.diagnosis ||
                                  q.medicalRecord?.treatmentPlan);
                                
                                console.log(`[Card Render] Patient: ${q.patient.name}, hasDraft: ${hasDraft}, details:`, {
                                  consultationDraft: q.medicalRecord?.consultationDraft,
                                  subjective: q.medicalRecord?.subjective,
                                  objective: q.medicalRecord?.objective
                                });

                                return hasDraft ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleStartConsultation(q)
                                    }}
                                    className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[9px] uppercase tracking-wider text-center transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-100 cursor-pointer"
                                  >
                                    <FiEdit3 className="w-3 h-3" /> Lanjutkan Pemeriksaan
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleStartConsultation(q)
                                    }}
                                    className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[9px] uppercase tracking-wider text-center transition-all flex items-center justify-center gap-1 shadow-md shadow-indigo-100 cursor-pointer"
                                  >
                                    <FiActivity className="w-3 h-3" /> Siap Di Periksa Dokter
                                  </button>
                                );
                              })()
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/doctor/queue/${q.id}`)
                                }}
                                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 font-extrabold text-[9px] uppercase tracking-wider text-center transition-all flex items-center justify-center gap-1 border border-slate-200"
                              >
                                <FiClipboard className="w-3 h-3" /> Buka Riwayat
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-350">
                      <FiInbox className="w-8 h-8 mb-2 stroke-[1.5]" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-center">Antrian Kosong</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Small icon helper
function FiInbox(props: any) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      className={props.className}
      {...props}
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0 -1.79 1.11z" />
    </svg>
  )
}
