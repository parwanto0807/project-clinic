'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiLayers, FiPlus, FiSearch, FiRefreshCw, FiUser, FiCalendar,
  FiCheckCircle, FiClock, FiDollarSign, FiFileText, FiX,
  FiChevronRight, FiActivity, FiCreditCard, FiEye, FiTrash2,
  FiArrowRight, FiHash
} from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/useAuthStore'
import api from '@/lib/api'

// ──────────────────────── Types ────────────────────────

interface Patient {
  id: string
  name: string
  medicalRecordNo: string
  phone?: string
  gender?: string
  dateOfBirth?: string
  address?: string
}

interface Visit {
  id: string
  visitNumber: number
  visitDate: string
  notes?: string
  medicalRecord?: {
    id: string
    diagnosis?: string
    treatmentPlan?: string
    doctor?: { id: string, name: string }
    icd10?: { code: string, nameId: string }
  }
}

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  price: number
  subtotal: number
  serviceId?: string
  service?: { id: string; serviceCode: string; serviceName: string }
}

interface PaymentRecord {
  id: string
  paymentNo: string
  amount: number
  paymentMethod: string
  paymentDate: string
  notes?: string
}

interface Invoice {
  id: string
  invoiceNo: string
  subtotal: number
  discount: number
  tax: number
  total: number
  amountPaid: number
  status: string
  items: InvoiceItem[]
  payments: PaymentRecord[]
}

interface TreatmentPlanItem {
  id: string
  description: string
  quantity: number
  price: number
  subtotal: number
}

interface TreatmentPlan {
  id: string
  description: string
  totalAmount: number
  status: 'ACTIVE' | 'COMPLETED'
  createdAt: string
  patient: Patient
  visits: Visit[]
  invoices?: Invoice[]
  items?: TreatmentPlanItem[]
}

// ──────────────────────── Helpers ────────────────────────

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

const formatDateTime = (date: string) =>
  new Date(date).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ──────────────────────── Component ────────────────────────

