'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { toast } from 'react-hot-toast'
import { FiUpload, FiFileText, FiCheckCircle, FiAlertCircle, FiChevronLeft, FiLoader, FiUserPlus, FiRefreshCw } from 'react-icons/fi'
import { motion, AnimatePresence } from 'framer-motion'

export default function ImportPatientsPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error('Silakan pilih file Excel terlebih dahulu')
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post('/master/patients/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(res.data)
      toast.success('Proses import selesai!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal mengupload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Import Data Pasien</h1>
          <p className="text-slate-500 text-sm">Upload file Excel (.xlsx, .xls) untuk migrasi data massal</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Upload Area */}
        <div className="md:col-span-2 space-y-6">
          <div className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all ${file ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/50'}`}>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            
            <div className="flex flex-col items-center">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${file ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                {file ? <FiFileText className="w-10 h-10" /> : <FiUpload className="w-10 h-10" />}
              </div>
              
              {file ? (
                <div className="space-y-1">
                  <p className="text-lg font-bold text-slate-900">{file.name}</p>
                  <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-lg font-bold text-slate-900">Klik atau seret file ke sini</p>
                  <p className="text-sm text-slate-500">Format yang didukung: .xlsx, .xls</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex-1 bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center gap-3"
            >
              {uploading ? (
                <>
                  <FiLoader className="w-5 h-5 animate-spin" />
                  Memproses Data...
                </>
              ) : (
                <>
                  <FiCheckCircle className="w-5 h-5" />
                  Mulai Import Data
                </>
              )}
            </button>
            {file && !uploading && (
              <button 
                onClick={() => setFile(null)}
                className="px-6 py-4 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
            )}
          </div>

          {/* Guidelines */}
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FiAlertCircle className="text-amber-500" />
              Petunjuk Format Excel:
            </h3>
            <ul className="text-sm text-slate-600 space-y-3">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                Sistem akan memproses **semua Worksheet** yang ada di dalam file Excel.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                Pastikan ada kolom: **NAMA PASIEN**, **JENIS KELAMIN** (L/P), dan **USIA**.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                Kolom opsional: **NO REGISTRASI** (Lama), **No Telp**, **Nama KK**, **ALAMAT**.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                Jika data sudah ada (berdasarkan No Registrasi Lama atau Nama), sistem akan melakukan **Update**.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Result Summary */}
        <AnimatePresence>
          {result && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
                
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 animate-bounce">
                    <FiCheckCircle className="w-10 h-10" />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase text-lg tracking-tight">Import Selesai!</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Data Berhasil Disinkronisasi</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl group hover:bg-emerald-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-emerald-500 shadow-sm">
                        <FiUserPlus className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Pasien Baru</span>
                    </div>
                    <span className="text-xl font-black text-emerald-600">{result.summary.totalImported}</span>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 bg-blue-50/50 border border-blue-100 rounded-2xl group hover:bg-blue-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-blue-500 shadow-sm">
                        <FiRefreshCw className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Data Diupdate</span>
                    </div>
                    <span className="text-xl font-black text-blue-600">{result.summary.totalUpdated}</span>
                  </div>

                  <div className="flex justify-between items-center p-4 bg-rose-50/50 border border-rose-100 rounded-2xl group hover:bg-rose-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-rose-500 shadow-sm">
                        <FiAlertCircle className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Error / Gagal</span>
                    </div>
                    <span className="text-xl font-black text-rose-600">{result.summary.totalErrors}</span>
                  </div>
                </div>

                {result.errors && result.errors.length > 0 && (
                  <div className="mt-8">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Detail Error (Max 10)</p>
                    <div className="space-y-2">
                      {result.errors.map((err: string, i: number) => (
                        <p key={i} className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100 italic">
                          {err}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => router.push('/admin/master/patients')}
                  className="w-full mt-8 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors"
                >
                  Lihat Daftar Pasien
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
