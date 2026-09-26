'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/Card'
import { Pill, Clock, ClipboardCheck, ArrowRight, Activity, Beaker, RefreshCw, Wrench } from 'lucide-react'
import { useAuthStore } from '@/lib/store/useAuthStore'

interface Prescription {
  id: string
  prescriptionNo: string
  prescriptionDate: string
  dispenseStatus: 'pending' | 'preparing' | 'ready' | 'dispensed'
  patient: { name: string; medicalRecordNo: string; gender: string }
  doctor: { name: string }
  items: any[]
  medicalRecord?: {
    registration?: {
      invoices: Array<{ status: string }>
    }
  }
}

export default function PharmacyQueuePage() {
  const router = useRouter()
  const { activeClinicId, user } = useAuthStore()
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRepairing, setIsRepairing] = useState(false)

  const fetchQueues = async (silent = false) => {
    try {
      if (!activeClinicId) return
      if (!silent) setIsLoading(true)
      else setIsRefreshing(true)

      const res = await api.get('/pharmacy/queues', {
        params: { clinicId: activeClinicId }
      })
      setPrescriptions(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleRepairStock = async () => {
    const confirmRepair = window.confirm(
      'Apakah Anda ingin melakukan perbaikan integritas data stok?\n\nProses ini akan menyelaraskan kuantitas batch obat dengan data stok fisik di database untuk mencegah kegagalan penyerahan obat.'
    )
    if (!confirmRepair) return

    try {
      setIsRepairing(true)
      const res = await api.post('/inventory/repair-stock')
      alert(
        `Perbaikan integritas stok berhasil!\n\n` +
        `- Batch mismatch diselaraskan: ${res.data.data.batchDiscrepanciesAligned}\n` +
        `- Kuantitas produk disinkronkan: ${res.data.data.productQuantitiesResynced}`
      )
      fetchQueues(true)
    } catch (e: any) {
      console.error(e)
      alert(e.response?.data?.message || 'Gagal memperbaiki integritas stok.')
    } finally {
      setIsRepairing(false)
    }
  }

  useEffect(() => {
    fetchQueues()
    const interval = setInterval(() => fetchQueues(true), 15000) // Poll every 15s
    return () => clearInterval(interval)
  }, [activeClinicId])

  const statusLabelMap: Record<string, string> = {
    pending: 'Menunggu',
    preparing: 'Diramu',
    ready: 'Siap',
    dispensed: 'Diserahkan',
  }

  const getStatusLabel = (status: string) => statusLabelMap[status] || status

  const pending = prescriptions.filter(p => ['pending', 'preparing'].includes(p.dispenseStatus))
  const ready = prescriptions.filter(p => ['ready', 'dispensed'].includes(p.dispenseStatus))
  const incomplete = prescriptions.filter(p => p.dispenseStatus !== 'dispensed')

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        <Activity className="animate-spin mr-2" /> Memuat antrian apotek...
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-lg font-black text-gray-900 tracking-tight uppercase">Antrian Farmasi / Apotek</h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Status resep masuk dan penyerahan obat hari ini.</p>
        </div>

        <div className="flex gap-2">
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={handleRepairStock}
              disabled={isRepairing}
              className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 rounded-xl shadow-sm active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 ${isRepairing ? 'animate-spin' : ''}`} />
              {isRepairing ? 'Repairing...' : 'Repair Stock'}
            </button>
          )}

          <button 
            onClick={() => fetchQueues(false)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 text-gray-600 rounded-xl shadow-sm hover:bg-gray-50 active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {incomplete.length > 0 && (
        <div className="mb-6 rounded-3xl border border-rose-500 bg-rose-500/10 p-4 text-sm font-black text-rose-900 uppercase tracking-wider shadow-lg animate-pulse ring-2 ring-rose-300">
          <span className="inline-flex items-center gap-2">
            <span className="px-2 py-1 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">⚠️ BELUM DISERAHKAN</span>
            Terdapat {incomplete.length} resep yang belum selesai sampai <span className="text-primary">{getStatusLabel('dispensed')}</span>. Pastikan selesaikan penyerahan obat agar stok dan laporan keuangan tercatat.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Kolom 1: Menunggu Diproses */}
        <div className="bg-orange-50/50 rounded-xl p-4 border border-orange-100">
          <div className="flex items-center justify-between mb-4 border-b border-orange-100 pb-3">
            <h2 className="text-sm font-black text-orange-800 flex items-center uppercase tracking-widest">
              <Clock className="w-4 h-4 mr-2 text-orange-500" />
              Menunggu Diramu ({pending.length})
            </h2>
          </div>
          <div className="space-y-4">
            {pending.length === 0 ? (
              <div className="text-center py-10">
                <Beaker className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tidak ada resep baru</p>
                <p className="text-[10px] text-gray-300 mt-1 px-4 italic leading-relaxed">Resep dari dokter akan muncul di sini secara otomatis untuk segera diproses oleh bagian Farmasi.</p>
              </div>
            ) : (
              pending.map((p, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                  key={p.id}
                  onClick={() => router.push(`/admin/transactions/pharmacy/${p.id}`)}
                  className="bg-white p-4 rounded-xl shadow-sm border border-orange-100 cursor-pointer hover:shadow-md hover:border-orange-300 transition-all group"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="font-bold text-gray-800 text-sm">{p.prescriptionNo}</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${p.dispenseStatus === 'preparing' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {getStatusLabel(p.dispenseStatus)}
                      </span>
                      {p.dispenseStatus !== 'dispensed' && (
                        <span className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider bg-rose-500 text-white animate-pulse">
                          BELUM SELESAI
                        </span>
                      )}
                      {(() => {
                        const isPaid = p.medicalRecord?.registration?.invoices?.some(inv => inv.status === 'paid');
                        return isPaid ? (
                          <span className="text-[8px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-black uppercase tracking-tighter">Lunas</span>
                        ) : (
                          <span className="text-[8px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-black uppercase tracking-tighter animate-pulse">Menunggu Bayar</span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mb-3">
                    <p className="font-bold">{p.patient.name} <span className="text-gray-400 font-normal">({p.patient.medicalRecordNo})</span></p>
                    <p className="text-[10px] mt-1 flex items-center uppercase font-bold tracking-tighter">
                      <Pill className="w-2.5 h-2.5 mr-1 text-slate-400" />
                      {(() => {
                        const internalCount = p.items.filter(i => {
                          return !(i.isExternal || 
                                   i.instructions?.includes('(Apotek Luar)') || 
                                   i.instructions?.includes('[Eksternal]') ||
                                   i.instructions?.includes('Apotek Luar') ||
                                   i.instructions?.includes('Eksternal'));
                        }).length;
                        const externalCount = p.items.length - internalCount;
                        if (internalCount === 0) {
                          return <span className="text-rose-500 font-black bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">100% APOTEK LUAR ({externalCount} Obat)</span>;
                        }
                        return (
                          <span className="text-gray-500">
                            {internalCount} Obat Klinik {externalCount > 0 && <span className="text-amber-600 font-black"> + {externalCount} Obat Luar</span>}
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                  <div className="text-[10px] text-gray-400 flex items-center justify-between font-bold">
                    <span>DR. {p.doctor.name.toUpperCase()}</span>
                    <span className="group-hover:text-orange-500 flex items-center transition-colors">PROSES <ArrowRight className="w-2.5 h-2.5 ml-1" /></span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Kolom 2: Siap/Selesai */}
        <div className="bg-green-50/50 rounded-xl p-4 border border-green-100">
          <div className="flex items-center justify-between mb-4 border-b border-green-100 pb-3">
            <h2 className="text-sm font-black text-green-800 flex items-center uppercase tracking-widest">
              <ClipboardCheck className="w-4 h-4 mr-2 text-green-500" />
              Siap / Selesai ({ready.length})
            </h2>
          </div>
          <div className="space-y-4">
            {ready.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6 italic">Belum ada obat yang siap.</p>
            ) : (
              ready.map((p, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                  key={p.id}
                  onClick={() => router.push(`/admin/transactions/pharmacy/${p.id}`)}
                  className="bg-white p-4 rounded-xl shadow-sm border border-green-100 cursor-pointer hover:shadow-md transition-all opacity-80 hover:opacity-100"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-gray-800">{p.prescriptionNo}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${p.dispenseStatus === 'dispensed' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                        {getStatusLabel(p.dispenseStatus)}
                      </span>
                      {p.dispenseStatus !== 'dispensed' && (
                        <span className="text-[9px] px-2 py-1 rounded-md font-black uppercase tracking-wider bg-rose-500 text-white animate-pulse">
                          BELUM DISERAHKAN
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <p className="font-semibold">{p.patient.name}</p>
                    <p className="text-xs mt-1 text-gray-500 font-bold">
                      {(() => {
                        const internalCount = p.items.filter(i => {
                          return !(i.isExternal || 
                                   i.instructions?.includes('(Apotek Luar)') || 
                                   i.instructions?.includes('[Eksternal]') ||
                                   i.instructions?.includes('Apotek Luar') ||
                                   i.instructions?.includes('Eksternal'));
                        }).length;
                        const externalCount = p.items.length - internalCount;
                        if (internalCount === 0) {
                          return <span className="text-rose-500 font-black">100% Apotek Luar ({externalCount} Obat)</span>;
                        }
                        return `${internalCount} obat klinik ${externalCount > 0 ? `+ ${externalCount} obat luar` : ''}`;
                      })()}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center justify-between">
                    <span>{new Date(p.prescriptionDate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
