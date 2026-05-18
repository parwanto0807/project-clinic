'use client'

import { useAuthStore } from '@/lib/store/useAuthStore'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { 
  FiUser, FiMail, FiPhone, FiBriefcase, FiCalendar, 
  FiLock, FiShield, FiMapPin, FiClock, FiCheckCircle,
  FiEye, FiEyeOff, FiSave, FiAlertCircle, FiCamera, FiRefreshCw, FiArrowLeft
} from 'react-icons/fi'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import api from '@/lib/api'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const MODULE_LABELS: Record<string, string> = {
  REGISTRATION_QUEUE: 'Pendaftaran & Antrian',
  MEDICAL_SERVICES: 'Pelayanan Medis',
  PHARMACY: 'Farmasi & Apotek',
  LABORATORY: 'Laboratorium Penunjang',
  BILLING_PAYMENT: 'Billing & Pembayaran Kasir',
  ACCOUNTING_REPORTS: 'Laporan Keuangan',
  ACCOUNTING_CONFIG: 'Konfigurasi Akuntansi',
  STOCK_INVENTORY: 'Stok & Inventaris Obat',
  PROCUREMENT_LOGISTICS: 'Pengadaan & Logistik',
  ASSET_MANAGEMENT: 'Manajemen Aset',
  DEPARTMENT_STAFF: 'Departemen & Staffing',
  SYSTEM_ROLES: 'Hak Akses & Sistem Security',
  WEBSITE_MANAGEMENT: 'Manajemen Landing Page Website'
}

const ROLE_COLORS: Record<string, { bg: string; desc: string }> = {
  SUPER_ADMIN: { bg: 'bg-amber-50 text-amber-700 border-amber-200', desc: 'Pemilik Akses Sistem Penuh' },
  ADMIN: { bg: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'Administrator Operasional' },
  DOCTOR: { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', desc: 'Dokter & Profesional Medis' },
  FARMASI: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'Staff Farmasi & Apoteker' },
  ACCOUNTING: { bg: 'bg-violet-50 text-violet-700 border-violet-200', desc: 'Staff Keuangan & Akunting' },
  LOGISTIC: { bg: 'bg-teal-50 text-teal-700 border-teal-200', desc: 'Staff Logistik & Pengadaan' },
  STAFF: { bg: 'bg-gray-50 text-gray-700 border-gray-200', desc: 'Staff Operasional Medis' },
}

