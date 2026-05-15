'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { motion } from 'framer-motion'
import { FiSearch, FiBookOpen, FiChevronLeft, FiChevronRight, FiRefreshCw, FiInfo, FiX, FiCheckCircle } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { AnimatePresence } from 'framer-motion'

export default function Icd10MasterPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false)
  const [activeInfoTab, setActiveInfoTab] = useState('syarat')
  const [lastSync, setLastSync] = useState('15 Mei 2026, 10:30')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchData = async (currentSearch: string, currentPage: number) => {
    setLoading(true)
    try {
      const res = await api.get('master/icd10', {
        params: { search: currentSearch, page: currentPage, limit }
      })
      setData(res.data.data || [])
      setTotalPages(res.data.meta.totalPages || 1)
      setTotal(res.data.meta.total || 0)
    } catch (e) {
      console.error('Failed to fetch ICD-10 data', e)
    } finally {
      setLoading(false)
    }
  }

  // Effect to handle both search and pagination changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchData(search, page)
    }, search ? 500 : 0) // Only debounce when there is a search query

    return () => clearTimeout(delayDebounceFn)
  }, [search, page])

  // Reset to page 1 ONLY when search string changes
  useEffect(() => {
    setPage(1)
  }, [search])

  return (
    <div className="p-6 md:p-10 space-y-8 bg-gray-50/50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3"
          >
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-sm shadow-primary/5">
              <FiBookOpen className="w-6 h-6" />
            </div>
            Master ICD-10
          </motion.h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-3 ml-15">Internasional Classification of Diseases</p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="text-right hidden md:block mr-2">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">SatuSehat Compliance</p>
            <p className="text-[10px] font-bold text-emerald-500">Last Sync: {lastSync}</p>
          </div>

          <button 
            disabled
            className="px-6 py-4 bg-gray-100 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center justify-center gap-2"
          >
            <FiRefreshCw className="w-4 h-4" /> Sinkronkan SatuSehat
          </button>
          <button 
            onClick={() => setIsInfoModalOpen(true)}
            className="p-4 bg-white border border-gray-200 text-primary rounded-2xl hover:bg-primary/5 transition-all shadow-sm"
          >
            <FiInfo className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Stats & Search Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm h-full flex flex-col justify-center"
        >
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Database Penyakit</p>
          <p className="text-3xl font-black text-gray-900">{total.toLocaleString()} <span className="text-sm text-gray-300 font-bold ml-1">KODE</span></p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-2 relative group h-full"
        >
          <FiSearch className="absolute left-8 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors w-6 h-6" />
          <input 
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ketik kode atau nama penyakit untuk mencari..."
            className="w-full h-full pl-20 pr-8 py-8 bg-white border border-gray-100 rounded-[2.5rem] text-sm font-black focus:border-primary outline-none shadow-sm group-focus-within:ring-8 group-focus-within:ring-primary/5 transition-all"
          />
        </motion.div>
      </div>

      {/* Table Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[3rem] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="px-10 py-8 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-40">Kode ICD</th>
                <th className="px-10 py-8 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Penyakit (Indonesia)</th>
                <th className="px-10 py-8 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Clinical Name (English)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-10 py-7"><div className="h-6 bg-gray-100 rounded-xl w-20" /></td>
                    <td className="px-10 py-7"><div className="h-6 bg-gray-100 rounded-xl w-64" /></td>
                    <td className="px-10 py-7"><div className="h-6 bg-gray-100 rounded-xl w-48" /></td>
                  </tr>
                ))
              ) : data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-10 py-7">
                    <span className="text-[11px] font-black bg-primary/5 text-primary px-4 py-1.5 rounded-xl border border-primary/10 group-hover:bg-primary group-hover:text-white transition-all">
                      {item.code}
                    </span>
                  </td>
                  <td className="px-10 py-7">
                    <p className="text-sm font-bold text-gray-700 uppercase tracking-tight">{item.nameId || '-'}</p>
                  </td>
                  <td className="px-10 py-7">
                    <p className="text-xs font-semibold text-gray-400 italic">{item.nameEn || '-'}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && data.length === 0 && (
          <div className="py-32 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <FiSearch className="w-8 h-8 text-gray-200" />
            </div>
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Data tidak ditemukan dalam database</p>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="px-10 py-8 bg-gray-50/50 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
             <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Halaman <span className="text-primary">{page}</span> dari <span className="text-gray-900">{totalPages}</span>
                </p>
             </div>
             <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest hidden md:block">
                Menampilkan {(page-1)*limit + 1} - {Math.min(page*limit, total)} dari {total} data
             </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm group"
              title="Halaman Sebelumnya"
            >
              <FiChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="flex gap-1">
               {/* Small pagination indicator for UX */}
               {Array.from({ length: Math.min(3, totalPages) }).map((_, i) => {
                  const p = page > 2 ? page - 1 + i : i + 1;
                  if (p > totalPages) return null;
                  return (
                    <button 
                      key={p} 
                      onClick={() => setPage(p)}
                      className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${page === p ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-gray-400 hover:bg-gray-100'}`}
                    >
                      {p}
                    </button>
                  )
               })}
            </div>
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm group"
              title="Halaman Berikutnya"
            >
              <FiChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* SatuSehat Info Modal */}
      <AnimatePresence>
        {isInfoModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="px-10 py-8 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <FiInfo className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">Syarat Sinkronisasi SatuSehat</h3>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Integrasi Data Kesehatan Nasional (Kemenkes RI)</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsInfoModalOpen(false)}
                  className="p-3 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                >
                  <FiX className="w-6 h-6" />
                </button>
              </div>

              <div className="p-10 space-y-8">
                {/* Tabs Navigation */}
                <div className="flex gap-2 p-1.5 bg-gray-100 rounded-2xl">
                  {[
                    { id: 'syarat', label: 'Syarat' },
                    { id: 'manfaat', label: 'Manfaat' },
                    { id: 'proses', label: 'Langkah Sync' }
                  ].map(tab => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveInfoTab(tab.id)}
                      className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeInfoTab === tab.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-[300px]">
                  {activeInfoTab === 'syarat' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <p className="text-sm font-bold text-gray-600 leading-relaxed mb-6">
                        Persyaratan administratif untuk integrasi DTO Kemkes:
                      </p>
                      {[
                        { title: "Registrasi Fasyankes", desc: "Klinik wajib terdaftar di portal DTO Kemkes." },
                        { title: "Organization ID", desc: "Mendapatkan ID unik Organisasi dari SatuSehat." },
                        { title: "Kredensial API", desc: "Memiliki Client ID dan Client Secret resmi." },
                        { title: "Sertifikasi Sistem", desc: "SIMRS harus lulus uji verifikasi SatuSehat." }
                      ].map((item, i) => (
                        <div key={i} className="flex gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                          <FiCheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-black text-gray-900 uppercase tracking-tight mb-1">{item.title}</p>
                            <p className="text-[11px] font-bold text-gray-500 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {activeInfoTab === 'manfaat' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                       <div className="p-8 bg-blue-50 rounded-[2.5rem] border border-blue-100">
                          <p className="text-sm font-black text-blue-900 uppercase mb-4 tracking-tight">Argumentasi Strategis & Legalitas</p>
                          <div className="space-y-5">
                             {[
                               { 
                                 title: "Kepatuhan Regulasi Nasional", 
                                 desc: "Berdasarkan PMK No. 24 Tahun 2022, seluruh Fasyankes wajib menyelenggarakan Rekam Medis Elektronik (RME) yang terintegrasi dengan platform SatuSehat Kemenkes RI." 
                               },
                               { 
                                 title: "Interoperabilitas Data (Continuity of Care)", 
                                 desc: "Data diagnosa yang tersinkronisasi memungkinkan riwayat medis pasien dapat diakses oleh fasyankes lain saat proses rujukan, mencegah pengulangan tes yang tidak perlu." 
                               },
                               { 
                                 title: "Akurasi Klaim & Efisiensi Finansial", 
                                 desc: "Penggunaan terminologi ICD-10 yang terstandarisasi adalah prasyarat mutlak untuk validasi klaim asuransi dan BPJS (INA-CBGs), meminimalkan risiko penolakan klaim akibat kesalahan kode." 
                               },
                               { 
                                 title: "Surveilans Kesehatan Real-Time", 
                                 desc: "Membantu Pemerintah dalam pemantauan tren penyakit dan deteksi dini wabah secara nasional melalui kontribusi data klinis yang akurat dan tepat waktu." 
                               }
                             ].map((item, i) => (
                               <div key={i} className="flex gap-4">
                                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                                  <div>
                                     <p className="text-xs font-black text-blue-800 uppercase tracking-tight mb-1">{item.title}</p>
                                     <p className="text-[11px] font-bold text-blue-600 leading-relaxed">{item.desc}</p>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>
                    </motion.div>
                  )}

                  {activeInfoTab === 'proses' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                       <p className="text-xs font-bold text-gray-500 leading-relaxed px-2">Alur kerja sinkronisasi data secara otomatis:</p>
                       <div className="grid grid-cols-1 gap-4">
                          {[
                            { 
                              step: "Terminology Synchronization", 
                              desc: "Sistem melakukan penarikan otomatis (fetch) katalog terminologi ICD-10, ICD-9-CM, dan LOINC terbaru dari server SatuSehat untuk memastikan referensi medis selalu up-to-date." 
                            },
                            { 
                              step: "Data Mapping & Validation", 
                              desc: "Setiap diagnosa yang diinput dokter akan divalidasi dan dipetakan ke dalam format standar HL7 FHIR (Fast Healthcare Interoperability Resources) sebelum dikirim." 
                            },
                            { 
                              step: "Clinical Resource Submission", 
                              desc: "Data pertemuan (Encounter) dan diagnosa (Condition) dikirimkan secara secure melalui jalur enkripsi ke sistem cloud SatuSehat untuk dicatat dalam rekam medis nasional pasien." 
                            }
                          ].map((item, i) => (
                            <div key={i} className="relative pl-14 pb-4">
                               <div className="absolute left-0 top-0 w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-xs font-black shadow-sm">{i+1}</div>
                               {i < 2 && <div className="absolute left-5 top-10 w-[2px] h-10 bg-emerald-50" />}
                               <p className="text-xs font-black text-gray-900 uppercase tracking-tight mb-1">{item.step}</p>
                               <p className="text-[11px] font-bold text-gray-500 leading-relaxed">{item.desc}</p>
                            </div>
                          ))}
                       </div>
                    </motion.div>
                  )}
                </div>

                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                   <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Status Saat Ini</p>
                   <p className="text-[11px] font-bold text-amber-600 leading-relaxed">
                      Sistem siap dihubungkan. Sila hubungi Administrator Klinik untuk memasukkan kredensial API SatuSehat Anda.
                   </p>
                </div>

                <button 
                  onClick={() => setIsInfoModalOpen(false)}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/20"
                >
                  Tutup Informasi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
