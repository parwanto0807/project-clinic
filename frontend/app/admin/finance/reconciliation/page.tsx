'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { 
  FiRefreshCw, FiCheckCircle, FiAlertCircle, FiDollarSign, 
  FiDatabase, FiLayers, FiArrowRight, FiFileText, 
  FiActivity, FiChevronDown, FiChevronUp, FiSettings
} from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'react-hot-toast'

interface AccountInfo {
  id: string
  code: string
  name: string
}

interface StockProduct {
  id: string
  name: string
  sku: string
  quantity: number
  purchasePrice: number
  totalValue: number
}

interface AdjustmentDetail {
  coaCode: string
  coaName: string
  debit: number
  credit: number
  description: string
}

interface AdjustmentJournal {
  id: string
  date: string
  referenceNo: string
  description: string
  totalAmount: number
  details: AdjustmentDetail[]
}

interface ReconciliationData {
  glBalance: number
  physicalValue: number
  discrepancy: number
  inventoryAccount: AccountInfo
  adjustmentAccount: AccountInfo | null
  stockDetails: StockProduct[]
  recentAdjustments: AdjustmentJournal[]
}

export default function ReconciliationPage() {
  const { activeClinicId } = useAuthStore()
  const [data, setData] = useState<ReconciliationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isReconciling, setIsReconciling] = useState(false)
  const [expandedJournal, setExpandedJournal] = useState<string | null>(null)
  
  // Reconcile Modal Form
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formDescription, setFormDescription] = useState('')
  const [customDebitCoa, setCustomDebitCoa] = useState('')
  const [customCreditCoa, setCustomCreditCoa] = useState('')
  const [availableCoas, setAvailableCoas] = useState<AccountInfo[]>([])

  const user = useAuthStore(state => state.user)
  const activeClinic = user?.clinics?.find(c => c.id === activeClinicId) || user?.clinics?.[0]

  const fetchData = useCallback(async () => {
    if (!activeClinicId) return
    setLoading(true)
    try {
      const { data: resData } = await api.get('/accounting/reconciliation', {
        params: { clinicId: activeClinicId }
      })
      setData(resData)
      
      // Pre-fill form options
      if (resData.inventoryAccount) {
        setCustomCreditCoa(resData.inventoryAccount.id)
      }
      if (resData.adjustmentAccount) {
        setCustomDebitCoa(resData.adjustmentAccount.id)
      }
      setFormDescription(`Jurnal Penyesuaian Rekonsiliasi Selisih Persediaan - ${activeClinic?.name || 'Pusat'}`)
    } catch (e: any) {
      console.error('Failed to fetch reconciliation data', e)
      toast.error(e.response?.data?.message || 'Gagal mengambil data rekonsiliasi.')
    } finally {
      setLoading(false)
    }
  }, [activeClinicId, activeClinic])

  const fetchCoas = useCallback(async () => {
    try {
      const { data: coaList } = await api.get('/master/coa')
      // Filter only DETAIL accounts
      setAvailableCoas(coaList.filter((c: any) => c.accountType === 'DETAIL'))
    } catch (e) {
      console.error('Failed to fetch COAs', e)
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchCoas()
  }, [fetchData, fetchCoas])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const handleAutoReconcile = async () => {
    if (!data) return
    setIsReconciling(true)
    try {
      const absDiscrepancy = Math.abs(data.discrepancy)
      
      // Kirim penyesuaian rekonsiliasi
      await api.post('/accounting/reconciliation', {
        clinicId: activeClinicId,
        amount: absDiscrepancy,
        description: formDescription,
        debitCoaId: customDebitCoa,
        creditCoaId: customCreditCoa
      })

      toast.success('Rekonsiliasi Keuangan Berhasil Diterapkan!')
      setIsModalOpen(false)
      fetchData() // Refresh data
    } catch (e: any) {
      console.error('Reconciliation failed', e)
      toast.error(e.response?.data?.message || 'Gagal menerapkan rekonsiliasi.')
    } finally {
      setIsReconciling(false)
    }
  }

  const toggleExpandJournal = (id: string) => {
    setExpandedJournal(prev => prev === id ? null : id)
  }

  return (
    <div className="w-full px-4 sm:px-6 md:px-8 py-6 space-y-8 text-left">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
              <FiRefreshCw className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Rekonsiliasi GL & Stok</h1>
              <p className="text-slate-400 font-bold text-[10px] md:text-[11px] uppercase tracking-wide">Penyelarasan Saldo Buku Besar Keuangan dengan Aset Fisik Farmasi.</p>
            </div>
          </div>
        </div>

        <button 
          onClick={fetchData}
          className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* SUMMARY GLASSMORPHIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CARD 1: GL Ledger Balance */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 flex flex-col justify-between relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-900 group-hover:scale-110 transition-transform">
            <FiDatabase className="w-24 h-24" />
          </div>
          <div className="space-y-2">
            <span className="px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black text-slate-500 uppercase tracking-wider">
              {data?.inventoryAccount?.code || '1-1301'}
            </span>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Saldo Buku Besar (GL)</p>
            <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              {loading ? 'Rp ...' : formatCurrency(data?.glBalance || 0)}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
            <span>Akun Persediaan</span>
            <span className="text-indigo-600 font-black truncate max-w-[150px]">{data?.inventoryAccount?.name || 'Persediaan Obat'}</span>
          </div>
        </div>

        {/* CARD 2: Physical Stock Value */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 flex flex-col justify-between relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-900 group-hover:scale-110 transition-transform">
            <FiLayers className="w-24 h-24" />
          </div>
          <div className="space-y-2">
            <span className="px-3 py-1 bg-indigo-50 rounded-full text-[9px] font-black text-indigo-500 uppercase tracking-wider">
              Fisik Gudang
            </span>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Nilai Aset Fisik</p>
            <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              {loading ? 'Rp ...' : formatCurrency(data?.physicalValue || 0)}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
            <span>Metode Valuasi</span>
            <span className="text-indigo-600 font-black">Weighted Cost (COGS)</span>
          </div>
        </div>

        {/* CARD 3: Sync Status & Discrepancy */}
        {data && (
          <div className={`p-6 rounded-3xl border flex flex-col justify-between transition-all duration-300 relative overflow-hidden group hover:scale-[1.02] ${
            data.discrepancy === 0 
              ? 'bg-emerald-50 border-emerald-100 shadow-emerald-50' 
              : 'bg-rose-50 border-rose-100 shadow-rose-50'
          }`}>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  data.discrepancy === 0 ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'
                }`}>
                  {data.discrepancy === 0 ? 'SINKRON' : 'ADA SELISIH'}
                </span>
                {data.discrepancy !== 0 && (
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-rose-200/50"
                  >
                    Rekonsiliasi Sekarang
                  </button>
                )}
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Discrepancy (Selisih Buku)</p>
              <h3 className={`text-2xl md:text-3xl font-black tracking-tight ${
                data.discrepancy === 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {formatCurrency(data.discrepancy)}
              </h3>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200/30 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
              <span>Status Sistem</span>
              {data.discrepancy === 0 ? (
                <div className="flex items-center gap-1 text-emerald-600 font-black">
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  <span>PERFECTLY BALANCED</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-rose-600 font-black">
                  <FiAlertCircle className="w-3.5 h-3.5" />
                  <span>BUTUH PENYESUAIAN</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CORE SECTIONS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN (8 cols): Physical Inventory Asset Breakdown */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Daftar Valuasi Fisik Farmasi</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Top 15 produk dengan nilai aset stok tertinggi di apotek saat ini.</p>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-wider">Nama Produk / SKU</th>
                    <th className="px-4 py-3 text-center text-[9px] font-black text-slate-400 uppercase tracking-wider w-20">Stok</th>
                    <th className="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-wider w-36">Harga Beli</th>
                    <th className="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-wider w-36">Total Nilai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-3"><div className="h-4 w-32 bg-slate-100 rounded"></div></td>
                        <td className="px-4 py-3"><div className="h-4 w-8 bg-slate-100 rounded mx-auto"></div></td>
                        <td className="px-4 py-3"><div className="h-4 w-20 bg-slate-100 rounded ml-auto"></div></td>
                        <td className="px-4 py-3"><div className="h-4 w-20 bg-slate-100 rounded ml-auto"></div></td>
                      </tr>
                    ))
                  ) : data && data.stockDetails.length > 0 ? (
                    data.stockDetails.map((prod) => (
                      <tr key={prod.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-black text-indigo-500 uppercase tracking-wider leading-none">{prod.sku}</span>
                            <span className="text-xs font-black text-slate-800 tracking-tight leading-tight uppercase">{prod.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-black text-slate-800">{prod.quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-black text-slate-800">{formatCurrency(prod.purchasePrice)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-black text-indigo-600">{formatCurrency(prod.totalValue)}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-300 font-black uppercase text-xs tracking-wider">
                        Tidak ada barang aktif di gudang.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Recent Adjustment Journals */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Riwayat Jurnal Penyesuaian</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Jurnal penyesuaian khusus (ADJ-) yang pernah dibuat sebelumnya.</p>
            </div>

            <div className="space-y-3">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse"></div>
                ))
              ) : data && data.recentAdjustments.length > 0 ? (
                data.recentAdjustments.map((journal) => {
                  const isExpanded = expandedJournal === journal.id
                  return (
                    <div key={journal.id} className="border border-slate-100 rounded-2xl p-4 space-y-3 bg-slate-50/30">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-[8px] font-black text-slate-600 uppercase tracking-widest rounded-lg">
                              {journal.referenceNo}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400">
                              {new Date(journal.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight leading-snug">
                            {journal.description}
                          </h4>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-xs font-black text-indigo-600">
                            {formatCurrency(journal.totalAmount)}
                          </span>
                          <button 
                            onClick={() => toggleExpandJournal(journal.id)}
                            className="p-1 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-lg border border-slate-100 transition-all"
                          >
                            {isExpanded ? <FiChevronUp className="w-3.5 h-3.5" /> : <FiChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded details list */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-slate-100/50 pt-3 space-y-2"
                          >
                            {journal.details.map((d, index) => (
                              <div key={index} className="flex justify-between items-center text-[10px] font-bold">
                                <div className="space-y-0.5">
                                  <span className="text-slate-400 uppercase tracking-wider font-mono">{d.coaCode}</span>
                                  <p className="text-slate-700 uppercase tracking-tight">{d.coaName}</p>
                                </div>
                                <div className="text-right">
                                  {d.debit > 0 ? (
                                    <span className="text-emerald-600 font-black">D: {formatCurrency(d.debit)}</span>
                                  ) : (
                                    <span className="text-indigo-600 font-black">K: {formatCurrency(d.credit)}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })
              ) : (
                <div className="py-12 text-center text-slate-300 font-black uppercase text-xs tracking-wider border border-dashed border-slate-200 rounded-2xl">
                  Belum ada riwayat penyesuaian.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* RECONCILIATION ACTION MODAL */}
      <AnimatePresence>
        {isModalOpen && data && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-6 md:p-8 space-y-6"
            >
              <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xl shadow-rose-100">
                  <FiSettings className="w-6 h-6 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1">Konfirmasi Rekonsiliasi</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Buat Jurnal Penyesuaian Otomatis</p>
                </div>
              </div>

              <div className="space-y-4 text-xs font-bold text-slate-600">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center">
                  <span className="uppercase text-slate-400">Nominal Selisih</span>
                  <span className="text-lg font-black text-rose-600">{formatCurrency(Math.abs(data.discrepancy))}</span>
                </div>

                {/* Deskripsi Jurnal */}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-slate-400 ml-1">Deskripsi Jurnal Penyesuaian</label>
                  <input 
                    type="text" 
                    value={formDescription} 
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/10 text-slate-800 text-xs"
                  />
                </div>

                {/* Akun Debet */}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-slate-400 ml-1">Akun Debet (Off-setting Account / Biaya / Tuslah)</label>
                  <select 
                    value={customDebitCoa} 
                    onChange={(e) => setCustomDebitCoa(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/10 text-slate-800 text-xs uppercase"
                  >
                    {availableCoas.map(c => (
                      <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
                    ))}
                  </select>
                  <p className="text-[8px] font-bold text-amber-600 uppercase tracking-wider mt-1 ml-1">
                    ⚠️ Direkomendasikan: Akun Pendapatan Jasa Racik/Tuslah (4-1302-K001) untuk selisih perakitan.
                  </p>
                </div>

                {/* Akun Kredit */}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-slate-400 ml-1">Akun Kredit (Buku Besar Persediaan)</label>
                  <select 
                    value={customCreditCoa} 
                    onChange={(e) => setCustomCreditCoa(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/10 text-slate-800 text-xs uppercase"
                  >
                    {availableCoas.map(c => (
                      <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleAutoReconcile}
                  disabled={isReconciling}
                  className="flex-1 px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-rose-200"
                >
                  {isReconciling ? 'Memproses...' : 'Terapkan Jurnal'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