export default function TreatmentPlansPage() {
  const { activeClinicId } = useAuthStore()

  // List state
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Detail state
  const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Create form
  const [createForm, setCreateForm] = useState<{
    patientSearch: string;
    patientId: string;
    description: string;
    items: { id: string; description: string; quantity: number; price: number }[];
  }>({ 
    patientSearch: '', 
    patientId: '', 
    description: '',
    items: [] 
  })
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [searchingPatients, setSearchingPatients] = useState(false)

  // Visit form
  const [visitForm, setVisitForm] = useState({ notes: '', visitDate: '' })

  // Invoice form
  const [invoiceForm, setInvoiceForm] = useState({ description: 'DP / Termin', price: 0 })

  // ── Fetch list ──
  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/treatment-plans', {
        params: {
          search: search || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
          page,
          limit: 10
        }
      })
      const data = res.data?.data || []
      setPlans(data)
      if (res.data?.meta) {
        setTotalPages(res.data.meta.totalPages || 1)
        setTotalItems(res.data.meta.total || data.length)
      }
    } catch (error) {
      console.error('Fetch TreatmentPlans Error:', error)
      toast.error('Gagal mengambil data rangkaian perawatan')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, activeClinicId])

  useEffect(() => { setPage(1) }, [search, statusFilter])
  useEffect(() => { fetchPlans() }, [fetchPlans])

  // ── Fetch detail ──
  const fetchDetail = async (id: string) => {
    try {
      setDetailLoading(true)
      const res = await api.get(`/treatment-plans/${id}`)
      setSelectedPlan(res.data)
    } catch {
      toast.error('Gagal mengambil detail')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Search patients ──
  const searchPatients = async (q: string) => {
    setCreateForm(f => ({ ...f, patientSearch: q }))
    if (q.length < 2) { setPatientResults([]); return }
    try {
      setSearchingPatients(true)
      const res = await api.get('/master/patients', { params: { search: q, limit: 5 } })
      setPatientResults(res.data?.data || res.data || [])
    } catch {
      setPatientResults([])
    } finally {
      setSearchingPatients(false)
    }
  }

  // ── Create treatment plan ──
  const handleCreate = async () => {
    if (!createForm.patientId || !createForm.description) {
      return toast.error('Pilih pasien dan isi deskripsi perawatan')
    }
    try {
      setProcessing(true)
      await api.post('/treatment-plans', {
        patientId: createForm.patientId,
        description: createForm.description,
        items: createForm.items
      })
      toast.success('Rangkaian Perawatan berhasil dibuat!')
      setShowCreateModal(false)
      setCreateForm({ patientSearch: '', patientId: '', description: '', items: [] })
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal membuat rangkaian perawatan')
    } finally {
      setProcessing(false)
    }
  }

  // ── Edit treatment plan ──
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editDesc, setEditDesc] = useState('')

  const handleUpdatePlan = async () => {
    if (!selectedPlan || !editDesc.trim()) return
    try {
      setProcessing(true)
      await api.put(`/treatment-plans/${selectedPlan.id}`, { description: editDesc })
      toast.success('Deskripsi berhasil diubah')
      setIsEditingDesc(false)
      fetchDetail(selectedPlan.id)
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal merubah deskripsi')
    } finally {
      setProcessing(false)
    }
  }

  // ── Delete treatment plan ──
  const handleDeletePlan = async () => {
    if (!selectedPlan) return
    if (!confirm('Apakah Anda yakin ingin menghapus rangkaian perawatan ini?')) return
    try {
      setProcessing(true)
      await api.delete(`/treatment-plans/${selectedPlan.id}`)
      toast.success('Rangkaian perawatan berhasil dihapus')
      setSelectedPlan(null)
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal menghapus rangkaian perawatan')
    } finally {
      setProcessing(false)
    }
  }

  // ── Add visit ──
  const handleAddVisit = async () => {
    if (!selectedPlan) return
    try {
      setProcessing(true)
      await api.post(`/treatment-plans/${selectedPlan.id}/visits`, visitForm)
      toast.success('Kunjungan berhasil ditambahkan')
      setShowVisitModal(false)
      setVisitForm({ notes: '', visitDate: '' })
      fetchDetail(selectedPlan.id)
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal menambah kunjungan')
    } finally {
      setProcessing(false)
    }
  }

  // ── Create Invoice ──
  const handleCreateInvoice = async () => {
    if (!selectedPlan || !invoiceForm.description || !invoiceForm.price) {
      return toast.error('Isi deskripsi tagihan dan jumlah')
    }
    try {
      setProcessing(true)
      await api.post(`/treatment-plans/${selectedPlan.id}/invoices`, {
        items: [{ description: invoiceForm.description, price: invoiceForm.price }]
      })
      toast.success('Tagihan berhasil dibuat! Silakan selesaikan di modul Finance.')
      setShowInvoiceModal(false)
      setInvoiceForm({ description: 'DP / Termin', price: 0 })
      fetchDetail(selectedPlan.id)
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal membuat tagihan')
    } finally {
      setProcessing(false)
    }
  }

  // ── Computed ──
  const totalPlanAmount = useMemo(() => selectedPlan?.totalAmount || 0, [selectedPlan])
  const totalInvoiced = useMemo(() => selectedPlan?.invoices?.reduce((sum, inv) => sum + inv.total, 0) || 0, [selectedPlan])
  const totalPaid = useMemo(() => selectedPlan?.invoices?.reduce((sum, inv) => sum + inv.amountPaid, 0) || 0, [selectedPlan])
  const remainingToInvoice = useMemo(() => Math.max(0, totalPlanAmount - totalInvoiced), [totalPlanAmount, totalInvoiced])
  
  // Backward compatibility variables for existing UI, or update the UI
  const totalBilled = totalInvoiced
  const remaining = useMemo(() => totalBilled - totalPaid, [totalBilled, totalPaid])

  const pageNumbers = useMemo(() => {
    const range = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    for (let i = start; i <= end; i++) range.push(i)
    return range
  }, [page, totalPages])

  // ──────────────────────── RENDER ────────────────────────

  return (
    <div className="p-3 md:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen pb-40">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pt-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-[2rem] shadow-sm">
            <FiLayers className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-xl md:text-3xl font-black text-gray-900 tracking-tight uppercase leading-none">Rangkaian Perawatan</h1>
              <button
                onClick={() => fetchPlans()}
                disabled={loading}
                className="p-2.5 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-90 group"
                title="Refresh"
              >
                <FiRefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin text-primary' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              </button>
            </div>
            <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Multi-Visit Treatment Plans &amp; Down Payment</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
        >
          <FiPlus className="w-4 h-4" />
          <span>Buat Rangkaian Baru</span>
        </button>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: List Panel ── */}
        <div className={`${selectedPlan ? 'lg:w-[420px] xl:w-[480px]' : 'w-full'} shrink-0 space-y-4 transition-all duration-300`}>

          {/* Filter bar */}
          <div className="bg-white p-4 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-3">
            <div className="flex items-center gap-3 bg-gray-50 px-5 py-3.5 rounded-2xl">
              <FiSearch className="text-gray-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="CARI NAMA PASIEN / DESKRIPSI..."
                className="bg-transparent border-none focus:outline-none text-[10px] font-black text-gray-700 w-full uppercase tracking-widest"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
              {['all', 'ACTIVE', 'COMPLETED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    statusFilter === s
                      ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'all' ? 'Semua' : s === 'ACTIVE' ? 'Aktif' : 'Selesai'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="py-20 text-center flex flex-col items-center">
                <FiRefreshCw className="w-10 h-10 text-primary animate-spin mb-4 opacity-30" />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Memuat data...</p>
              </div>
            ) : plans.length === 0 ? (
              <div className="bg-gray-50/50 rounded-[3rem] p-16 text-center border-4 border-dashed border-white flex flex-col items-center">
                <FiLayers className="w-12 h-12 text-gray-200 mb-4" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada rangkaian perawatan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((plan, idx) => {
                  const isSelected = selectedPlan?.id === plan.id
                  const invs = plan.invoices || []
                  const total = plan.totalAmount || invs.reduce((sum, inv) => sum + inv.total, 0)
                  const paid = invs.reduce((sum, inv) => sum + inv.amountPaid, 0)
                  const paidPercent = total > 0 ? Math.round((paid / total) * 100) : 0
                  
                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() => fetchDetail(plan.id)}
                      className={`bg-white border rounded-[2rem] p-5 md:p-6 cursor-pointer group transition-all ${
                        isSelected
                          ? 'border-primary/40 shadow-xl shadow-primary/10 ring-2 ring-primary/20'
                          : 'border-gray-100 shadow-sm hover:shadow-lg hover:border-primary/20'
                      }`}
                    >
                      {/* Patient & Plan info */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                            isSelected ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400 group-hover:bg-primary/5 group-hover:text-primary'
                          }`}>
                            <FiUser className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 uppercase truncate">{plan.patient.name}</p>
                            <p className="text-[10px] font-bold text-gray-400 tracking-widest font-mono">{plan.patient.medicalRecordNo}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border shrink-0 ${
                          plan.status === 'ACTIVE'
                            ? 'bg-sky-50 text-sky-600 border-sky-100'
                            : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        }`}>
                          {plan.status === 'ACTIVE' ? 'Aktif' : 'Selesai'}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs font-bold text-gray-700 mb-3 line-clamp-2">{plan.description}</p>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1">
                          <FiCalendar className="w-3 h-3" />
                          {plan.visits?.length || 0} Visit
                        </span>
                        <span className="flex items-center gap-1">
                          <FiDollarSign className="w-3 h-3" />
                          {formatCurrency(total)}
                        </span>
                        {total > 0 && (
                          <span className={`flex items-center gap-1 ${paid >= total ? 'text-emerald-500' : 'text-amber-500'}`}>
                            <FiCreditCard className="w-3 h-3" />
                            {paidPercent}%
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {total > 0 && (
                        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${paidPercent}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className={`h-full rounded-full ${
                              paidPercent >= 100 ? 'bg-emerald-500' : paidPercent > 0 ? 'bg-amber-400' : 'bg-gray-200'
                            }`}
                          />
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}
          </AnimatePresence>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                className={`px-4 py-2 bg-gray-50 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/5 hover:text-primary'}`}
              >Prev</button>
              {pageNumbers.map(p => (
                <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all ${page === p ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:bg-gray-50'}`}>{p}</button>
              ))}
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                className={`px-4 py-2 bg-gray-50 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/5 hover:text-primary'}`}
              >Next</button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Detail Panel ── */}
        <AnimatePresence mode="wait">
          {selectedPlan && (
            <motion.div
              key={selectedPlan.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="flex-1 min-w-0 space-y-5"
            >
              {detailLoading ? (
                <div className="bg-white rounded-[3rem] border border-gray-100 p-16 text-center">
                  <FiRefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-3 opacity-30" />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading...</p>
                </div>
              ) : (
                <>
                  {/* Patient Header Card */}
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 md:p-8">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl flex items-center justify-center text-primary">
                          <FiUser className="w-7 h-7" />
                        </div>
                        <div>
                          <h2 className="text-lg md:text-xl font-black text-gray-900 uppercase tracking-tight">{selectedPlan.patient.name}</h2>
                          <p className="text-[10px] font-bold text-gray-400 tracking-widest font-mono">{selectedPlan.patient.medicalRecordNo} {selectedPlan.patient.phone && `• ${selectedPlan.patient.phone}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedPlan.status === 'ACTIVE' && selectedPlan.visits.length === 0 && (!selectedPlan.invoices || selectedPlan.invoices.every(inv => !inv.payments || inv.payments.length === 0)) && (
                          <button onClick={handleDeletePlan} disabled={processing} className="p-2 text-gray-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-all">
                            <FiTrash2 className="w-5 h-5" />
                          </button>
                        )}
                        <button onClick={() => { setSelectedPlan(null); setIsEditingDesc(false); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 transition-all">
                          <FiX className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-2xl p-4 relative group">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Deskripsi Perawatan</p>
                        {!isEditingDesc && selectedPlan.status === 'ACTIVE' && (
                          <button onClick={() => { setEditDesc(selectedPlan.description); setIsEditingDesc(true); }} className="text-[9px] font-bold text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                            Edit Deskripsi
                          </button>
                        )}
                      </div>
                      
                      {isEditingDesc ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-primary/40"
                            autoFocus
                          />
                          <button onClick={handleUpdatePlan} disabled={processing} className="px-3 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90">Simpan</button>
                          <button onClick={() => setIsEditingDesc(false)} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300">Batal</button>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-gray-800">{selectedPlan.description}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 mt-4">
                      <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                        selectedPlan.status === 'ACTIVE' ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {selectedPlan.status === 'ACTIVE' ? '● Aktif' : '✓ Selesai'}
                      </span>
                      <span className="text-[9px] font-bold text-gray-400 tracking-widest">
                        Dibuat: {formatDate(selectedPlan.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Visit Timeline */}
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 md:p-8">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center text-violet-500">
                          <FiActivity className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Timeline Kunjungan</h3>
                      </div>
                      {selectedPlan.status === 'ACTIVE' && (
                        <button
                          onClick={() => setShowVisitModal(true)}
                          className="px-4 py-2.5 bg-violet-50 text-violet-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-violet-100 transition-all flex items-center gap-1.5"
                        >
                          <FiPlus className="w-3.5 h-3.5" /> Visit
                        </button>
                      )}
                    </div>

                    {selectedPlan.visits.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">Belum ada kunjungan</p>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/30 via-violet-200 to-gray-100" />

                        <div className="space-y-4">
                          {selectedPlan.visits.map((visit, idx) => (
                            <div key={visit.id} className="flex items-start gap-4 relative">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 z-10 text-xs font-black ${
                                idx === selectedPlan.visits.length - 1
                                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {visit.visitNumber}
                              </div>
                              <div className="flex-1 bg-gray-50 rounded-xl p-4 min-w-0 border border-gray-100 shadow-sm">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div>
                                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Kunjungan #{visit.visitNumber}</p>
                                    <p className="text-[9px] font-bold text-gray-400 tracking-widest mt-0.5">{formatDateTime(visit.visitDate)}</p>
                                  </div>
                                  {visit.medicalRecord?.doctor && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-gray-100">
                                      <FiUser className="w-3 h-3 text-gray-400" />
                                      <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest truncate max-w-[120px]">
                                        {visit.medicalRecord.doctor.name}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2 mt-3">
                                  {visit.medicalRecord?.diagnosis && (
                                    <div>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Diagnosa & Terapi</p>
                                      <p className="text-xs font-medium text-gray-700 leading-relaxed">
                                        {visit.medicalRecord.icd10 && (
                                          <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black mr-1.5">
                                            {visit.medicalRecord.icd10.code}
                                          </span>
                                        )}
                                        {visit.medicalRecord.diagnosis}
                                      </p>
                                      {visit.medicalRecord.treatmentPlan && (
                                        <p className="text-xs text-gray-600 mt-1 italic">"{visit.medicalRecord.treatmentPlan}"</p>
                                      )}
                                    </div>
                                  )}

                                  {visit.notes && !visit.notes.includes('Kunjungan ke-') && (
                                    <div>
                                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Catatan</p>
                                      <p className="text-xs text-gray-600">{visit.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Plan Items List */}
                  {selectedPlan.items && selectedPlan.items.length > 0 && (
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 md:p-8 mb-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                          <FiLayers className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Item Perawatan</h3>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {selectedPlan.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl">
                            <div>
                              <p className="text-sm font-bold text-gray-800">{item.description}</p>
                              <p className="text-xs text-gray-500">{item.quantity} x {formatCurrency(item.price)}</p>
                            </div>
                            <p className="text-sm font-black text-primary">{formatCurrency(item.subtotal)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Total Biaya Perawatan</p>
                        <p className="text-lg font-black text-primary">{formatCurrency(totalPlanAmount)}</p>
                      </div>
                    </div>
                  )}

                  {/* Invoices List */}
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 md:p-8">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                          <FiFileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Daftar Tagihan / Termin</h3>
                        </div>
                      </div>
                      {selectedPlan.status === 'ACTIVE' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setInvoiceForm({ description: 'DP Perawatan', price: 0 })
                              setShowInvoiceModal(true)
                            }}
                            className="px-4 py-2.5 bg-amber-50 text-amber-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all flex items-center gap-1.5"
                          >
                            <FiPlus className="w-3.5 h-3.5" /> Bayar DP
                          </button>
                          <button
                            onClick={() => {
                              setInvoiceForm({ description: 'Pelunasan Perawatan', price: remainingToInvoice })
                              setShowInvoiceModal(true)
                            }}
                            className="px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-1.5"
                          >
                            <FiCheckCircle className="w-3.5 h-3.5" /> Pelunasan
                          </button>
                        </div>
                      )}
                    </div>

                    {!selectedPlan.invoices || selectedPlan.invoices.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Belum ada tagihan diterbitkan</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 mb-5">
                          {selectedPlan.invoices.map((inv) => (
                            <div key={inv.id} className="flex items-start gap-4 bg-gray-50 rounded-xl p-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-bold text-gray-800">{inv.items?.[0]?.description || 'Tagihan Perawatan'}</p>
                                  <p className="text-sm font-black text-gray-900">{formatCurrency(inv.total)}</p>
                                </div>
                                <div className="flex items-center justify-between">
                                  <p className="text-[9px] font-bold text-gray-400 tracking-widest font-mono">{inv.invoiceNo}</p>
                                  <span className={`text-[9px] font-black uppercase tracking-widest ${inv.status === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {inv.status === 'paid' ? 'Lunas' : 'Belum Lunas'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Totals Summary */}
                        <div className="border-t border-dashed border-gray-200 pt-4 space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-gray-400 uppercase tracking-widest">Total Keseluruhan</span>
                            <span className="font-black text-gray-700">{formatCurrency(totalBilled)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-emerald-500 uppercase tracking-widest">Total Terbayar</span>
                            <span className="font-black text-emerald-600">{formatCurrency(totalPaid)}</span>
                          </div>
                          {remaining > 0 && (
                            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                              <span className="font-black text-rose-500 uppercase tracking-widest text-xs">Sisa Belum Dibayar</span>
                              <span className="font-black text-rose-600">{formatCurrency(remaining)}</span>
                            </div>
                          )}
                        </div>

                        {remaining > 0 && (
                          <div className="mt-5 p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Pembayaran dapat dilakukan melalui menu Kasir (Finance)</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* ── Create Treatment Plan Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !processing && setShowCreateModal(false)} className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white rounded-[2.5rem] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><FiPlus className="w-5 h-5" /></div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Buat Rangkaian Perawatan</h3>
                  </div>
                  <button onClick={() => !processing && setShowCreateModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50"><FiX className="w-5 h-5" /></button>
                </div>

                {/* Patient Search */}
                <div className="mb-5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Pilih Pasien *</label>
                  {createForm.patientId ? (
                    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <FiUser className="text-primary w-5 h-5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-black text-gray-900">{patientResults.find(p => p.id === createForm.patientId)?.name || createForm.patientSearch}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{patientResults.find(p => p.id === createForm.patientId)?.medicalRecordNo}</p>
                      </div>
                      <button onClick={() => setCreateForm(f => ({ ...f, patientId: '', patientSearch: '' }))} className="text-gray-400 hover:text-rose-500"><FiX className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        <FiSearch className="text-gray-400 w-4 h-4 shrink-0" />
                        <input
                          type="text"
                          value={createForm.patientSearch}
                          onChange={(e) => searchPatients(e.target.value)}
                          placeholder="Ketik nama atau No. RM pasien..."
                          className="bg-transparent border-none focus:outline-none text-sm text-gray-700 w-full"
                        />
                        {searchingPatients && <FiRefreshCw className="w-4 h-4 text-primary animate-spin" />}
                      </div>
                      {patientResults.length > 0 && !createForm.patientId && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 overflow-hidden">
                          {patientResults.map(p => (
                            <button
                              key={p.id}
                              onClick={() => { setCreateForm(f => ({ ...f, patientId: p.id, patientSearch: p.name })); }}
                              className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <p className="text-sm font-bold text-gray-800">{p.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{p.medicalRecordNo} {p.phone && `• ${p.phone}`}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="mb-5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Deskripsi Perawatan *</label>
                  <input
                    type="text"
                    value={createForm.description}
                    onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Misal: Perawatan Saluran Akar Gigi 36"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
                {/* Items */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Item Perawatan</label>
                    <button
                      onClick={() => setCreateForm(f => ({
                        ...f,
                        items: [...f.items, { id: Math.random().toString(), description: '', quantity: 1, price: 0 }]
                      }))}
                      className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                    >
                      <FiPlus className="w-3 h-3" /> Tambah Item
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {createForm.items.map((item, index) => (
                      <div key={item.id} className="flex items-start gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            placeholder="Nama item/tindakan"
                            value={item.description}
                            onChange={(e) => {
                              const newItems = [...createForm.items]
                              newItems[index].description = e.target.value
                              setCreateForm(f => ({ ...f, items: newItems }))
                            }}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                          />
                          <div className="flex gap-2">
                            <div className="w-20">
                              <input
                                type="number"
                                placeholder="Qty"
                                min="1"
                                value={item.quantity || ''}
                                onChange={(e) => {
                                  const newItems = [...createForm.items]
                                  newItems[index].quantity = parseInt(e.target.value) || 0
                                  setCreateForm(f => ({ ...f, items: newItems }))
                                }}
                                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                              />
                            </div>
                            <div className="flex-1">
                              <input
                                type="number"
                                placeholder="Harga (Rp)"
                                value={item.price || ''}
                                onChange={(e) => {
                                  const newItems = [...createForm.items]
                                  newItems[index].price = parseInt(e.target.value) || 0
                                  setCreateForm(f => ({ ...f, items: newItems }))
                                }}
                                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newItems = createForm.items.filter((_, i) => i !== index)
                            setCreateForm(f => ({ ...f, items: newItems }))
                          }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {createForm.items.length === 0 && (
                      <div className="text-center py-4 text-[10px] text-gray-400 font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        Belum ada item perawatan.
                      </div>
                    )}
                  </div>
                  
                  {createForm.items.length > 0 && (
                    <div className="mt-4 flex items-center justify-between bg-primary/5 rounded-xl p-3 border border-primary/10">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Total Biaya</span>
                      <span className="text-sm font-bold text-primary">
                        {formatCurrency(createForm.items.reduce((sum, it) => sum + (it.quantity * it.price), 0))}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleCreate}
                  disabled={processing || !createForm.patientId || !createForm.description}
                  className="w-full px-6 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {processing ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
                  {processing ? 'Memproses...' : 'Buat Rangkaian Perawatan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add Visit Modal ── */}
      <AnimatePresence>
        {showVisitModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !processing && setShowVisitModal(false)} className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl">
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-500"><FiActivity className="w-5 h-5" /></div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Tambah Kunjungan</h3>
                  </div>
                  <button onClick={() => !processing && setShowVisitModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50"><FiX className="w-5 h-5" /></button>
                </div>

                <div className="mb-4">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Tanggal Kunjungan</label>
                  <input
                    type="date"
                    value={visitForm.visitDate}
                    onChange={(e) => setVisitForm(f => ({ ...f, visitDate: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>

                <div className="mb-6">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Catatan</label>
                  <textarea
                    value={visitForm.notes}
                    onChange={(e) => setVisitForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Catatan kunjungan..."
                    rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 resize-none"
                  />
                </div>

                <button
                  onClick={handleAddVisit}
                  disabled={processing}
                  className="w-full px-6 py-4 bg-violet-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
                  {processing ? 'Memproses...' : 'Tambah Kunjungan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Create Invoice Modal ── */}
      <AnimatePresence>
        {showInvoiceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !processing && setShowInvoiceModal(false)} className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl">
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500"><FiFileText className="w-5 h-5" /></div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Buat Tagihan Baru</h3>
                  </div>
                  <button onClick={() => !processing && setShowInvoiceModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50"><FiX className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Deskripsi Tagihan *</label>
                    <input type="text" value={invoiceForm.description} onChange={(e) => setInvoiceForm(f => ({ ...f, description: e.target.value }))} placeholder="Misal: DP Kunjungan 1" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Jumlah Tagihan (Rp) *</label>
                    <input type="number" value={invoiceForm.price || ''} onChange={(e) => setInvoiceForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} placeholder="0" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
                  </div>
                </div>

                <button
                  onClick={handleCreateInvoice}
                  disabled={processing || !invoiceForm.description || !invoiceForm.price}
                  className="w-full px-6 py-4 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
                  {processing ? 'Memproses...' : 'Terbitkan Tagihan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
