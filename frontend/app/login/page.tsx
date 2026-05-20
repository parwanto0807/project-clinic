'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiHome, FiChevronRight } from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'

type Step = 'login' | 'select-clinic'

export default function LoginPage() {
  // Login states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionMessage, setSessionMessage] = useState('')

  // Read logout reason set by api.ts forceLogout()
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const reason = sessionStorage.getItem('logout_reason')
      if (reason) {
        setSessionMessage(reason)
        sessionStorage.removeItem('logout_reason')
      }
    }
  }, [])
  
  // Selection states
  const [step, setStep] = useState<Step>('login')
  const [userData, setUserData] = useState<any>(null)
  
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5004'
      const response = await axios.post(`${apiBase}/api/auth/login`, {
        email: email, // Can be email or username (SIP for guest doctors)
        password
      }, {
        withCredentials: true, // Allow browser to receive and store the HttpOnly cookie
      })

      // Backend returns { user } only
      const { user } = response.data

      if (!user.clinics || user.clinics.length === 0) {
        throw new Error('Akun Anda tidak memiliki akses ke cabang manapun. Silakan hubungi Administrator.')
      }

      if (user.clinics.length > 1) {
        setUserData(user)
        setStep('select-clinic')
      } else {
        handleFinalLogin(user, user.clinics[0].id)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Gagal login. Periksa kembali email/username dan password Anda.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFinalLogin = (user: any, clinicId: string) => {
    setAuth(user, clinicId)
    
    // Redirect based on role
    if (user.role === 'DOCTOR') {
      router.push('/doctor')
    } else if (['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'FARMASI', 'ACCOUNTING', 'LOGISTIC', 'STAFF'].includes(user.role)) {
      router.push('/admin')
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row transition-colors duration-500 overflow-x-hidden">
      {/* LEFT SIDE: Brand Banner (Hidden on Mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-primary via-blue-700 to-cyan-700 relative overflow-hidden flex-col justify-between p-12 text-white shadow-2xl">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-cyan-400/20 blur-[100px]" />
        
        {/* Top Header */}
        <div className="flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white flex items-center justify-center p-0.5 border border-white/20">
            <img src="/logo-yasfina_web.png" alt="Yasfina Logo" className="w-full h-full object-contain scale-[1.8]" />
          </div>
          <span className="font-extrabold text-xl tracking-tight">KLINIK <span className="text-cyan-300 font-light">YASFINA</span></span>
        </div>

        {/* Center Illustration/Welcome */}
        <div className="my-auto space-y-6 z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <span className="px-4 py-1.5 rounded-full bg-white/10 text-xs font-bold uppercase tracking-wider border border-white/20">
              Sistem Informasi Manajemen
            </span>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight leading-tight mt-4">
              Pengelolaan Klinik <br />
              <span className="text-cyan-300">Modern & Terintegrasi</span>
            </h1>
            <p className="text-white/80 text-base leading-relaxed mt-4 font-normal">
              Selamat datang kembali, rekan medis! Akses dasbor klinis untuk mengelola antrean pasien, rekam medis, farmasi, laporan keuangan, dan fasilitas penunjang medis dengan standar pelayanan terbaik.
            </p>
          </motion.div>

          {/* Feature Badges */}
          <div className="grid grid-cols-2 gap-4 pt-6">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <p className="font-bold text-sm text-cyan-300">Rekam Medis (EMR)</p>
              <p className="text-xs text-white/60 mt-1">Standar ICD-10 Kemenkes</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <p className="font-bold text-sm text-cyan-300">Apotek & Kasir</p>
              <p className="text-xs text-white/60 mt-1">Integrasi pembayaran & obat</p>
            </div>
          </div>
        </div>

        {/* Bottom Footer Info */}
        <div className="z-10 flex items-center justify-between text-xs text-white/60 font-semibold uppercase tracking-wider">
          <span>Yasfina SIM RS v2.0</span>
          <span>&copy; 2026 Klinik Yasfina</span>
        </div>
      </div>

      {/* RIGHT SIDE: Login Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-slate-50 dark:bg-slate-900 transition-colors duration-500 relative">
        {/* Soft Background circles on right side */}
        <div className="absolute top-10 right-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl" />

        {/* Back button */}
        <button
          onClick={() => step === 'login' ? router.push('/') : setStep('login')}
          className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-primary transition-colors z-10"
        >
          <FiArrowLeft className="w-5 h-5" />
          <span className="font-bold text-sm">{step === 'login' ? 'Beranda' : 'Kembali'}</span>
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md z-10"
        >
          <AnimatePresence mode="wait">
            {step === 'login' ? (
              <motion.div
                key="login-step"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-slate-200/50 dark:shadow-black/40 p-8 md:p-10 border border-slate-200/60 dark:border-slate-800/80 transition-all duration-500"
              >
                {/* Logo and Header for Mobile viewports */}
                <div className="flex flex-col items-center mb-8">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shadow-lg bg-white p-1 border border-slate-100">
                    <img 
                      src="/logo-yasfina_web.png" 
                      alt="Yasfina Logo" 
                      className="w-full h-full object-contain scale-[1.8]"
                    />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight mt-5 text-center leading-none">
                    Klinik <span className="text-primary">Yasfina</span>
                  </h1>
                  <p className="text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-widest mt-2">
                    Portal Dasbor Pengguna
                  </p>
                </div>

                {/* Session expired message */}
                {sessionMessage && (
                  <div className="mb-4 p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl flex items-center gap-3">
                    <div className="w-4 h-4 bg-amber-400 rounded-full flex-shrink-0 animate-pulse" />
                    <p className="text-amber-700 dark:text-amber-400 text-xs font-semibold">{sessionMessage}</p>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-start gap-3">
                    <div className="w-5 h-5 bg-red-500 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-white text-xs font-bold">!</div>
                    <p className="text-red-700 dark:text-red-400 text-xs font-semibold">{error}</p>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1">Email atau Username (SIP untuk Dokter Tamu)</label>
                    <div className="relative">
                      <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email atau SIP dokter tamu"
                        required
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50/50 dark:bg-slate-900/50 dark:text-white border border-slate-200 dark:border-slate-800/80 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary dark:focus:border-primary rounded-2xl transition-all duration-300 font-medium text-sm outline-none"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1">Password</label>
                    <div className="relative">
                      <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-12 pr-12 py-3.5 bg-slate-50/50 dark:bg-slate-900/50 dark:text-white border border-slate-200 dark:border-slate-800/80 focus:bg-white dark:focus:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary dark:focus:border-primary rounded-2xl transition-all duration-300 font-medium text-sm outline-none"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                      >
                        {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs px-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 rounded-lg border-gray-300 dark:border-slate-700 text-primary focus:ring-primary bg-gray-50 dark:bg-slate-900" />
                      <span className="text-gray-500 dark:text-gray-400 font-bold group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">Ingat saya</span>
                    </label>
                    <Link href="/forgot-password" title="Lupa password?" className="font-bold text-primary hover:text-blue-700 transition-colors">Lupa password?</Link>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 mt-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Memverifikasi...</span>
                      </>
                    ) : 'Masuk ke Dashboard'}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="clinic-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl rounded-[2rem] shadow-2xl p-8 md:p-10 border border-slate-200/60 dark:border-slate-800/80 transition-all duration-500"
              >
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
                    <FiHome className="w-8 h-8" />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pilih Cabang</h1>
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm px-4">Pilih cabang klinik yang ingin Anda akses sekarang.</p>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {userData?.clinics.map((clinic: any) => (
                    <button
                      key={clinic.id}
                      onClick={() => handleFinalLogin(userData, clinic.id)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 hover:border-primary/50 dark:hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/5 transition-all duration-300 group text-left"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        <FiHome className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors">{clinic.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{clinic.code}</p>
                      </div>
                      <FiChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-all translate-x-0 group-hover:translate-x-1" />
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setStep('login')}
                  className="w-full mt-8 py-3 text-sm font-bold text-gray-400 hover:text-primary transition-colors"
                >
                  Ganti Akun? Login kembali
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer info for mobile viewports */}
          <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-10 md:hidden">
            Powered by SIM RS &copy; 2026 Klinik Yasfina
          </p>
        </motion.div>
      </div>
    </div>
  )
}
