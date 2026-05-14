'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { FiCpu, FiAlertCircle, FiCheckCircle, FiLink, FiSave, FiSettings, FiBriefcase } from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import PageHeader from '@/components/admin/master/PageHeader'
import { motion, AnimatePresence } from 'framer-motion'


const SYSTEM_KEYS = [
  { key: 'ACCOUNTS_RECEIVABLE', name: 'Piutang Usaha (AR)', desc: 'Hak tagih invoice penjualan kepada pelanggan.', category: 'ASSET' },
  { key: 'SALES_REVENUE', name: 'Pendapatan Penjualan Obat', desc: 'Akun pendapatan saat invoice obat diterbitkan.', category: 'REVENUE' },
  { key: 'SERVICE_REVENUE', name: 'Pendapatan Jasa Medis', desc: 'Akun pendapatan untuk konsultasi dan tindakan dokter.', category: 'REVENUE' },
  { key: 'SALES_DISCOUNT', name: 'Potongan Penjualan', desc: 'Akun penampung diskon yang diberikan ke pasien.', category: 'REVENUE' },
  { key: 'CASH_ACCOUNT', name: 'Kas Utama / Teller', desc: 'Akun kas default untuk penerimaan tunai.', category: 'ASSET' },
  { key: 'BANK_ACCOUNT', name: 'Bank (Transfer/EDC)', desc: 'Akun bank untuk penerimaan non tunai.', category: 'ASSET' },
  { key: 'PETTY_CASH', name: 'Kas Kecil (Petty Cash)', desc: 'Kas kecil untuk pengeluaran operasional minor.', category: 'ASSET' },
  { key: 'INVENTORY_ACCOUNT', name: 'Persediaan Obat & BHP', desc: 'Nilai stok barang / obat di neraca.', category: 'ASSET' },
  { key: 'TAX_PAYABLE', name: 'Hutang Pajak (PPN)', desc: 'PPN Keluaran dari invoice penjualan.', category: 'LIABILITY' },
  { key: 'ACCOUNTS_PAYABLE', name: 'Hutang Usaha (Supplier)', desc: 'Kewajiban pembayaran atas pembelian barang.', category: 'LIABILITY' },
  { key: 'COGS', name: 'Harga Pokok Penjualan (HPP)', desc: 'Beban pokok atas obat yang terjual/diserahkan.', category: 'EXPENSE' },
  { key: 'PURCHASE_DISCOUNT', name: 'Potongan Pembelian', desc: 'Diskon yang didapat dari supplier.', category: 'REVENUE' },
  { key: 'EXPENSE_SALARY', name: 'Beban Gaji Karyawan', desc: 'Beban gaji, bonus, dan tunjangan staf.', category: 'EXPENSE' },
  { key: 'EXPENSE_UTILITY', name: 'Beban Listrik/Air/Internet', desc: 'Beban biaya rutin utilitas bulanan.', category: 'EXPENSE' },
  { key: 'MAINTENANCE_EXPENSE', name: 'Beban Maintenance Alat', desc: 'Akun beban untuk pemeliharaan dan perbaikan aset/alat medis.', category: 'EXPENSE' },
  { key: 'INTER_BRANCH_CLEARING', name: 'Kliring Antar Cabang', desc: 'Akun perantara untuk transfer aset antar cabang/klinik.', category: 'ASSET' },
  { key: 'ASSET_EQUIPMENT', name: 'Aset Tetap: Peralatan Medis', desc: 'Akun neraca untuk peralatan medis dan alat klinis.', category: 'ASSET' },
  { key: 'ASSET_INVENTORY', name: 'Aset Tetap: Inventaris & Furnitur', desc: 'Akun neraca untuk mebel, komputer, dan peralatan kantor.', category: 'ASSET' },
  { key: 'ASSET_LAND_BUILDING', name: 'Aset Tetap: Tanah & Bangunan', desc: 'Akun neraca untuk tanah dan properti bangunan.', category: 'ASSET' },
  { key: 'ACCUM_DEP_GENERAL', name: 'Akumulasi Penyusutan (General)', desc: 'Akun kontra-aset untuk menampung akumulasi penyusutan aset tetap.', category: 'ASSET' },
  { key: 'RETAINED_EARNINGS', name: 'Laba Ditahan', desc: 'Akumulasi laba bersih tahun-tahun sebelumnya.', category: 'EQUITY' },
  { key: 'COMPOUND_SERVICE_REVENUE', name: 'Pendapatan Jasa Racik / Tuslah', desc: 'Akun pendapatan untuk jasa peracikan obat puyer/kapsul.', category: 'REVENUE' },
  { key: 'LAB_REVENUE', name: 'Pendapatan Laboratorium', desc: 'Akun pendapatan untuk layanan laboratorium dan pemeriksaan penunjang.', category: 'REVENUE' },
  { key: 'DOCTOR_FEE_PAYABLE', name: 'Hutang Jasa Medik / Doctor Fee', desc: 'Kewajiban pembayaran jasa kepada dokter (titipan).', category: 'LIABILITY' },
  { key: 'DOCTOR_FEE_EXPENSE', name: 'Beban Jasa Medik / Doctor Fee Expense', desc: 'Beban biaya jasa dokter yang ditanggung klinik.', category: 'EXPENSE' },
]

