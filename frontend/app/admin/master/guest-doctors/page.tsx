'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiUsers, FiPlus, FiEdit2, FiTrash2, FiSearch, FiChevronLeft, 
  FiChevronRight, FiPhone, FiMail, FiAward, FiCheck, FiX, FiLoader,
  FiCalendar, FiAlertCircle, FiCopy, FiCheck as FiCheckmark
} from 'react-icons/fi'
import toast from 'react-hot-toast'

interface GuestDoctor {
  id: string
  name: string
  licenseNumber: string
  specialization: string
  phone: string
  email?: string
  address?: string
  isActive: boolean
  createdAt: string
  assignments?: Array<{
    id: string
    date: string
    status: string
  }>
}

interface FormData {
  name: string
  licenseNumber: string
  specialization: string
  phone: string
  email: string
  address: string
  isActive: boolean
}

const SPECIALIZATIONS = [
  'Umum', 'Gigi', 'Anak', 'Kandungan', 'Bedah', 'Dalam', 'Saraf', 
  'Mata', 'THT', 'Kulit', 'Jantung', 'Orthopedi', 'Radiologi', 
  'Anestesi', 'Jiwa', 'Rehab Medik', 'Gizi Klinik'
]

const EMPTY_FORM: FormData = {
  name: '',
  licenseNumber: '',
  specialization: '',
  phone: '',
  email: '',
  address: '',
  isActive: true
}

export default function GuestDoctorsPage() {
  const { user, activeClinicId } = useAuthStore()
  const [doctors, setDoctors] = useState<GuestDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [specFilter, setSpecFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 10

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GuestDoctor | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState('')

  // Fetch doctors
  const fetchDoctors = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (search) params.append('search', search)
      if (specFilter) params.append('specialization', specFilter)

      const res = await api.get(`/guest-doctors/profiles?${params}`)
      setDoctors(res.data.data)
      setTotal(res.data.pagination.total)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal memuat dokter tamu')
    } finally {
      setLoading(false)
    }
  }, [page, search, specFilter])

  useEffect(() => {
    fetchDoctors()
  }, [fetchDoctors])

  // Handle search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      setSearching(true)
      setSearching(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (doctor: GuestDoctor) => {
    setEditing(doctor)
    setForm({
      name: doctor.name,
      licenseNumber: doctor.licenseNumber,
      specialization: doctor.specialization,
      phone: doctor.phone,
      email: doctor.email || '',
      address: doctor.address || '',
      isActive: doctor.isActive
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.licenseNumber || !form.specialization || !form.phone) {
      setError('Nama, SIP, spesialisasi, dan telepon wajib diisi')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      if (editing) {
        // Update
        await api.put(`/guest-doctors/profiles/${editing.id}`, form)
        toast.success('Dokter tamu berhasil diperbarui')
      } else {
        // Create
        await api.post('/guest-doctors/profiles', form)
        toast.success('Dokter tamu berhasil ditambahkan')
      }

      setModalOpen(false)
      await fetchDoctors()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal menyimpan dokter tamu')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus dokter tamu ini?')) return

    try {
      await api.delete(`/guest-doctors/profiles/${id}`)
      toast.success('Dokter tamu berhasil dihapus')
      await fetchDoctors()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menghapus dokter tamu')
    }
  }

  const pages = Math.ceil(total / limit)

  return (
    <div className="p-6 pb-20 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl"><FiUsers className="text-indigo-600" /></div>
            Kelola Dokter Tamu
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-bold uppercase tracking-widest">
            {total} dokter tamu terdaftar
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl"
        >
          <FiPlus className="w-4 h-4" /> Tambah Dokter Tamu
        </button>
      </div>

      {/* Search & Filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Cari nama atau SIP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 text-sm"
          />
        </div>
        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 text-sm bg-white"
        >
          <option value="">Semua Spesialisasi</option>
          {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <FiLoader className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : doctors.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400">
            <FiUsers className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-semibold">Belum ada dokter tamu terdaftar</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-gray-700">Nama & SIP</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 hidden md:table-cell">Spesialisasi</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 hidden lg:table-cell">Kontak</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 hidden lg:table-cell">Penugasan</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-center font-bold text-gray-700">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {doctors.map(doctor => (
                    <tr key={doctor.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-900">{doctor.name}</p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">SIP: {doctor.licenseNumber}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                          <FiAward className="w-3 h-3" /> {doctor.specialization}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="space-y-1">
                          <p className="text-xs flex items-center gap-1.5 text-gray-700">
                            <FiPhone className="w-3 h-3 text-green-500" /> {doctor.phone}
                          </p>
                          {doctor.email && (
                            <p className="text-xs flex items-center gap-1.5 text-gray-500 truncate">
                              <FiMail className="w-3 h-3" /> {doctor.email}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="text-xs">
                          <p className="text-gray-600 font-semibold">{doctor.assignments?.length || 0}x penugasan</p>
                          {doctor.assignments?.[0] && (
                            <p className="text-gray-400 mt-0.5">
                              Terakhir: {new Date(doctor.assignments[0].date).toLocaleDateString('id-ID')}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {doctor.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                            <FiCheck className="w-3 h-3" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-bold">
                            <FiX className="w-3 h-3" /> Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(doctor)}
                            className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <FiEdit2 className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDelete(doctor.id)}
                            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <FiTrash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="px-4 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-500 font-semibold">
                  Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, total)} dari {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    <FiChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-gray-700">{page} / {pages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="p-1.5 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    <FiChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Form */}
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
                  {editing ? 'Edit Dokter Tamu' : 'Tambah Dokter Tamu Baru'}
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
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Nama Dokter *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
                    placeholder="Dr. Supardi"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">SIP (Nomor Lisensi) *</label>
                  <input
                    type="text"
                    value={form.licenseNumber}
                    onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                    disabled={submitting || !!editing}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm disabled:bg-gray-50"
                    placeholder="123456789000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Spesialisasi *</label>
                  <select
                    value={form.specialization}
                    onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm bg-white"
                  >
                    <option value="">Pilih spesialisasi</option>
                    {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Telepon *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
                    placeholder="08123456789"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Email (Opsional)</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
                    placeholder="supardi@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Alamat (Opsional)</label>
                  <textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    disabled={submitting}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm resize-none"
                    rows={2}
                    placeholder="Jl. Contoh No. 123"
                  />
                </div>

                {editing && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      disabled={submitting}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-xs font-semibold text-gray-700">Aktif</span>
                  </label>
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
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <FiLoader className="w-4 h-4 animate-spin mx-auto" /> : 'Simpan'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
