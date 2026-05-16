'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiDatabase, FiDownload, FiUpload, FiHardDrive,
  FiAlertTriangle, FiCheckCircle, FiClock, FiFileText,
  FiInfo, FiChevronRight, FiSettings, FiShield, FiCpu, FiActivity,
  FiMonitor, FiVideo, FiTrash2, FiPlay, FiRefreshCw, FiVolume2, FiDollarSign
} from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? 'database' : 'setup')
  const [backups, setBackups] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [displayVideos, setDisplayVideos] = useState<any[]>([])
  const [videoVolume, setVideoVolume] = useState(50)
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [feeSettings, setFeeSettings] = useState({
    regular: '70000',
    holiday: '80000',
    control: '35000'
  })

  const [newTemplate, setNewTemplate] = useState({
    name: '',
    type: 'SOAP',
    content: {
      subjective: '',
      objective: '',
      diagnosis: '',
      treatmentPlan: ''
    }
  })

  useEffect(() => {
    if (isSuperAdmin) {
      fetchBackups()
    }
    fetchTemplates()
    fetchDisplaySettings()
    fetchFeeSettings()
  }, [isSuperAdmin])

  const fetchFeeSettings = async () => {
    try {
      const { data } = await api.get('settings')
      const regular = data.find((s: any) => s.key === 'fee_doctor_regular')?.value
      const holiday = data.find((s: any) => s.key === 'fee_doctor_holiday')?.value
      const control = data.find((s: any) => s.key === 'fee_doctor_control')?.value
      
      setFeeSettings({
        regular: regular?.toString() || '70000',
        holiday: holiday?.toString() || '80000',
        control: control?.toString() || '35000'
      })
    } catch (e) {
      console.error('Failed to fetch fee settings', e)
    }
  }

  const handleSaveFee = async (key: string, value: string, label: string) => {
    const tid = toast.loading(`Menyimpan ${label}...`)
    try {
      await api.post('settings', {
        key,
        value,
        description: `Biaya Jasa Konsultasi Dokter (${label})`
      })
      toast.success(`${label} berhasil diperbarui`, { id: tid })
      fetchFeeSettings()
    } catch (e) {
      toast.error(`Gagal memperbarui ${label}`, { id: tid })
    }
  }

  const fetchDisplaySettings = async () => {
    try {
      const { data } = await api.get('settings')
      const videoSetting = data.find((s: any) => s.key === 'display_videos')
      if (videoSetting) {
        setDisplayVideos(Array.isArray(videoSetting.value) ? videoSetting.value : [])
      }

      const volumeSetting = data.find((s: any) => s.key === 'monitor_video_volume')
      if (volumeSetting) {
        setVideoVolume(Number(volumeSetting.value))
      }
    } catch (e) {
      console.error('Failed to fetch display settings', e)
    }
  }

  const handleUpdateVolume = async (val: number) => {
    setVideoVolume(val)
    try {
      await api.post('settings', {
        key: 'monitor_video_volume',
        value: val,
        description: 'Volume Video Monitor (0-100)'
      })
    } catch (e) {
      toast.error('Gagal memperbarui volume')
    }
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
    if (displayVideos.length >= 5) {
      toast.error('Maksimal 5 video. Hapus salah satu terlebih dahulu.')
      return
    }

    const file = e.target.files[0]
    const formData = new FormData()
    formData.append('video', file)

    const tid = toast.loading('Mengunggah video...')
    try {
      await api.post('settings/display-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Video berhasil diunggah', { id: tid })
      fetchDisplaySettings()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengunggah video', { id: tid })
    }
  }

  const handleDeleteVideo = async (filename: string) => {
    const tid = toast.loading('Menghapus video...')
    try {
      await api.delete(`settings/display-video/${filename}`)
      toast.success('Video dihapus', { id: tid })
      fetchDisplaySettings()
    } catch (e) {
      toast.error('Gagal menghapus video', { id: tid })
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await api.get('clinical/templates')
      setTemplates(res.data)
    } catch (e) {
      console.error('Failed to fetch templates', e)
    }
  }

  const handleAddTemplate = async () => {
    setIsLoading(true)
    try {
      await api.post('clinical/templates', newTemplate)
      toast.success('Template berhasil ditambahkan')
      setNewTemplate({
        name: '',
        type: 'SOAP',
        content: { subjective: '', objective: '', diagnosis: '', treatmentPlan: '' }
      })
      fetchTemplates()
    } catch (e) {
      toast.error('Gagal menambahkan template')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBackups = async () => {
    try {
      const res = await api.get('backup/list')
      setBackups(res.data)
    } catch (error) {
      console.error('Failed to fetch backups', error)
    }
  }

  const handleDownloadBackup = async () => {
    setIsLoading(true)
    const toastId = toast.loading('Memproses backup database...')
    try {
      const response = await api.get('backup/download', {
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const fileName = `backup-${new Date().toISOString().split('T')[0]}.sql`
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      link.remove()

      toast.success('Backup berhasil diunduh', { id: toastId })
      fetchBackups()
    } catch (error) {
      toast.error('Gagal membuat backup', { id: toastId })
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.name.endsWith('.sql')) {
        setSelectedFile(file)
        setShowRestoreConfirm(true)
      } else {
        toast.error('Hanya file .sql yang diizinkan')
      }
    }
  }

  const handleRestore = async () => {
    if (!selectedFile) return

    setIsRestoring(true)
    setShowRestoreConfirm(false)
    const toastId = toast.loading('Sedang merestore database... Jangan tutup halaman ini.')

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      await api.post('backup/restore', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      toast.success('Database berhasil direstore!', { id: toastId, duration: 5000 })
      setSelectedFile(null)
    } catch (error) {
      toast.error('Gagal merestore database. Pastikan format file benar.', { id: toastId })
    } finally {
      setIsRestoring(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <Toaster position="top-right" />

      {/* Header Area */}
      <div className="max-w-full mx-auto px-6 lg:px-10 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <FiSettings className="w-8 h-8 text-primary" />
              </div>
              System <span className="text-primary">Settings</span>
            </h1>
            <p className="text-gray-500 font-medium mt-1">Konfigurasi sistem, backup data, dan manajemen infrastruktur.</p>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
            <span className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Environment:</span>
            <span className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-xs font-black uppercase tracking-widest border border-green-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Production Ready
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Sidebar Nav */}
          <aside className="xl:col-span-3 space-y-2">
            {[
              ...(isSuperAdmin ? [{ id: 'database', label: 'Database & Backup', icon: FiDatabase }] : []),
              { id: 'setup', label: 'Setup Templates', icon: FiActivity },
              { id: 'fees', label: 'Tarif & Biaya Dokter', icon: FiDollarSign },
              { id: 'monitor', label: 'Monitor Display', icon: FiMonitor },
              ...(isSuperAdmin ? [{ id: 'security', label: 'Security & Access', icon: FiShield }] : []),
              { id: 'system', label: 'System Info', icon: FiCpu },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-bold transition-all ${activeTab === tab.id
                    ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-[1.02]'
                    : 'bg-white text-gray-500 hover:bg-gray-100 border border-transparent shadow-sm'
                  }`}
              >
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-white' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            ))}

            <div className="mt-8 p-6 bg-gradient-to-br from-indigo-600 to-primary rounded-3xl text-white relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black uppercase tracking-widest opacity-70 mb-1">Status Sistem</p>
                <h3 className="text-lg font-bold mb-3">Semua Sistem Normal</h3>
                <div className="flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1.5 rounded-full backdrop-blur-md">
                  Terakhir Sinkron: Just now
                </div>
              </div>
              <FiActivity className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 group-hover:scale-110 transition-transform duration-700" />
            </div>
          </aside>

          {/* Content Area */}
          <main className="xl:col-span-9 space-y-8">
            <AnimatePresence mode="wait">
              {activeTab === 'database' && (
                <motion.div
                  key="database"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Backup Action Card */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50 flex flex-col justify-between">
                      <div>
                        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                          <FiDownload className="w-7 h-7" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Backup Database</h2>
                        <p className="text-gray-500 font-medium leading-relaxed">
                          Ekspor salinan lengkap basis data saat ini ke dalam format .sql untuk pengarsipan.
                        </p>
                      </div>
                      <button
                        onClick={handleDownloadBackup}
                        disabled={isLoading}
                        className="mt-8 group relative overflow-hidden px-8 py-4 bg-gray-900 text-white rounded-2xl font-black transition-all hover:shadow-2xl active:scale-95 disabled:opacity-50"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                          {isLoading ? 'Memproses...' : (
                            <>
                              Unduh Backup Sekarang <FiDownload />
                            </>
                          )}
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </div>

                    {/* Restore Action Card */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50 flex flex-col justify-between">
                      <div>
                        <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6">
                          <FiUpload className="w-7 h-7" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Restore Database</h2>
                        <p className="text-gray-500 font-medium leading-relaxed">
                          Pulihkan data dari file .sql. <span className="text-red-500 font-bold underline">Peringatan:</span> Tindakan ini akan menimpa data saat ini.
                        </p>
                      </div>
                      <label className="mt-8 cursor-pointer group relative overflow-hidden px-8 py-4 bg-white text-red-600 border-2 border-red-100 rounded-2xl font-black transition-all hover:bg-red-50 hover:border-red-200 active:scale-95 flex items-center justify-center gap-3">
                        <input type="file" className="hidden" accept=".sql" onChange={handleFileChange} disabled={isRestoring} />
                        {isRestoring ? 'Sedang Memulihkan...' : (
                          <>
                            Unggah & Pulihkan <FiUpload />
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* History Section */}
                  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden">
                    <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-black text-gray-900">Riwayat Backup</h3>
                        <p className="text-sm font-medium text-gray-400">Daftar file backup yang tersimpan di server.</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-black text-primary bg-primary/5 px-4 py-2 rounded-full border border-primary/10">
                        <FiClock /> {backups.length} Files Tersimpan
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50/50">
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">File Name</th>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Size</th>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Date Created</th>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {backups.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-8 py-12 text-center text-gray-400 font-medium">
                                Belum ada riwayat backup yang tersedia.
                              </td>
                            </tr>
                          ) : backups.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                              <td className="px-8 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                    <FiFileText className="w-5 h-5" />
                                  </div>
                                  <span className="text-sm font-bold text-gray-700">{item.filename}</span>
                                </div>
                              </td>
                              <td className="px-8 py-5">
                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{formatSize(item.size)}</span>
                              </td>
                              <td className="px-8 py-5">
                                <span className="text-xs font-medium text-gray-400 italic">
                                  {new Date(item.createdAt).toLocaleDateString('id-ID', {
                                    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                  })}
                                </span>
                              </td>
                              <td className="px-8 py-5 text-right">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-green-500 bg-green-50 px-2.5 py-1 rounded-lg border border-green-100">
                                  <FiCheckCircle className="w-3 h-3" /> Ready
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'setup' && (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-50">
                      <div>
                        <h2 className="text-2xl font-black text-gray-900">Clinical Template Manager</h2>
                        <p className="text-gray-400 font-medium text-sm">Kelola template SOAP awal untuk mempercepat pengisian rekam medis.</p>
                      </div>
                      <div className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                        Standarisasi Klinis
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                      <div className="lg:col-span-4 space-y-6">
                        <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Buat Template Baru</h3>
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Template</label>
                              <input
                                value={newTemplate.name}
                                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                                placeholder="Contoh: ISPA / Common Cold"
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:border-primary outline-none transition-all" />
                            </div>
                            <div className="space-y-1.5 pt-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Subjective (S)</label>
                              <textarea
                                value={newTemplate.content.subjective}
                                onChange={(e) => setNewTemplate({ ...newTemplate, content: { ...newTemplate.content, subjective: e.target.value } })}
                                placeholder="Keluhan awal..." className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-primary outline-none min-h-[80px]" />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Objective (O)</label>
                              <textarea
                                value={newTemplate.content.objective}
                                onChange={(e) => setNewTemplate({ ...newTemplate, content: { ...newTemplate.content, objective: e.target.value } })}
                                placeholder="Pemeriksaan..." className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-primary outline-none min-h-[80px]" />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assessment (A)</label>
                              <input
                                value={newTemplate.content.diagnosis}
                                onChange={(e) => setNewTemplate({ ...newTemplate, content: { ...newTemplate.content, diagnosis: e.target.value } })}
                                placeholder="Diagnosa..." className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-primary outline-none" />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Plan (P)</label>
                              <textarea
                                value={newTemplate.content.treatmentPlan}
                                onChange={(e) => setNewTemplate({ ...newTemplate, content: { ...newTemplate.content, treatmentPlan: e.target.value } })}
                                placeholder="Terapi..." className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-primary outline-none min-h-[80px]" />
                            </div>
                            <button
                              onClick={handleAddTemplate}
                              disabled={isLoading || !newTemplate.name}
                              className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-50">
                              SIMPAN TEMPLATE
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-8 space-y-4">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                          <FiActivity className="text-primary" /> Daftar Template Aktif
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {templates.map((t, i) => (
                            <div key={i} className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                              <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 group-hover:bg-indigo-50 transition-colors" />
                              <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                  <span className="text-[10px] font-black text-primary bg-primary/5 px-2.5 py-1 rounded-lg uppercase tracking-wider">{t.type}</span>
                                  <button className="text-slate-300 hover:text-red-500 transition-colors"><FiAlertTriangle /></button>
                                </div>
                                <h4 className="font-black text-gray-900 text-lg mb-1">{t.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest line-clamp-1 italic mb-4">
                                  {t.content.diagnosis || 'Diagnosis tidak diset'}
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
                                  <div className="p-2 bg-slate-50 rounded-lg text-slate-400">S: <span className="text-slate-600">{t.content.subjective ? 'Valid' : 'N/A'}</span></div>
                                  <div className="p-2 bg-slate-50 rounded-lg text-slate-400">O: <span className="text-slate-600">{t.content.objective ? 'Valid' : 'N/A'}</span></div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {templates.length === 0 && (
                            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-50 rounded-[2.5rem]">
                              <FiActivity className="w-12 h-12 mx-auto mb-4 text-slate-100" />
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Belum ada template terdaftar</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'security' && isSuperAdmin && (
                <motion.div
                  key="security"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white p-12 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50 text-center"
                >
                  <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
                    <FiShield className="w-10 h-10" />
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 mb-4">Security Policies</h2>
                  <p className="max-w-md mx-auto text-gray-500 font-medium leading-relaxed mb-8">
                    Halaman ini dikhususkan untuk konfigurasi keamanan tingkat lanjut dan kontrol akses API.
                  </p>
                  <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-center gap-3 text-sm font-bold text-gray-400 italic border border-gray-100 mb-8">
                    <FiInfo className="w-4 h-4 text-primary" /> Segera Hadir di Versi Berikutnya
                  </div>

                  <div className="max-w-md mx-auto p-8 rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                      <FiShield className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-700">Manajemen Hak Akses Modul sudah tersedia di halaman terpisah.</p>
                    <Link
                      href="/admin/settings/roles"
                      className="px-6 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                    >
                      Kelola Hak Akses Roles
                    </Link>
                  </div>
                </motion.div>
              )}

              {activeTab === 'system' && (
                <motion.div
                  key="system"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50">
                    <h2 className="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3">
                      <FiCpu className="text-primary" /> Server Architecture
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { label: 'OS Version', value: 'Ubuntu 22.04 LTS', sub: 'Linux Kernel 5.15' },
                        { label: 'Runtime', value: 'Node.js v20.10.x', sub: 'Express v4.18' },
                        { label: 'Database', value: 'PostgreSQL 17.4', sub: 'Managed via Prisma ORM' },
                      ].map((stat, i) => (
                        <div key={i} className="p-6 rounded-3xl bg-gray-50 border border-gray-100 group hover:bg-white hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10 transition-all">
                          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                          <p className="text-lg font-black text-gray-900">{stat.value}</p>
                          <p className="text-xs font-bold text-gray-400 mt-1">{stat.sub}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 pt-8 border-t border-gray-50 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="flex gap-4">
                        <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex-shrink-0 flex items-center justify-center">
                          <FiHardDrive className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900">Disk Usage</p>
                          <div className="w-48 h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-primary w-1/4 rounded-full" />
                          </div>
                          <p className="text-xs font-bold text-gray-400 mt-2">24.5 GB of 100 GB used</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-12 h-12 bg-primary text-white rounded-2xl flex-shrink-0 flex items-center justify-center">
                          <FiActivity className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900">Health Check</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-green-500 font-black text-sm uppercase tracking-widest">Stable</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(j => <div key={j} className="w-1 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: `${j * 0.2}s` }} />)}
                            </div>
                          </div>
                          <p className="text-xs font-bold text-gray-400 mt-1">Uptime: 14 days, 6 hours</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'monitor' && (
                <motion.div
                  key="monitor"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-10 pb-6 border-b border-gray-50">
                      <div>
                        <h2 className="text-2xl font-black text-gray-900">Monitor Display Settings</h2>
                        <p className="text-gray-400 font-medium text-sm">Kelola video latar belakang dan visualisasi monitor ruang tunggu.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={fetchDisplaySettings}
                          className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:text-primary transition-all">
                          <FiRefreshCw />
                        </button>
                        <label className="cursor-pointer bg-primary text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all flex items-center gap-2">
                          <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                          <FiVideo /> Unggah Video Baru
                        </label>
                      </div>
                    </div>

                    {/* Volume Control Section */}
                    <div className="mb-12 p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] flex flex-col md:flex-row md:items-center gap-8 shadow-sm">
                      <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-primary shadow-sm flex-shrink-0">
                        <FiVolume2 className="w-8 h-8" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-black text-slate-800 uppercase tracking-tight">Volume Video Monitor</h3>
                          <span className="font-black text-primary bg-primary/10 px-3 py-1 rounded-lg text-sm">{videoVolume}%</span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium">Batur tingkat suara video promosi agar tidak mengganggu panggillan suara.</p>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={videoVolume}
                          onChange={(e) => handleUpdateVolume(parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary mt-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayVideos.map((video, idx) => (
                        <div key={video.id} className="bg-slate-50 rounded-[2rem] border border-slate-100 overflow-hidden group shadow-sm transition-all hover:shadow-xl">
                          <div className="aspect-video bg-black relative flex items-center justify-center">
                            <video
                              src={process.env.NEXT_PUBLIC_API_URL + video.url}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
                                <FiPlay className="text-white fill-white w-4 h-4 ml-1" />
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteVideo(video.id)}
                              className="absolute top-4 right-4 w-10 h-10 bg-red-500 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg">
                              <FiTrash2 />
                            </button>
                          </div>
                          <div className="p-6">
                            <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate mb-1">{video.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-widest">
                              <FiClock className="w-3 h-3" /> {new Date(video.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}

                      {displayVideos.length < 5 && Array.from({ length: 5 - displayVideos.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="border-2 border-dashed border-slate-100 rounded-[2rem] aspect-[16/11] flex flex-col items-center justify-center text-slate-200">
                          <FiVideo className="w-8 h-8 mb-2" />
                          <p className="text-[10px] font-black uppercase tracking-widest">Slot Video {displayVideos.length + i + 1}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-12 p-8 bg-amber-50 rounded-3xl border border-amber-100 flex gap-6 italic">
                      <div className="w-12 h-12 bg-amber-200 text-amber-700 rounded-2xl flex-shrink-0 flex items-center justify-center">
                        <FiInfo className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-medium text-amber-800/80 leading-relaxed">
                        <strong>Tips Profesional:</strong> Gunakan video dengan aspek rasio 16:9 dan resolusi Full HD (1080p) untuk hasil terbaik di layar TV. Video akan diputar secara berurutan dan otomatis mengulang dari awal.
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
               {activeTab === 'fees' && (
                <motion.div
                  key="fees"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-10 pb-6 border-b border-gray-50">
                      <div>
                        <h2 className="text-2xl font-black text-gray-900">Doctor Fee Configuration</h2>
                        <p className="text-gray-400 font-medium text-sm">Kelola tarif jasa pemeriksaan dokter yang akan masuk ke tagihan dan komisi.</p>
                      </div>
                      <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                        <FiDollarSign className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {/* Regular Fee */}
                      <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between group hover:border-primary/30 transition-all">
                        <div className="mb-6">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Hari Biasa</p>
                          <h3 className="text-lg font-black text-slate-900 leading-tight">Tarif Konsultasi Reguler</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">Rp</span>
                            <input 
                              type="number"
                              value={feeSettings.regular}
                              onChange={(e) => setFeeSettings({...feeSettings, regular: e.target.value})}
                              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-black text-lg focus:border-primary outline-none transition-all"
                            />
                          </div>
                          <button 
                            onClick={() => handleSaveFee('fee_doctor_regular', feeSettings.regular, 'Tarif Reguler')}
                            className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-lg shadow-slate-900/10"
                          >
                            Simpan Tarif
                          </button>
                        </div>
                      </div>

                      {/* Holiday Fee */}
                      <div className="p-8 bg-rose-50/30 rounded-[2.5rem] border border-rose-100 flex flex-col justify-between group hover:border-rose-300 transition-all">
                        <div className="mb-6">
                          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Minggu & Tgl Merah</p>
                          <h3 className="text-lg font-black text-slate-900 leading-tight">Tarif Hari Libur</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-rose-300">Rp</span>
                            <input 
                              type="number"
                              value={feeSettings.holiday}
                              onChange={(e) => setFeeSettings({...feeSettings, holiday: e.target.value})}
                              className="w-full pl-12 pr-4 py-4 bg-white border border-rose-200 rounded-2xl font-black text-lg focus:border-rose-400 outline-none transition-all text-rose-600"
                            />
                          </div>
                          <button 
                            onClick={() => handleSaveFee('fee_doctor_holiday', feeSettings.holiday, 'Tarif Libur')}
                            className="w-full py-3 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                          >
                            Simpan Tarif
                          </button>
                        </div>
                      </div>

                      {/* Control Fee */}
                      <div className="p-8 bg-indigo-50/30 rounded-[2.5rem] border border-indigo-100 flex flex-col justify-between group hover:border-indigo-300 transition-all">
                        <div className="mb-6">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Pasien Kontrol</p>
                          <h3 className="text-lg font-black text-slate-900 leading-tight">Tarif Khusus Kontrol</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-indigo-300">Rp</span>
                            <input 
                              type="number"
                              value={feeSettings.control}
                              onChange={(e) => setFeeSettings({...feeSettings, control: e.target.value})}
                              className="w-full pl-12 pr-4 py-4 bg-white border border-indigo-200 rounded-2xl font-black text-lg focus:border-indigo-400 outline-none transition-all text-indigo-600"
                            />
                          </div>
                          <button 
                            onClick={() => handleSaveFee('fee_doctor_control', feeSettings.control, 'Tarif Kontrol')}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                          >
                            Simpan Tarif
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 p-8 bg-blue-50 rounded-3xl border border-blue-100 flex gap-6 italic items-center">
                      <div className="w-12 h-12 bg-blue-200 text-blue-700 rounded-2xl flex-shrink-0 flex items-center justify-center">
                        <FiInfo className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-medium text-blue-800/80 leading-relaxed">
                        <strong>Catatan Keuangan:</strong> Perubahan tarif ini akan langsung berdampak pada Invoice yang dicetak dan Laporan Komisi Dokter untuk transaksi yang dilakukan <strong>setelah</strong> perubahan disimpan.
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      <AnimatePresence>
        {showRestoreConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isRestoring && setShowRestoreConfirm(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-10 text-center">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                  <FiAlertTriangle className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-3">Peringatan Kritis!</h3>
                <p className="text-gray-500 font-medium leading-relaxed mb-6">
                  Anda akan merestore database menggunakan file <span className="font-black text-gray-900">"{selectedFile?.name}"</span>.
                  Semua data saat ini di server akan <span className="text-red-600 font-black underline">dihapus seluruhnya</span> dan diganti dengan isi file tersebut.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => !isRestoring && setShowRestoreConfirm(false)}
                    disabled={isRestoring}
                    className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Batalkan
                  </button>
                  <button
                    onClick={handleRestore}
                    disabled={isRestoring}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-200 hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Ya, Restore Sekarang
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
