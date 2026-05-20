'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiCalendar, FiPlus, FiTrash2, FiCheckCircle, FiClock, FiLoader,
  FiAlertCircle, FiCopy, FiCheck, FiChevronLeft, FiChevronRight, FiAward, FiX
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import { format, addDays, subtractDays } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

interface GuestDoctorProfile {
  id: string
  name: string
  licenseNumber: string
  specialization: string
  phone: string
  isActive: boolean
}

interface Assignment {
  id: string
  date: string
  guestDoctorId: string
  guestDoctor: GuestDoctorProfile
  userId?: string
  user?: {
    id: string
    username: string
  }
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  notes?: string
  createdAt: string
}

interface FormData {
  guestDoctorId: string
  notes: string
  date: string
}

const EMPTY_FORM: FormData = {
  guestDoctorId: '',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd')
}

export default function GuestDoctorAssignmentPage() {
  const { user, activeClinicId } = useAuthStore()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [doctors, setDoctors] = useState<GuestDoctorProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copiedCredentials, setCopiedCredentials] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')

  // Fetch assignments for selected date
  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('date', format(selectedDate, 'yyyy-MM-dd'))

      const res = await api.get(`/guest-doctors/assignments?${params}`)
      setAssignments(res.data.data)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal memuat penugasan')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  // Fetch available doctors
  const fetchDoctors = useCallback(async () => {
    try {
      const res = await api.get('/guest-doctors/profiles?limit=999')
      setDoctors(res.data.data.filter((d: GuestDoctorProfile) => d.isActive))
    } catch (err: any) {
      console.error('Gagal memuat dokter tamu:', err)
    }
  }, [])

  useEffect(() => {
    fetchAssignments()
    fetchDoctors()
  }, [fetchAssignments, fetchDoctors])

  const handleDateChange = (days: number) => {
    setSelectedDate(prev => addDays(prev, days))
  }

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      date: format(selectedDate, 'yyyy-MM-dd')
    })
    setError('')
    setGeneratedPassword('')
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.guestDoctorId) {
      setError('Dokter tamu harus dipilih')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      const res = await api.post('/guest-doctors/assignments', {
        guestDoctorId: form.guestDoctorId,
        notes: form.notes || null,
        date: form.date
      })

      // Show credentials
      if (res.data.data.credentials) {
        setGeneratedPassword(res.data.data.credentials.password)
        toast.success('Dokter tamu berhasil ditugaskan!')
      } else {
        toast.success('Dokter tamu berhasil ditugaskan!')
        setModalOpen(false)
      }

      await fetchAssignments()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal membuat penugasan')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCredentials = () => {
    const doctor = doctors.find(d => d.id === form.guestDoctorId)
    if (doctor && generatedPassword) {
      const text = `Username: ${doctor.licenseNumber}\nPassword: ${generatedPassword}`
      navigator.clipboard.writeText(text)
      setCopiedCredentials('Berhasil disalin!')
      setTimeout(() => setCopiedCredentials(''), 2000)
    }
  }

  const handleComplete = async (id: string) => {
    try {
      await api.put(`/guest-doctors/assignments/${id}/complete`)
      toast.success('Penugasan selesai, akun dinonaktifkan')
      await fetchAssignments()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyelesaikan penugasan')
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Yakin ingin membatalkan penugasan ini?')) return

    try {
      await api.put(`/guest-doctors/assignments/${id}/cancel`, {
        reason: 'Dibatalkan oleh admin'
      })
      toast.success('Penugasan dibatalkan')
      await fetchAssignments()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal membatalkan penugasan')
    }
  }

  const todayAssignment = assignments.find(a => a.status !== 'CANCELLED')
  const dateStr = format(selectedDate, 'EEEE, d MMMM yyyy', { locale: idLocale })

  return (
    <div className="p-6 pb-20 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl"><FiCalendar className="text-blue-600" /></div>
            Penugasan Dokter Tamu Hari Ini
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-bold uppercase tracking-widest">
            {dateStr}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl"
        >
          <FiPlus className="w-4 h-4" /> Tentukan Dokter
        </button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <button
          onClick={() => handleDateChange(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <FiChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div className="text-center min-w-[240px]">
          <p className="text-lg font-black text-gray-900">
            {format(selectedDate, 'dd MMMM yyyy', { locale: idLocale })}
          </p>
          <p className="text-xs text-gray-400 font-bold mt-1">
            {format(selectedDate, 'EEEE', { locale: idLocale })}
          </p>
        </div>

        <button
          onClick={() => handleDateChange(1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <FiChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Current Assignment */}
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <FiLoader className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : todayAssignment ? (
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-200 rounded-2xl p-6 mb-8 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">
                  Dokter Aktif Hari Ini
                </span>
              </div>

              <div className="space-y-2 mb-6">
                <p className="text-2xl font-black text-gray-900">
                  {todayAssignment.guestDoctor.name}
                </p>
                <div className="space-y-1">
                  <p className="text-sm flex items-center gap-2 text-gray-600">
                    <span className="font-semibold">Spesialisasi:</span>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                      {todayAssignment.guestDoctor.specialization}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">SIP:</span> {todayAssignment.guestDoctor.licenseNumber}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Telepon:</span> {todayAssignment.guestDoctor.phone}
                  </p>
                </div>
              </div>

              {todayAssignment.user && (
                <div className="p-3 bg-white rounded-lg border border-emerald-100 mb-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Akun Login</p>
                  <p className="text-sm font-mono text-gray-900">
                    Username: <span className="font-black">{todayAssignment.user.username}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Password: [Terenkripsi, lihat saat create assignment]
                  </p>
                </div>
              )}

              {todayAssignment.notes && (
                <p className="text-sm text-gray-600 italic bg-white p-3 rounded-lg border border-emerald-100">
                  <span className="font-semibold">Keterangan:</span> {todayAssignment.notes}
                </p>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => handleComplete(todayAssignment.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors"
                >
                  <FiCheckCircle className="w-4 h-4" /> Selesaikan Penugasan
                </button>
                <button
                  onClick={() => handleCancel(todayAssignment.id)}
                  className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg font-bold text-sm hover:bg-red-50 transition-colors"
                >
                  <FiTrash2 className="w-4 h-4" /> Batalkan
                </button>
              </div>
            </div>

            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-black text-2xl">
                {todayAssignment.guestDoctor.name[0]}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <FiAlertCircle className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-900">Belum ada penugasan untuk hari ini</p>
              <p className="text-sm text-blue-700 mt-1">
                Klik tombol "Tentukan Dokter" di atas untuk menugaskan dokter tamu.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="text-lg font-black text-gray-900 mb-4">Riwayat Penugasan</h2>
        {assignments.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
            <p>Belum ada penugasan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map(assignment => (
              <div
                key={assignment.id}
                className={`p-4 rounded-lg border ${
                  assignment.status === 'CANCELLED'
                    ? 'bg-red-50 border-red-200 opacity-50'
                    : 'bg-white border-gray-200 hover:shadow-sm'
                } transition-shadow`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {assignment.guestDoctor.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(assignment.date), 'dd MMMM yyyy', { locale: idLocale })}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${
                    assignment.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : assignment.status === 'ACTIVE'
                      ? 'bg-blue-100 text-blue-700'
                      : assignment.status === 'CANCELLED'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {assignment.status === 'COMPLETED' && <FiCheckCircle className="w-3 h-3" />}
                    {assignment.status === 'ACTIVE' && <FiClock className="w-3 h-3" />}
                    {assignment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-gray-900">
                  Tentukan Dokter Tamu
                </h2>
                <button
                  onClick={() => !submitting && setModalOpen(false)}
                  disabled={submitting}
                  className="p-1.5 hover:bg-gray-100 disabled:opacity-50 rounded-lg transition-colors"
                  title="Tutup"
                >
                  <FiX className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <FiAlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Pilih Dokter Tamu *
                  </label>
                  <select
                    value={form.guestDoctorId}
                    onChange={(e) => {
                      setForm({ ...form, guestDoctorId: e.target.value })
                      setGeneratedPassword('')
                    }}
                    disabled={submitting}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm bg-white"
                  >
                    <option value="">Pilih dokter</option>
                    {doctors.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} - {doc.specialization}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Keterangan (Opsional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm resize-none"
                    rows={2}
                    placeholder="Pengganti Dr. Agus yang cuti..."
                  />
                </div>

                {generatedPassword && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-bold text-blue-700 mb-2">✅ Akun Berhasil Dibuat</p>
                    <div className="space-y-1 text-xs">
                      <p><span className="font-bold">Username:</span> {form.guestDoctorId && doctors.find(d => d.id === form.guestDoctorId)?.licenseNumber}</p>
                      <p><span className="font-bold">Password:</span> {generatedPassword}</p>
                    </div>
                    <button
                      onClick={copyCredentials}
                      className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                    >
                      <FiCopy className="w-3 h-3" />
                      {copiedCredentials || 'Salin Credentials'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg font-bold text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={generatedPassword ? () => setModalOpen(false) : handleSubmit}
                  disabled={submitting || !form.guestDoctorId}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? (
                    <FiLoader className="w-4 h-4 animate-spin mx-auto" />
                  ) : generatedPassword ? (
                    'Selesai'
                  ) : (
                    'Buat Penugasan'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