export default function DoctorProfilePage() {
  const router = useRouter()
  const { user, activeClinicId, setAuth } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info')
  const [time, setTime] = useState<string>('')
  const [date, setDate] = useState<string>('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limit file size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file foto maksimal 5MB!')
      return
    }

    // Limit type to image
    if (!file.type.startsWith('image/')) {
      toast.error('Hanya file gambar yang diperbolehkan!')
      return
    }

    try {
      setUploadingAvatar(true)
      const formData = new FormData()
      formData.append('avatar', file)

      const res = await api.post('auth/update-avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      // Update Zustand Auth store
      setAuth(res.data.user, activeClinicId || undefined)
      toast.success('Foto profil berhasil diperbarui!')
    } catch (error: any) {
      console.error(error)
      const msg = error.response?.data?.message || 'Gagal mengunggah foto profil'
      toast.error(msg)
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorOldPassword, setErrorOldPassword] = useState('')

  // Password Visibility States
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(format(now, 'HH:mm:ss'))
      setDate(format(now, 'EEEE, dd MMMM yyyy', { locale: idLocale }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Sync tab with URL search parameter robustly
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab === 'security') {
        setActiveTab('security')
      } else {
        setActiveTab('info')
      }
    }
  }, [])

  const handleTabChange = (tab: 'info' | 'security') => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      window.history.pushState({}, '', url.toString())
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Harap isi semua kolom password.')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password baru minimal harus terdiri dari 6 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Konfirmasi password baru tidak cocok.')
      return
    }

    try {
      setLoading(true)
      setErrorOldPassword('')
      await api.post('auth/change-password', { currentPassword, newPassword })
      toast.success('Password Anda berhasil diperbarui!')
      
      // Reset Form State
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Gagal mengganti password.'
      toast.error(msg)
      if (msg.toLowerCase().includes('saat ini yang anda masukkan salah') || msg.toLowerCase().includes('saat ini')) {
        setErrorOldPassword(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const roleConfig = ROLE_COLORS[user?.role ?? 'DOCTOR'] ?? ROLE_COLORS.DOCTOR
  const currentClinic = user?.clinics?.find(c => c.id === activeClinicId) || user?.clinics?.[0]

  // Form password validation checklist
  const isMinLength = newPassword.length >= 6
  const isMatch = newPassword && newPassword === confirmPassword

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 px-4 sm:px-6">
      <Toaster position="top-right" reverseOrder={false} />

      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-primary font-bold hover:text-primary/80 transition-colors"
      >
        <FiArrowLeft className="w-5 h-5" />
        Kembali
      </button>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-2xl text-indigo-650">
              <FiUser className="w-6 h-6" />
            </div>
            PROFIL DOKTER
          </h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
            Informasi akun dan spesialisasi medis Anda
          </p>
        </div>

        {/* Real-time Clock Card */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-5 py-3.5 flex items-center gap-4 self-start md:self-auto">
          <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center">
            <FiClock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <p className="text-lg font-black text-gray-900 leading-none tabular-nums">{time || '--:--:--'}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{date || 'Memuat Waktu...'}</p>
          </div>
        </div>
      </div>

      {/* Tabs Controller */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-px">
        <button
          onClick={() => handleTabChange('info')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'info'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <FiUser className="w-4 h-4" />
          Informasi Akun
        </button>
        <button
          onClick={() => handleTabChange('security')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'security'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <FiLock className="w-4 h-4" />
          Ganti Password
        </button>
      </div>

      {/* Active Tab Panel Rendering */}
      <AnimatePresence mode="wait">
        {activeTab === 'info' ? (
          <motion.div
            key="info"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left Column: Avatar & Quick Info */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-center text-center relative overflow-hidden h-fit">
              {/* Decorative Gradient Background Blur */}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

              {/* Premium Avatar Container */}
              <div className="relative group">
                <div 
                  className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl shadow-primary/10 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer relative"
                  onClick={() => !uploadingAvatar && document.getElementById('avatar-upload-input')?.click()}
                >
                  {uploadingAvatar ? (
                    <div className="w-full h-full bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                      <FiRefreshCw className="w-6 h-6 animate-spin mb-1 text-primary" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Uploading...</span>
                    </div>
                  ) : user?.image ? (
                    <img 
                      src={user.image.startsWith('http') ? user.image : `${api.defaults.baseURL?.replace('/api/', '') || ''}${user.image}`} 
                      alt={user.name} 
                      className="w-full h-full object-cover transition-all group-hover:brightness-75"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-primary flex items-center justify-center text-white font-black text-4xl transition-all group-hover:brightness-75">
                      {user?.name?.[0]?.toUpperCase() || 'D'}
                    </div>
                  )}
                  
                  {/* Camera hover overlay */}
                  {!uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 select-none">
                      <FiCamera className="w-5 h-5" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Ganti Foto</span>
                    </div>
                  )}
                </div>

                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 rounded-full border-4 border-white flex items-center justify-center shadow-lg" title="Status Online">
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                </div>
                
                {/* Hidden File Input */}
                <input 
                  type="file" 
                  id="avatar-upload-input" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleAvatarChange} 
                />
              </div>

              <h2 className="text-xl font-black text-gray-900 mt-5 leading-tight">{user?.name || 'Dokter Yasfina'}</h2>
              <p className="text-xs font-bold text-gray-400 mt-1">@{user?.username || 'username'}</p>
              
              <div className={`mt-4 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${roleConfig.bg}`}>
                {user?.role?.replace('_', ' ') || 'DOCTOR'}
              </div>
              <p className="text-[10px] font-bold text-gray-400 mt-2 italic">{roleConfig.desc}</p>

              <hr className="w-full my-6 border-gray-50" />

              {/* Mini Info List */}
              <div className="w-full space-y-3.5 text-left">
                <div className="flex items-center gap-3">
                  <FiMail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Email Terdaftar</p>
                    <p className="text-xs font-bold text-gray-700 truncate">{user?.email || '-'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <FiShield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Tipe Keamanan</p>
                    <p className="text-xs font-bold text-gray-700">Role-Based Access Control</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <FiCalendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">ID Akun</p>
                    <p className="text-[10px] font-mono font-bold text-gray-500 truncate">{user?.id || '-'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Columns: Bento Cards */}
            <div className="lg:col-span-2 space-y-6">

              {/* Bento Card 1: Informasi Klinik & Cabang */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FiMapPin className="text-rose-500 w-4 h-4" />
                  KLINIK AKTIF SEKARANG
                </h3>

                {currentClinic ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h4 className="text-base font-black text-gray-800 uppercase tracking-tight">{currentClinic.name}</h4>
                        {currentClinic.isMain && (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded text-[9px] font-black uppercase tracking-wider">
                            Pusat
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-500">{currentClinic.address || 'Alamat Belum Diatur'}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kode Cabang: {currentClinic.code}</p>
                    </div>

                    <div className="flex flex-col text-left sm:text-right gap-1 shrink-0">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Telepon Cabang</p>
                      <p className="text-xs font-bold text-gray-700">{currentClinic.phone || '-'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs font-bold text-gray-400 italic">
                    Belum ada klinik aktif terdeteksi.
                  </div>
                )}

                {/* List of Other Assigned Clinics */}
                {user?.clinics && user.clinics.length > 1 && (
                  <div className="mt-4 space-y-2.5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Daftar Cabang yang Dapat Anda Akses:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {user.clinics.filter(c => c.id !== activeClinicId).map((clinic) => (
                        <div key={clinic.id} className="p-3 bg-white border border-gray-100 rounded-xl flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700">{clinic.name}</span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{clinic.code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bento Card 2: Hak Akses & Modul Sistem */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FiShield className="text-amber-500 w-4 h-4" />
                  HAK AKSES & MODUL AKTIF
                </h3>

                <div className="space-y-4">
                  <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl">
                    <p className="text-xs font-medium text-blue-700 leading-relaxed">
                      Berikut adalah modul-modul sistem pelayanan medis yang aktif dan dapat Anda akses berdasarkan role Dokter Anda saat ini:
                    </p>
                  </div>

                  {user?.permissions && user.permissions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {user.permissions.map((moduleId) => {
                        const moduleLabel = MODULE_LABELS[moduleId] ?? moduleId
                        return (
                          <div 
                            key={moduleId}
                            className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl hover:bg-primary/5 hover:border-primary/20 hover:text-primary transition-all group"
                          >
                            <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500 group-hover:text-primary" />
                            <div className="text-left">
                              <p className="text-xs font-bold text-gray-800 group-hover:text-primary leading-none">{moduleLabel}</p>
                              <span className="text-[8px] font-mono text-gray-400 leading-none mt-0.5 block">{moduleId}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl">
                        <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <div className="text-left">
                          <p className="text-xs font-bold text-gray-800 leading-none">Pelayanan Medis (Rx & Consultation)</p>
                          <span className="text-[8px] font-mono text-gray-400 leading-none mt-0.5 block">MEDICAL_SERVICES</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bento Card 3: Keamanan Sesi & Informasi Tambahan */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FiLock className="text-indigo-500 w-4 h-4" />
                  KEAMANAN SESI & SISTEM
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Status Otentikasi</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <p className="text-xs font-bold text-gray-800">Aktif & Terverifikasi Cookie</p>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Masa Berlaku Token</p>
                    <p className="text-xs font-bold text-gray-800 mt-1">Otomatis Diperbarui (Session Guard Active)</p>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        ) : (
          /* Ganti Password Tab Panel */
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Security Sidebar Info */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden h-fit">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
                <FiLock className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Keamanan Akun Anda</h3>
              <p className="text-xs font-medium text-gray-400 mt-1 leading-relaxed">
                Menjaga keamanan password Anda secara berkala sangat disarankan untuk melindungi integritas rekam medis klinik dan data pasien dari akses yang tidak sah.
              </p>

              <hr className="w-full my-5 border-gray-50" />

              <div className="space-y-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Persyaratan Password Baru:</p>
                
                <div className="flex items-center gap-2">
                  <FiCheckCircle className={`w-4 h-4 shrink-0 transition-colors ${isMinLength ? 'text-emerald-500' : 'text-gray-300'}`} />
                  <span className={`text-[11px] font-semibold ${isMinLength ? 'text-gray-800' : 'text-gray-400'}`}>Minimal 6 karakter</span>
                </div>

                <div className="flex items-center gap-2">
                  <FiCheckCircle className={`w-4 h-4 shrink-0 transition-colors ${isMatch ? 'text-emerald-500' : 'text-gray-300'}`} />
                  <span className={`text-[11px] font-semibold ${isMatch ? 'text-gray-800' : 'text-gray-400'}`}>Konfirmasi password baru cocok</span>
                </div>
              </div>
            </div>

            {/* Change Password Form Bento Card (2/3 Width) */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <FiLock className="text-primary w-4 h-4" />
                FORMULIR GANTI PASSWORD
              </h3>

              <form onSubmit={handlePasswordSubmit} className="space-y-5">
                
                {/* Current Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Password Saat Ini</label>
                  <div className="relative">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value)
                        setErrorOldPassword('')
                      }}
                      placeholder="Masukkan password Anda sekarang"
                      required
                      className={`w-full pl-4 pr-11 py-2.5 text-xs font-bold border rounded-xl focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-gray-300 text-gray-700 ${
                        errorOldPassword ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-100 focus:border-primary'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showCurrent ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errorOldPassword && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 mt-1 animate-pulse">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorOldPassword}</span>
                    </div>
                  )}
                </div>

                {/* New Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Password Baru</label>
                  <div className="relative">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Buat password baru Anda"
                      required
                      className={`w-full pl-4 pr-11 py-2.5 text-xs font-bold border rounded-xl focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-gray-300 text-gray-700 ${
                        newPassword && newPassword.length < 6 ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-100 focus:border-primary'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showNew ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword && newPassword.length < 6 && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 mt-1">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Password baru minimal harus terdiri dari 6 karakter.</span>
                    </div>
                  )}
                  {newPassword && newPassword.length >= 6 && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 mt-1">
                      <FiCheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Panjang password baru aman (minimal 6 karakter).</span>
                    </div>
                  )}
                </div>

                {/* Confirm New Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Masukkan kembali password baru Anda"
                      required
                      className={`w-full pl-4 pr-11 py-2.5 text-xs font-bold border rounded-xl focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-gray-300 text-gray-700 ${
                        confirmPassword && newPassword !== confirmPassword ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-gray-100 focus:border-primary'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirm ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 mt-1">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Konfirmasi password baru tidak cocok.</span>
                    </div>
                  )}
                  {confirmPassword && newPassword === confirmPassword && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 mt-1">
                      <FiCheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Konfirmasi password baru cocok dan sinkron!</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-between gap-4 border-t border-gray-50 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPassword('')
                      setNewPassword('')
                      setConfirmPassword('')
                    }}
                    className="px-4 py-2 border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    Reset Form
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !isMinLength || !isMatch}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/95 transition-all shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <FiSave className="w-4 h-4" />
                    {loading ? 'Menyimpan...' : 'Perbarui Password'}
                  </button>
                </div>

              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
