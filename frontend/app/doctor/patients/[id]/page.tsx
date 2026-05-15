'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import { 
  FiUser, FiCalendar, FiPhone, FiInfo, FiActivity, FiRotateCcw, 
  FiClipboard, FiHeart, FiThermometer, FiWind, FiArrowLeft, 
  FiPackage, FiCheckCircle, FiHome, FiClock, FiMapPin, FiSmile,
  FiAlertCircle
} from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

interface Patient {
  id: string
  name: string
  medicalRecordNo: string
  gender: string
  dateOfBirth: string
  phone: string
  address?: string
  bloodType?: string
  allergies?: string
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuthStore()
  
  const [patient, setPatient] = useState<Patient | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!user || !id) return
    setLoading(true)
    try {
      // Fetch patient basic info
      const pRes = await api.get(`master/patients/${id}`)
      setPatient(pRes.data)

      // Fetch medical history
      const hRes = await api.get(`transactions/medical-records/patient/${id}`)
      setHistory(hRes.data)
    } catch (e) {
      console.error('Failed to fetch patient data', e)
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Helper to calculate age
  const age = useMemo(() => {
    if (!patient?.dateOfBirth) return '-'
    const birthDate = new Date(patient.dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age
  }, [patient])

  const latestVitals = useMemo(() => {
    if (history.length === 0) return null
    return history[0].vitals?.[0] || null
  }, [history])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-center">
          <div className="w-16 h-16 border-[6px] border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Menyinkronkan Rekam Medis...</p>
        </div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <div className="text-center">
          <div className="w-24 h-24 bg-white rounded-[2.5rem] border border-slate-100 flex items-center justify-center mx-auto mb-8 shadow-sm">
            <FiUser className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Data Tidak Ditemukan</h2>
          <p className="text-slate-400 font-bold mb-10 max-w-xs mx-auto uppercase text-[10px] tracking-widest leading-relaxed">
            Identitas pasien tidak terdaftar di sistem atau akses Anda telah dibatasi.
          </p>
          <button 
            onClick={() => router.back()} 
            className="px-10 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl active:scale-95"
          >
            Kembali ke Antrean
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10 min-h-screen pb-32 bg-[#F8FAFC]">
      {/* Dynamic Glass Header */}
      <div className="relative pt-12 px-6 lg:px-12 pb-20 overflow-hidden bg-slate-900 rounded-b-[4rem] shadow-2xl shadow-slate-200">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[140px] -mr-64 -mt-64 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] -ml-32 -mb-32" />
        
        <div className="relative max-w-8xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-10 items-start lg:items-center justify-between">
            <div className="flex items-center gap-8">
              <button 
                onClick={() => router.back()}
                className="w-14 h-14 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl text-white flex items-center justify-center hover:bg-white/10 transition-all group"
              >
                <FiArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
              </button>
              
              <div className="flex items-center gap-8">
                <div className="relative">
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-[3rem] bg-gradient-to-tr from-emerald-400 to-indigo-600 flex items-center justify-center text-white text-4xl font-black shadow-2xl border-4 border-white/10">
                    {patient.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-2xl border-4 border-slate-900 flex items-center justify-center text-white shadow-lg">
                    <FiCheckCircle className="w-5 h-5" />
                  </div>
                </div>
                
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-full text-[9px] font-black text-white uppercase tracking-widest">
                      RM: {patient.medicalRecordNo}
                    </span>
                    <span className="px-3 py-1 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/20 rounded-full text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                      Usia: {age} Tahun
                    </span>
                    {patient.allergies && (
                      <span className="px-3 py-1 bg-rose-500/20 backdrop-blur-md border border-rose-500/20 rounded-full text-[9px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                        <FiAlertCircle className="w-3 h-3" /> Ada Alergi
                      </span>
                    )}
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none mb-3">
                    {patient.name}
                  </h1>
                  <p className="flex items-center gap-2 text-slate-400 font-bold text-[11px] uppercase tracking-[0.2em]">
                    <FiMapPin className="text-emerald-500 w-3.5 h-3.5" /> {patient.address || 'Alamat tidak lengkap'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
               <div className="text-center px-8 border-r border-white/10">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Gol. Darah</p>
                  <p className="text-3xl font-black text-white">{patient.bloodType || '?'}</p>
               </div>
               <div className="text-center px-8 border-r border-white/10">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Kunjungan</p>
                  <p className="text-3xl font-black text-white">{history.length}</p>
               </div>
               <div className="text-center px-8">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Gender</p>
                  <p className="text-3xl font-black text-white">{patient.gender === 'M' ? 'L' : 'P'}</p>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-8xl mx-auto px-6 lg:px-12 grid grid-cols-1 xl:grid-cols-12 gap-12 -mt-10">
        {/* Sidebar Info */}
        <div className="xl:col-span-4 space-y-10">
          {/* Medical Snapshot Vitals */}
          <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 -z-0" />
             <div className="relative z-10 flex items-center justify-between">
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Vital Signs</h3>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                   <FiClock className="w-3 h-3" /> Terakhir diperiksa
                </span>
             </div>

             <div className="relative z-10 grid grid-cols-2 gap-8">
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FiHeart className="text-rose-500" /> Tensi (BP)
                   </p>
                   <p className="text-2xl font-black text-slate-900">{latestVitals?.bloodPressure || '-'}</p>
                   <p className="text-[9px] font-bold text-slate-300">mmHg</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FiThermometer className="text-amber-500" /> Suhu (Temp)
                   </p>
                   <p className="text-2xl font-black text-slate-900">{latestVitals?.temperature || '-'}°C</p>
                   <p className="text-[9px] font-bold text-emerald-400 font-bold uppercase tracking-tighter">Stabil</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FiWind className="text-blue-500" /> Pernapasan
                   </p>
                   <p className="text-2xl font-black text-slate-900">{latestVitals?.respirationRate || '-'}</p>
                   <p className="text-[9px] font-bold text-slate-300">x / Menit</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FiActivity className="text-emerald-500" /> Detak Nadi
                   </p>
                   <p className="text-2xl font-black text-slate-900">{latestVitals?.heartRate || '-'}</p>
                   <p className="text-[9px] font-bold text-slate-300">bpm</p>
                </div>
             </div>

             <div className="relative z-10 pt-6 border-t border-slate-50 flex items-center justify-between">
                <div>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Berat Badan</p>
                   <p className="text-lg font-black text-slate-800">{latestVitals?.weight || '-'} <span className="text-xs text-slate-400">kg</span></p>
                </div>
                <div>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tinggi Badan</p>
                   <p className="text-lg font-black text-slate-800">{latestVitals?.height || '-'} <span className="text-xs text-slate-400">cm</span></p>
                </div>
             </div>
          </div>

          {/* Allergy Warning Card */}
          {patient.allergies && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-rose-500 p-8 rounded-[3rem] text-white shadow-2xl shadow-rose-200 relative overflow-hidden"
            >
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
               <FiAlertCircle className="w-8 h-8 mb-4 animate-bounce" />
               <h4 className="text-xs font-black uppercase tracking-[0.3em] mb-2">Riwayat Alergi & Reaksi</h4>
               <p className="text-lg font-black leading-tight">{patient.allergies}</p>
               <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-[9px] font-black uppercase">
                  <FiInfo className="w-3 h-3" /> High Alert
               </div>
            </motion.div>
          )}

          {/* Demographic Section */}
          <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm space-y-8">
             <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                <FiInfo className="text-emerald-500 w-4 h-4" /> Personal Profile
             </h3>
             
             <div className="space-y-8">
                {[
                  { label: 'Tanggal Lahir', value: patient.dateOfBirth ? format(new Date(patient.dateOfBirth), 'dd MMMM yyyy', { locale: idLocale }) : '-', icon: <FiCalendar />, color: 'text-indigo-500' },
                  { label: 'Nomor Telepon', value: patient.phone, icon: <FiPhone />, color: 'text-emerald-500' },
                  { label: 'Tempat Tinggal', value: patient.address || 'Belum Terdaftar', icon: <FiHome />, color: 'text-rose-500' },
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-6 group">
                    <div className={`w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform shadow-sm`}>
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">{item.label}</p>
                      <p className="text-sm font-bold text-slate-800 leading-tight">{item.value}</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* Clinical History Timeline */}
        <div className="xl:col-span-8 space-y-10">
          <div className="flex items-center justify-between px-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.4em] flex items-center gap-4">
              <FiRotateCcw className="w-6 h-6 text-emerald-500" /> Medical History Log
            </h3>
            <div className="flex items-center gap-4">
               <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Urutkan:</span>
               <select className="bg-white border-none text-[10px] font-black text-slate-800 uppercase tracking-widest focus:ring-0 cursor-pointer">
                  <option>Terbaru</option>
                  <option>Terlama</option>
               </select>
            </div>
          </div>

          <div className="relative pl-10 space-y-12">
            {/* Timeline Vertical Axis */}
            <div className="absolute left-[13px] top-4 bottom-4 w-[3px] bg-gradient-to-b from-emerald-500 via-slate-100 to-transparent" />
            
            {history.length > 0 ? (
              history.map((record, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  key={record.id} 
                  className="relative group"
                >
                  {/* Modern Timeline Node */}
                  <div className="absolute -left-[35px] top-6 w-8 h-8 rounded-2xl bg-white border-4 border-emerald-500 shadow-xl z-10 group-hover:scale-125 transition-transform flex items-center justify-center">
                     <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  </div>
                  
                  <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-700 relative overflow-hidden">
                    {/* Identification */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-10 pb-8 border-b border-slate-50">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-slate-900 flex items-center justify-center text-white shadow-xl">
                          <FiCalendar className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">
                            {format(new Date(record.recordDate), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
                          </p>
                          <h4 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                            Rekam Medis <span className="text-slate-300 font-bold ml-1">#{record.recordNo}</span>
                          </h4>
                        </div>
                      </div>
                      <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-right">Pemeriksa</p>
                         <p className="font-black text-slate-800 text-sm">{record.doctor?.name || 'Dokter Jaga'}</p>
                      </div>
                    </div>

                    {/* S.O.A.P Presentation */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                      <div className="space-y-8">
                        {/* S & O (Clinical Findings) */}
                        <div className="space-y-6">
                           <div className="relative">
                              <div className="absolute -left-6 top-0 w-1.5 h-10 bg-indigo-500 rounded-full opacity-50" />
                              <h5 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                 <span className="w-6 h-6 rounded-lg bg-indigo-500 text-white flex items-center justify-center text-[9px] font-black">S</span> Subjective (Anamnesa)
                              </h5>
                              <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
                                "{record.subjective || record.chiefComplaint || 'Tidak ada keluhan utama yang dicatat.'}"
                              </p>
                           </div>

                           <div className="relative">
                              <div className="absolute -left-6 top-0 w-1.5 h-10 bg-emerald-500 rounded-full opacity-50" />
                              <h5 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                 <span className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black">O</span> Objective (Pemeriksaan)
                              </h5>
                              <p className="text-sm font-bold text-slate-700 leading-relaxed">
                                {record.objective || 'Hasil pemeriksaan fisik normal.'}
                              </p>
                              {record.vitals?.[0] && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                   <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-tighter">
                                      Tensi: {record.vitals[0].bloodPressure}
                                   </span>
                                   <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-tighter">
                                      Suhu: {record.vitals[0].temperature}°C
                                   </span>
                                </div>
                              )}
                           </div>
                        </div>
                      </div>

                      <div className="space-y-8">
                        {/* A & P (Clinical Decisions) */}
                        <div className="p-8 bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-slate-200">
                           <div className="mb-8">
                              <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                 <span className="w-6 h-6 rounded-lg bg-emerald-400 text-slate-900 flex items-center justify-center text-[9px] font-black">A</span> Assessment (Diagnosa)
                              </h5>
                               <div className="space-y-3">
                                 {record.icd10 && (
                                   <div className="flex flex-col gap-1.5 p-3 bg-white/5 rounded-xl border border-white/5">
                                      <div className="flex items-center gap-2">
                                         <span className="text-[10px] font-black bg-emerald-400 text-slate-900 px-2 py-0.5 rounded">{record.icd10.code}</span>
                                         <span className="text-xs font-black text-emerald-400 uppercase tracking-tight">{record.icd10.nameId || record.icd10.nameEn}</span>
                                      </div>
                                      {record.icd10.description && (
                                         <p className="text-[10px] font-medium text-slate-400 italic leading-relaxed">{record.icd10.description}</p>
                                      )}
                                   </div>
                                 )}
                                 <p className="text-md font-black text-white leading-relaxed">
                                   {record.diagnosis || (record.icd10 ? '' : 'Observasi Klinis')}
                                 </p>
                               </div>
                           </div>

                           <div>
                              <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                 <span className="w-6 h-6 rounded-lg bg-emerald-400 text-slate-900 flex items-center justify-center text-[9px] font-black">P</span> Plan (Terapi)
                              </h5>
                              <p className="text-sm font-bold text-slate-400 leading-relaxed">
                                {record.treatmentPlan || 'Monitoring berkala.'}
                              </p>
                           </div>
                        </div>

                        {/* Services & Actions */}
                        {record.services?.length > 0 && (
                          <div className="p-8 bg-emerald-50/30 rounded-[2.5rem] border border-emerald-100/50">
                             <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-5 flex items-center gap-3">
                                <FiActivity className="w-4 h-4" /> Tindakan & Layanan
                             </h5>
                             <div className="space-y-4">
                                {record.services.map((s: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between gap-4">
                                     <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <p className="text-sm font-black text-slate-800">{s.service?.serviceName}</p>
                                     </div>
                                     <span className="px-3 py-1 bg-white border border-emerald-100 rounded-full text-[9px] font-black text-emerald-500 uppercase">
                                        {s.quantity}x
                                     </span>
                                  </div>
                                ))}
                             </div>
                          </div>
                        )}

                        {/* Prescription List */}
                        {record.prescriptions?.length > 0 && (
                          <div className="p-8 bg-rose-50/50 rounded-[2.5rem] border border-rose-100">
                             <h5 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-5 flex items-center gap-3">
                                <FiPackage className="w-4 h-4" /> Resep & Instruksi Obat
                             </h5>
                             <div className="space-y-5">
                                {record.prescriptions.flatMap((p: any) => p.items).map((item: any, idx: number) => (
                                  <div key={idx} className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-rose-50 shadow-sm">
                                     <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 flex-shrink-0">
                                        <FiPackage className="w-5 h-5" />
                                     </div>
                                     <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                           <p className="text-sm font-black text-slate-800">{item.medicine?.medicineName}</p>
                                           <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                                             {item.quantity} {item.medicine?.dosageForm || 'Unit'}
                                           </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                           <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-black uppercase tracking-tighter">
                                              {item.dosage}
                                           </span>
                                           <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-black uppercase tracking-tighter">
                                              {item.frequency}
                                           </span>
                                           <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-black uppercase tracking-tighter">
                                              Selama {item.duration}
                                           </span>
                                        </div>
                                        {item.instructions && (
                                           <p className="mt-2 text-[10px] text-slate-400 font-bold italic leading-relaxed">
                                              Note: {item.instructions}
                                           </p>
                                        )}
                                     </div>
                                  </div>
                                ))}
                             </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Actions / Notes */}
                    {record.notes && (
                       <div className="mt-10 pt-8 border-t border-slate-50">
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2 italic">Clinical Notes:</p>
                          <p className="text-xs text-slate-400 font-bold leading-relaxed">"{record.notes}"</p>
                       </div>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-40 text-center bg-white rounded-[4rem] border-4 border-dashed border-slate-50">
                <FiClipboard className="w-20 h-20 text-slate-100 mx-auto mb-8" />
                <h4 className="text-2xl font-black text-slate-900 tracking-tight">Data Riwayat Kosong</h4>
                <p className="text-slate-400 font-bold mt-4 max-w-xs mx-auto uppercase text-[10px] tracking-widest leading-relaxed">
                  Pasien belum memiliki riwayat pemeriksaan atau konsultasi medis yang tersimpan di sistem.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
