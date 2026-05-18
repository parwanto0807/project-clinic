'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { ArrowLeft, CheckCircle, PackageCheck, AlertCircle, User, Activity, Clock, FlaskConical, Stethoscope, ChevronRight, Info, Pill, Trash2, Save, X as CloseIcon, Banknote, Printer, Settings, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'

export default function PharmacyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user } = useAuthStore()
  const isPrivileged = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const [prescription, setPrescription] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [counselingGiven, setCounselingGiven] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedItems, setEditedItems] = useState<any[]>([])
  const [availableMedicines, setAvailableMedicines] = useState<any[]>([])
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const fetchPrescription = async () => {
    try {
      const res = await api.get(`/pharmacy/prescriptions/${resolvedParams.id}`)
      setPrescription(res.data)
      setEditedItems(JSON.parse(JSON.stringify(res.data.items)))
    } catch (e: any) {
      setError(e.response?.data?.message || 'Gagal memuat resep')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPrescription()
  }, [])

  const fetchMedicines = async () => {
    try {
      const clinicId = prescription?.medicalRecord?.clinicId
      if (!clinicId) return
      const prodRes = await api.get('/inventory/products', { params: { branchId: clinicId } })
      const branchProducts = prodRes.data
      const stockRes = await api.get('/inventory/stocks', { params: { branchId: clinicId, limit: 1000 } })
      const resMap = new Map()
      stockRes.data.forEach((s: any) => {
        if (s.batchId === null) {
           const mid = s.product?.masterProduct?.medicineId
           if (mid) resMap.set(mid, (resMap.get(mid) || 0) + s.reservedQty)
        }
      })
      const enriched = branchProducts.map((p: any) => {
        const mid = p.masterProduct?.medicineId
        const physical = p.quantity || 0
        const reserved = resMap.get(mid) || 0
        return {
          id: mid,
          medicineName: p.productName,
          usedUnit: p.usedUnit || '',
          storageUnit: p.storageUnit || '',
          strength: p.strength || '',
          availableStock: Math.max(0, physical - reserved),
          sellingPrice: p.sellingPrice || 0
        }
      }).filter((m: any) => m.id)
      setAvailableMedicines(enriched.sort((a: any, b: any) => a.medicineName.localeCompare(b.medicineName)))
    } catch (e) { console.error('Gagal mengambil data obat') }
  }

  useEffect(() => {
    if (isEditing && availableMedicines.length === 0) fetchMedicines()
  }, [isEditing])

  const updateStatus = async (status: string) => {
    setIsSubmitting(true)
    setError('')
    try {
      if (status === 'dispensed' && !counselingGiven) {
        throw new Error('Harap konfirmasi bahwa edukasi obat telah diberikan kepada pasien.')
      }
      const payload: any = { status }
      if (status === 'dispensed') payload.counselingGiven = true
      await api.patch(`/pharmacy/prescriptions/${resolvedParams.id}/status`, payload)
      await fetchPrescription()
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Gagal mengubah status')
    } finally { 
      setIsSubmitting(false)
      setShowCancelConfirm(false)
    }
  }

  const handleReopenFromPharmacy = async () => {
    const qId = prescription.medicalRecord?.registration?.queueNumbers?.[0]?.id
    if (!qId) {
      setError('ID Antrian tidak ditemukan untuk resep ini.')
      return
    }
    
    if (!confirm('Apakah Anda yakin ingin mengembalikan resep ini ke Dokter? Ini akan membuka kunci konsultasi dokter agar dapat mengedit resep.')) {
      return
    }
    
    setIsSubmitting(true)
    setError('')
    try {
      await api.post(`/transactions/queues/${qId}/reopen`)
      alert('Resep berhasil dikembalikan ke Dokter! Konsultasi dokter telah terbuka.')
      router.push('/admin/transactions/pharmacy')
    } catch (e: any) {
      setError(e.response?.data?.message || 'Gagal mengembalikan resep ke Dokter')
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveItemChanges = async () => {
    setIsSubmitting(true)
    setError('')
    try {
      await api.put(`/pharmacy/prescriptions/${resolvedParams.id}/items`, { items: editedItems })
      setIsEditing(false)
      await fetchPrescription()
    } catch (e: any) { setError(e.response?.data?.message || 'Gagal memperbarui item resep') }
    finally { setIsSubmitting(false) }
  }

  const deleteItem = (idx: number) => {
    const newItems = [...editedItems]; newItems.splice(idx, 1); setEditedItems(newItems)
  }

  const updateItemQty = (idx: number, qty: number) => {
    const newItems = [...editedItems]; newItems[idx].quantity = qty; setEditedItems(newItems)
  }

  const changeMedicine = (idx: number, medicineId: string) => {
    const medicine = availableMedicines.find(m => m.id === medicineId)
    if (!medicine) return
    const newItems = [...editedItems]
    newItems[idx].medicineId = medicineId
    newItems[idx].medicine = { medicineName: medicine.medicineName, dosageForm: medicine.usedUnit, strength: medicine.strength }
    newItems[idx].usedUnit = medicine.usedUnit
    newItems[idx].storageUnit = medicine.storageUnit
    newItems[idx].availableStock = medicine.availableStock
    newItems[idx].sellingPrice = medicine.sellingPrice
    setEditedItems(newItems)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-500 font-black uppercase tracking-widest animate-pulse">Memuat rincian resep farmasi...</div>
  if (!prescription) return <div className="p-8 text-center text-red-500 font-bold">{error}</div>

  const isCompleted = prescription.dispenseStatus === 'dispensed'
  const steps = ['pending', 'preparing', 'ready', 'dispensed']
  const currentStepIdx = steps.indexOf(prescription.dispenseStatus)

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/30">
      {/* Top Banner / Breadcrumb */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin/transactions/pharmacy')} className="p-2 hover:bg-gray-50 rounded-xl transition-all active:scale-95 text-gray-400 group">
            <ArrowLeft className="w-5 h-5 group-hover:text-primary" />
          </button>
          <div className="h-6 w-px bg-gray-100" />
          <div>
            <div className="flex items-center gap-2">
               <h1 className="text-sm font-black text-gray-900 uppercase tracking-widest">{prescription.prescriptionNo}</h1>
               <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                 isCompleted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
               }`}>
                 {prescription.dispenseStatus}
               </span>
               <button 
                onClick={() => { setIsSubmitting(true); fetchPrescription().finally(() => setIsSubmitting(false)); }}
                disabled={isSubmitting}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-all active:rotate-180"
                title="Refresh Status Pembayaran"
               >
                <RefreshCw className={`w-3 h-3 text-gray-400 ${isSubmitting ? 'animate-spin text-primary' : ''}`} />
               </button>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">Transaksi APOTEK &bull; {format(new Date(prescription.createdAt), 'dd MMM yyyy HH:mm')}</p>
          </div>
        </div>

        <div className="flex gap-2">
           {!isCompleted && !isEditing && (
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 font-black text-[11px] rounded-xl hover:bg-gray-50 transition-all uppercase tracking-widest shadow-sm">
                <Settings className="w-4 h-4 text-primary" /> Edit Resep
              </button>
           )}
           <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white font-black text-[11px] rounded-xl hover:bg-black transition-all uppercase tracking-widest shadow-lg">
             <Printer className="w-4 h-4 text-primary" /> Cetak Etiket
           </button>
        </div>
      </div>

      <div className="flex-1 p-6">
        {/* Progress Stepper */}
        <div className="grid grid-cols-4 gap-4 mb-8">
           {steps.map((s, i) => {
             const active = i <= currentStepIdx
             const current = i === currentStepIdx
             return (
               <div key={s} className="relative">
                  <div className={`h-1.5 rounded-full transition-all duration-500 ${active ? 'bg-primary' : 'bg-gray-200'} ${current ? 'shadow-[0_0_10px_rgba(59,130,246,0.5)]' : ''}`} />
                  <div className="mt-3 flex items-center gap-2">
                     <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black transition-all duration-500 ${active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-400'}`}>
                        {active ? <CheckCircle className="w-3 h-3" /> : i + 1}
                     </div>
                     <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-gray-900' : 'text-gray-400'}`}>{s.replace('_', ' ')}</span>
                  </div>
               </div>
             )
           })}
        </div>

        <div className="flex flex-col xl:flex-row gap-6 items-start">
           {/* Left Column: Tables & Content */}
           <div className="flex-1 space-y-6 w-full">
              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                  <p className="text-sm font-bold text-rose-700">{error}</p>
                </motion.div>
              )}

              {/* Main Prescription Table */}
              <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden ring-1 ring-gray-100">
                 <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Rincian Obat & Inventori</h2>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">Pastikan ketersediaan fisik obat sebelum pemotongan stok.</p>
                    </div>
                    {isEditing && <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg uppercase tracking-widest animate-pulse">Mode Edit Aktif</span>}
                 </div>
                 
                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead>
                          <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                             <th className="px-8 py-5">Nama Obat / Item</th>
                             <th className="px-8 py-5 text-center">Status Stok</th>
                             <th className="px-8 py-5 text-center">Jumlah & Satuan</th>
                             <th className="px-8 py-5">Aturan Pakai</th>
                             <th className="px-8 py-5 text-right">Nilai Estimasi</th>
                             {isEditing && <th className="px-8 py-5 text-center">KendalI</th>}
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50">
                          {(isEditing ? editedItems : prescription.items).map((item: any, idx: number) => {
                             const isRacikan = item.isRacikan
                             const isExternal = item.isExternal || 
                                                item.instructions?.includes('(Apotek Luar)') || 
                                                item.instructions?.includes('[Eksternal]') ||
                                                item.instructions?.includes('Apotek Luar') ||
                                                item.instructions?.includes('Eksternal');
                             const isShort = !isRacikan && !isExternal && (item.availableStock || 0) < (item.quantity || 0)
                             const subtotal = isExternal ? 0 : (item.quantity || 0) * (item.sellingPrice || 0)

                             return (
                                <tr key={item.id || idx} className={`hover:bg-gray-50/30 transition-colors group ${isExternal ? 'bg-rose-50/20' : ''}`}>
                                   <td className="px-8 py-6">
                                      {isEditing ? (
                                        <div className="max-w-xs space-y-2">
                                           <select value={item.medicineId || ''} onChange={(e) => changeMedicine(idx, e.target.value)} className="w-full text-xs font-black p-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:border-primary transition-all uppercase">
                                              <option value="">-- Piliih Substitusi --</option>
                                              {availableMedicines.map(m => (
                                                <option key={m.id} value={m.id}>[{m.availableStock} {m.storageUnit}] {m.medicineName} ({m.usedUnit})</option>
                                              ))}
                                           </select>
                                           {isRacikan && <p className="text-[9px] font-black text-indigo-500 uppercase">Racikan Kompleks (Edit Manual terbatas)</p>}
                                        </div>
                                      ) : (
                                        <div className="flex gap-4">
                                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isRacikan ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                                              {isRacikan ? <FlaskConical className="w-5 h-5" /> : <Pill className="w-5 h-5 text-slate-300" />}
                                           </div>
                                           <div>
                                              <div className="flex items-center gap-2">
                                                 <span className="font-black text-gray-900 group-hover:text-primary transition-colors text-sm">{isRacikan ? item.racikanName : (item.medicine?.medicineName || 'Unknown')}</span>
                                                 {isExternal && <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Apotek Luar</span>}
                                                 {isRacikan && <span className="text-[8px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Racikan</span>}
                                              </div>
                                              <p className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">{item.medicine?.dosageForm || item.unit || '-'} &bull; {item.medicine?.strength || '-'}</p>
                                           </div>
                                        </div>
                                      )}
                                      
                                      {isRacikan && !isEditing && item.components && (
                                        <div className="mt-4 grid grid-cols-1 gap-2 pl-14">
                                           {item.components.map((c: any) => (
                                             <div key={c.id} className="flex items-center gap-3 text-[10px] font-bold text-gray-500 bg-gray-50/50 p-2 rounded-xl border border-gray-100 border-dashed">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-300" />
                                                <span className="w-12 text-indigo-600">{c.quantity} {c.usedUnit || 'Unit'}</span>
                                                <span className="flex-1 truncate">{c.medicine?.medicineName}</span>
                                                <span className="text-gray-300">[{c.availableStock || 0} {c.storageUnit || 'Stock'}]</span>
                                             </div>
                                           ))}
                                        </div>
                                      )}
                                   </td>
                                   <td className="px-8 py-6 text-center">
                                      {isExternal ? (
                                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-xl uppercase tracking-widest">Apotek Luar</span>
                                      ) : isRacikan ? (
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Multi-Batch</span>
                                      ) : (
                                        <div className={`inline-flex flex-col items-center p-2 rounded-2xl min-w-[80px] border ${isShort ? 'bg-rose-50 border-rose-100 animate-pulse' : 'bg-emerald-50/50 border-emerald-100'}`}>
                                           <span className={`text-lg font-black leading-none ${isShort ? 'text-rose-600' : 'text-emerald-600'}`}>{item.availableStock || 0}</span>
                                           <span className="text-[8px] font-black text-gray-400 uppercase mt-1 tracking-tighter">{item.storageUnit || 'Stock'}</span>
                                        </div>
                                      )}
                                   </td>
                                   <td className="px-8 py-6 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                         {isEditing ? (
                                           <input type="number" value={item.quantity} onChange={(e) => updateItemQty(idx, parseInt(e.target.value) || 0)} className="w-16 p-2 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm font-black outline-none focus:border-primary" />
                                         ) : (
                                           <span className="text-xl font-black text-primary">{item.quantity}</span>
                                         )}
                                         <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.usedUnit || 'Unit'}</span>
                                      </div>
                                   </td>
                                   <td className="px-8 py-6">
                                      <div className="space-y-1">
                                         <div className="flex items-center gap-2">
                                            <div className="p-1 bg-amber-50 rounded-lg"><Activity className="w-3 h-3 text-amber-600" /></div>
                                            <span className="text-xs font-black text-gray-700 uppercase tracking-tight">{item.frequency} &bull; {item.dosage}</span>
                                         </div>
                                         <p className="text-[10px] font-bold text-gray-400 pl-7 italic">"{item.instructions || 'Sesuai instruksi standar'}"</p>
                                         <p className="text-[9px] font-black text-indigo-500 uppercase pl-7 tracking-tighter">Durasi: {item.duration}</p>
                                      </div>
                                   </td>
                                   <td className="px-8 py-6 text-right">
                                      {isExternal ? (
                                        <div className="flex flex-col items-end">
                                           <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase tracking-widest leading-none">Rp 0 (Luar)</span>
                                           <span className="text-[7px] font-bold text-gray-400 uppercase mt-1">Tidak Ditagih</span>
                                        </div>
                                      ) : isPrivileged ? (
                                        <div className="flex flex-col items-end">
                                           <span className="text-[10px] font-black text-gray-900 group-hover:text-primary transition-colors leading-none">Rp {subtotal.toLocaleString('id-ID')}</span>
                                           <span className="text-[8px] font-bold text-gray-400 uppercase mt-1">@ Rp {(item.sellingPrice || 0).toLocaleString('id-ID')}</span>
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-end">
                                           <span className="text-[10px] font-black text-gray-300 tracking-[0.2em] bg-gray-100/50 px-2 py-0.5 rounded-md leading-none">••••••</span>
                                           <span className="text-[7px] font-bold text-gray-300 uppercase mt-1 tracking-tighter">Hidden</span>
                                        </div>
                                      )}
                                   </td>
                                   {isEditing && (
                                     <td className="px-8 py-6 text-center">
                                        <button onClick={() => deleteItem(idx)} className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                                           <Trash2 className="w-4 h-4" />
                                        </button>
                                     </td>
                                   )}
                                </tr>
                             )
                          })}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>

           {/* Right Column: Info & Summary */}
           <div className="w-full xl:w-96 space-y-6">
              {/* Patient Detail Card */}
              <div className="bg-gray-900 rounded-[32px] p-6 shadow-xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><User className="w-32 h-32 text-white" /></div>
                 <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                       <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/20"><User className="w-6 h-6 text-primary" /></div>
                       <div>
                          <h3 className="text-white font-black text-lg leading-tight">{prescription.patient.name}</h3>
                          <p className="text-primary font-black text-[10px] tracking-[0.2em] uppercase">{prescription.patient.medicalRecordNo}</p>
                       </div>
                    </div>
                    
                    <div className="space-y-4">
                       <div className="flex items-center justify-between text-[11px] border-b border-white/5 pb-3">
                          <span className="font-bold text-gray-500 uppercase tracking-widest">Dokter</span>
                          <span className="font-black text-gray-300">{prescription.doctor.name}</span>
                       </div>
                       <div className="flex items-center justify-between text-[11px] border-b border-white/5 pb-3">
                          <span className="font-bold text-gray-500 uppercase tracking-widest">KlinikAsal</span>
                          <span className="font-black text-gray-300">{prescription.medicalRecord?.clinic?.name || '-'}</span>
                       </div>
                       <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-gray-500 uppercase tracking-widest">Antrian</span>
                          <span className="font-black text-emerald-400 text-sm">#{prescription.medicalRecord?.registration?.registrationNo?.slice(-3) || '000'}</span>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Action Area */}
              <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm ring-1 ring-gray-100">
                 <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" /> Kendali Farmasi
                 </h3>

                 {isEditing ? (
                   <div className="space-y-4">
                      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                         <div className="flex gap-3 mb-2">
                            <Info className="w-4 h-4 text-blue-600 shrink-0" />
                            <p className="text-[11px] font-bold text-blue-900 leading-tight text-right">Anda sedang menyesuaikan resep. Pastikan dosis dan jenis substitusi sudah dikonsultasikan.</p>
                         </div>
                      </div>
                      <button onClick={saveItemChanges} disabled={isSubmitting} className="w-full py-4 bg-primary text-white font-black rounded-[20px] shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all uppercase tracking-widest text-[11px] active:scale-95 disabled:opacity-50">
                         {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                      </button>
                      <button onClick={() => { setIsEditing(false); setEditedItems(JSON.parse(JSON.stringify(prescription.items))) }} className="w-full py-3 bg-white text-gray-400 font-black rounded-[20px] transition-all uppercase tracking-widest text-[11px]">Batalkan</button>
                   </div>
                 ) : isCompleted ? (
                   <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[28px] text-center">
                      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-emerald-50"><CheckCircle className="w-10 h-10 text-emerald-600" /></div>
                      <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Status Selesai</h4>
                      <p className="text-[10px] font-bold text-emerald-600 mt-2 uppercase tracking-tighter">STOK TERPOTONG & JURNAL TERCATAT</p>
                      <div className="mt-6 pt-6 border-t border-emerald-100/50">
                         <p className="text-[9px] font-black text-emerald-400 uppercase">Apoteker Penanggung Jawab</p>
                         <p className="text-[11px] font-black text-emerald-600 mt-1 uppercase italic tracking-widest">{prescription.pharmacistId?.slice(0, 8) || 'SYSTEM ADMIN'}</p>
                      </div>
                   </div>
                 ) : (
                   <div className="space-y-4">
                      {prescription.dispenseStatus === 'pending' && (
                        <div className="space-y-3">
                             <button 
                               onClick={() => updateStatus('preparing')} 
                               disabled={isSubmitting} 
                               className="w-full py-7 bg-primary text-white font-black rounded-[24px] shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all flex flex-col items-center justify-center gap-1 active:scale-95 disabled:grayscale disabled:opacity-50 disabled:scale-100"
                             >
                                <span className="uppercase tracking-[0.2em] text-[11px]">MULAI PENGERJAAN</span>
                                <span className="text-[9px] font-bold opacity-60 uppercase">Ubah Status ke Preparing</span>
                             </button>

                             <button 
                                onClick={handleReopenFromPharmacy} 
                                disabled={isSubmitting} 
                                className="w-full py-4 bg-amber-50 text-amber-700 border border-amber-200 font-black rounded-[20px] shadow-sm hover:scale-[1.02] hover:bg-amber-100/50 transition-all flex flex-col items-center justify-center gap-1 active:scale-95 disabled:grayscale disabled:opacity-50 disabled:scale-100"
                              >
                                 <span className="uppercase tracking-widest text-[10px]">KEMBALIKAN KE DOKTER</span>
                                 <span className="text-[8px] font-bold opacity-75 uppercase">Buka Kunci Konsultasi</span>
                              </button>
                        </div>
                      )}

                      {prescription.dispenseStatus === 'preparing' && (
                        <div className="space-y-4">
                           <button onClick={() => updateStatus('ready')} disabled={isSubmitting} className="w-full py-7 bg-amber-500 text-white font-black rounded-[24px] shadow-xl shadow-amber-200 hover:scale-[1.02] transition-all flex flex-col items-center justify-center gap-1 active:scale-95">
                              <span className="uppercase tracking-[0.2em] text-[11px]">TANDAI SIAP</span>
                              <span className="text-[9px] font-bold opacity-60 text-white/70">Siap untuk diserahkan ke pasien</span>
                           </button>
                           <button onClick={() => setShowCancelConfirm(true)} disabled={isSubmitting} className="w-full py-3 bg-white text-rose-500 border border-rose-100 font-black rounded-[20px] transition-all uppercase tracking-widest text-[10px] hover:bg-rose-50 shadow-sm active:scale-95 flex items-center justify-center gap-2">
                              Kembalikan ke Antrian & Lepas Stok
                           </button>
                        </div>
                      )}

                      {prescription.dispenseStatus === 'ready' && (
                         <div className="space-y-6">
                           <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-[28px]">
                              <div className="flex gap-4 cursor-pointer" onClick={() => setCounselingGiven(!counselingGiven)}>
                                 <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${counselingGiven ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-emerald-200'}`}>
                                    {counselingGiven && <CheckCircle className="w-4 h-4 text-white" />}
                                 </div>
                                 <div className="flex-1">
                                    <p className="text-[11px] font-black text-gray-900 uppercase leading-tight tracking-tight">Konfirmasi Edukasi Obat</p>
                                    <p className="text-[10px] font-bold text-gray-500 mt-1 leading-relaxed">Saya telah memberikan konseling terkait cara pakai, dosis, dan efek samping kepada pasien.</p>
                                 </div>
                              </div>
                           </div>
                           
                           <button 
                             onClick={() => updateStatus('dispensed')} 
                             disabled={isSubmitting || !counselingGiven} 
                             className="w-full py-7 bg-emerald-600 text-white font-black rounded-[24px] shadow-xl shadow-emerald-200 hover:scale-[1.02] transition-all flex flex-col items-center justify-center gap-1 active:scale-95 disabled:grayscale disabled:opacity-50 disabled:scale-100"
                           >
                              <PackageCheck className="w-6 h-6 mb-1" />
                              <span className="uppercase tracking-[0.2em] text-[11px]">SERAHKAN & POTONG STOK</span>
                              <span className="text-[9px] font-bold opacity-60 uppercase">Finalisasi Transaksi</span>
                           </button>

                           <button onClick={() => setShowCancelConfirm(true)} disabled={isSubmitting} className="w-full py-3 bg-white text-rose-500 border border-rose-100 font-black rounded-[20px] transition-all uppercase tracking-widest text-[10px] hover:bg-rose-50 shadow-sm active:scale-95 flex items-center justify-center gap-2">
                              Batalkan Siap & Kembalikan ke Antrian
                           </button>
                        </div>
                      )}
                   </div>
                 )}
              </div>

              {/* Billing Summary Mini */}
              <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm ring-1 ring-gray-100">
                 <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimasi Tagihan Obat</span>
                    <Banknote className="w-4 h-4 text-emerald-500" />
                 </div>
                 <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase">Grand Total</span>
                    {isPrivileged ? (
                      <span className="text-2xl font-black text-gray-900">
                        Rp {prescription.items.reduce((sum: number, i: any) => {
                          const isExt = i.isExternal || 
                                        i.instructions?.includes('(Apotek Luar)') || 
                                        i.instructions?.includes('[Eksternal]') ||
                                        i.instructions?.includes('Apotek Luar') ||
                                        i.instructions?.includes('Eksternal');
                          if (isExt) return sum;
                          return sum + ((i.quantity || 0) * (i.sellingPrice || 0));
                        }, 0).toLocaleString('id-ID')}
                      </span>
                    ) : (
                      <span className="text-xl font-black text-gray-300 tracking-[0.2em] bg-gray-100/50 px-3 py-1 rounded-lg">••••••</span>
                    )}
                 </div>
                 <div className="mt-4 p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                    <Info className="w-3 h-3 text-gray-400" />
                    <p className="text-[9px] font-bold text-gray-400 leading-tight">Harga obat luar dikecualikan dari tagihan dan tidak ditagih ke pasien.</p>
                 </div>
              </div>
           </div>
        </div>
      </div>

         {/* Confirmation Modal - BATALKAN SIAP */}
         <AnimatePresence>
            {showCancelConfirm && (
               <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                  <motion.div 
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     onClick={() => setShowCancelConfirm(false)}
                     className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
                  />
                  <motion.div 
                     initial={{ opacity: 0, scale: 0.9, y: 20 }}
                     animate={{ opacity: 1, scale: 1, y: 0 }}
                     exit={{ opacity: 0, scale: 0.9, y: 20 }}
                     className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden border border-gray-100"
                  >
                     <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                           <AlertCircle className="w-8 h-8 text-rose-500" />
                        </div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">Konfirmasi Pembatalan</h3>
                        <p className="text-[11px] font-bold text-gray-500 leading-relaxed uppercase tracking-tight">
                           Resep ini akan dikembalikan ke <span className="text-rose-500">Antrian Utama (Pending)</span>. 
                           Seluruh reservasi stok akan dilepaskan kembali ke inventaris.
                        </p>
                        
                        <div className="mt-8 space-y-3">
                           <button 
                              onClick={() => updateStatus('pending')} 
                              disabled={isSubmitting}
                              className="w-full py-4 bg-rose-500 text-white font-black rounded-2xl shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all uppercase tracking-[0.15em] text-[10px] active:scale-95"
                           >
                              {isSubmitting ? 'Memproses...' : 'Ya, Batalkan & Kembalikan'}
                           </button>
                           <button 
                              onClick={() => setShowCancelConfirm(false)} 
                              className="w-full py-3 bg-white text-gray-400 font-bold rounded-2xl hover:bg-gray-50 transition-all uppercase tracking-widest text-[10px]"
                           >
                              Tetap Lanjutkan Proses
                           </button>
                        </div>
                     </div>
                     
                     <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
                        <Info className="w-3 h-3 text-gray-400" />
                        <p className="text-[9px] font-bold text-gray-400 leading-tight">Pastikan produk yang sudah disiapkan dikembalikan ke lokasi penyimpanan fisik.</p>
                     </div>
                  </motion.div>
               </div>
            )}
         </AnimatePresence>
    </div>
  )
}