export default function SystemAccountsPage() {
  const [mappings, setMappings] = useState<any[]>([])
  const [coaList, setCoaList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sysRes, coaRes] = await Promise.all([
        api.get('/master/system-accounts'),
        api.get('/master/coa')
      ])
      setMappings(sysRes.data)
      setCoaList(coaRes.data.filter((a: any) => a.accountType === 'DETAIL'))
    } catch (err: any) {
      console.error('Failed to fetch data:', err)
      setError('Gagal mengambil data dari server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleUpdate = async (key: string, coaId: string, name: string) => {
    if (!coaId) return
    
    setSavingKey(key)
    setError('')
    setSuccess('')
    
    try {
      await api.post('/master/system-accounts', { key, coaId, name })
      setSuccess(`Berhasil memperbarui pemetaan untuk ${key}`)
      fetchData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal memperbarui pemetaan.')
    } finally {
      setSavingKey(null)
    }
  }

  const getMappedCoaId = (key: string) => {
    const matches = mappings.filter(m => m.key === key)
    if (matches.length === 0) return ''
    const branchSpecific = matches.find(m => m.clinicId !== null)
    return (branchSpecific ? branchSpecific.coaId : matches[0].coaId) || ''
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="System Account Mapping"
        subtitle="Hubungkan peran sistem ke Chart of Accounts untuk otomatisasi jurnal keuangan."
        icon={<FiCpu className="w-6 h-6" />}
        breadcrumb={['Admin', 'Data Master', 'System Accounts']}
      >
        <button 
          onClick={async () => {
            if (confirm('Sinkronisasi kunci akun sistem default?')) {
              try {
                await api.post('/master/system-accounts/seed', {})
                fetchData()
                setSuccess('Kunci akun sistem berhasil disinkronkan.')
              } catch (e) {
                setError('Gagal sinkronisasi akun sistem.')
              }
            }
          }}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          <FiSettings className="w-4 h-4" />
          Sinkronisasi Akun
        </button>
      </PageHeader>

      <div className="mt-8 space-y-6">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold">
              <FiAlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}

          {success && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-xs font-bold">
              <FiCheckCircle className="w-4 h-4" />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compact Table View */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400">System Role & Key</th>
                  <th className="px-6 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Deskripsi</th>
                  <th className="px-6 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">Category</th>
                  <th className="px-6 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Linked Account (COA)</th>
                  <th className="px-6 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {SYSTEM_KEYS.map((sys, idx) => {
                  const currentCoaId = getMappedCoaId(sys.key)
                  const isSaving = savingKey === sys.key

                  return (
                    <motion.tr 
                      key={sys.key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      {/* Name & Key */}
                      <td className="px-6 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold text-slate-700 leading-none">{sys.name}</span>
                          <code className="text-[10px] font-mono text-slate-400 lowercase">{sys.key}</code>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-6 py-2.5 hidden lg:table-cell">
                        <p className="text-xs text-slate-500 max-w-xs line-clamp-2 leading-relaxed">{sys.desc}</p>
                      </td>

                      {/* Category */}
                      <td className="px-6 py-2.5 text-center">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                          sys.category === 'ASSET' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          sys.category === 'REVENUE' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          sys.category === 'EQUITY' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                          sys.category === 'LIABILITY' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                          'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                          {sys.category}
                        </span>
                      </td>

                      {/* Select Section */}
                      <td className="px-6 py-1.5 min-w-[220px]">
                        <div className="relative group/select">
                          <select
                            value={currentCoaId}
                            onChange={(e) => handleUpdate(sys.key, e.target.value, sys.name)}
                            disabled={loading || isSaving}
                            className={`w-full pl-2 pr-6 py-1 bg-white border rounded-lg font-black text-[7.5px] uppercase tracking-tighter appearance-none transition-all focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
                              currentCoaId 
                                ? 'border-slate-200 text-slate-600' 
                                : 'border-rose-200 bg-rose-50/30 text-rose-500 italic'
                            }`}
                          >
                            <option value="">-- Hubungkan Akun --</option>
                            {coaList
                                .filter(c => c.category === sys.category)
                                .map(coa => (
                                    <option key={coa.id} value={coa.id} className="text-[10px]">{coa.code} - {coa.name}</option>
                                ))
                            }
                          </select>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                            {isSaving ? <FiSettings className="w-1.5 h-1.5 animate-spin" /> : <FiLink className="w-1.5 h-1.5" />}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-2.5 text-center">
                        {currentCoaId ? (
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-100" title="Terhubung">
                            <FiCheckCircle className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-50 text-rose-500 border border-rose-100 animate-pulse" title="Belum Terhubung">
                            <FiAlertCircle className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-6 bg-slate-900 rounded-3xl text-white relative overflow-hidden group">
            <div className="relative z-10 flex items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
                    <FiBriefcase className="w-6 h-6 text-indigo-300" />
                </div>
                <div>
                    <h4 className="text-sm font-black tracking-tight mb-1">Informasi Pemetaan</h4>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-2xl">
                        Pastikan setiap peran sistem terhubung ke Akun Detail (bukan Header) agar otomatisasi jurnal keuangan berjalan lancar. 
                        Warna label kategori disesuaikan dengan standar akuntansi (Asset: Emerald, Revenue: Blue, Expense: Rose).
                    </p>
                </div>
            </div>
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all duration-700" />
        </div>
      </div>
    </div>
  )
}
