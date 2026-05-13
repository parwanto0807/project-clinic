'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { FiUsers, FiAlertCircle, FiRefreshCw, FiPhone, FiMapPin, FiCalendar, FiUser, FiInfo, FiPlus, FiActivity, FiLock, FiShield } from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import DataTable, { Column } from '@/components/admin/master/DataTable'
import PageHeader from '@/components/admin/master/PageHeader'
import MasterModal from '@/components/admin/master/MasterModal'
import { StatusBadge } from '@/components/admin/master/StatusBadge'
import { motion } from 'framer-motion'

const API = process.env.NEXT_PUBLIC_API_URL + '/api/master'
const EMPTY = { 
  medicalRecordNo: '', 
  name: '', 
  email: '', 
  phone: '', 
  address: '', 
  city: '', 
  province: '', 
  zipCode: '', 
  dateOfBirth: '', 
  gender: 'M', 
  bloodType: '-', 
  identityType: 'KTP', 
  identityNumber: '', 
  emergencyContact: '', 
  emergencyPhone: '', 
  allergies: '', 
  bpjsNumber: '',
  insuranceName: '',
  isActive: true 
}

type Patient = typeof EMPTY & { id: string; createdAt: string; updatedAt: string }

export default function PatientsPage() {
  const { user } = useAuthStore()
  const isAllowed = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'DOCTOR' || user?.role === 'NURSE'
  const [data, setData] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')


  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (search) params.search = search
      const res = await api.get('/master/patients', { params })
      // Extract the data array from the paginated response object if necessary
      const patientsArray = Array.isArray(res.data) ? res.data : (res.data.data || [])
      setData(patientsArray)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchNextMR = useCallback(async () => {
    try {
      const { data } = await api.get('/master/patients/next-mr')
      setForm(p => ({ ...p, medicalRecordNo: data.nextCode }))
    } catch (e) { console.error('Failed to fetch next MR No', e) }
  }, [])

  const openAdd = () => { 
    setEditing(null); 
    setForm(EMPTY); 
    setError(''); 
    setModalOpen(true)
    fetchNextMR()
  }

  const openEdit = (r: Patient) => {
    setEditing(r)
    setForm({ 
      ...r, 
      dateOfBirth: r.dateOfBirth ? r.dateOfBirth.substring(0, 10) : '',
      allergies: r.allergies || '',
      emergencyContact: r.emergencyContact || '',
      emergencyPhone: r.emergencyPhone || '',
      zipCode: r.zipCode || '',
      city: r.city || '',
      province: r.province || '',
      address: r.address || '',
      email: r.email || ''
    })
    setError(''); setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.medicalRecordNo || !form.name || !form.phone) { 
      setError('No. RM, Nama, dan No. HP wajib diisi')
      return 
    }
    setSaving(true); setError('')
    try {
      if (editing) await api.put(`/master/patients/${editing.id}`, form)
      else await api.post('/master/patients', form)
      
      // Reset flow: Clear search and close modal FIRST, then fetch
      setSearch('')
      setModalOpen(false)
      
      // Delay fetch slightly to ensure DB has indexed if needed, and search state has cleared
      setTimeout(() => fetchData(), 100)
    } catch (e: any) { setError(e.response?.data?.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = async (r: Patient) => {
    if (!confirm(`Hapus data pasien "${r.name}"?`)) return
    try { await api.delete(`/master/patients/${r.id}`); fetchData() } catch { }
  }

  const columns: Column<Patient>[] = [
    { key: 'medicalRecordNo', label: 'No. RM', render: (r) => (
      <div className="flex flex-col">
        <span className="text-xs font-black font-mono text-primary bg-primary/5 px-2 py-1 rounded-lg border border-primary/10 w-fit">{r.medicalRecordNo}</span>
        <span className="text-[10px] text-gray-400 mt-1 font-bold">{new Date(r.createdAt).toLocaleDateString('id-ID')}</span>
      </div>
    )},
    { key: 'name', label: 'Nama Pasien', render: (r) => (
      <div className="flex items-center gap-3 py-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-white shadow-sm ${r.gender === 'F' ? 'bg-rose-500' : 'bg-blue-500'}`}>
          {r.name.charAt(0)}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-black text-gray-900 tracking-tight">{r.name}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{r.gender === 'M' ? 'Laki-laki' : 'Perempuan'} • {r.dateOfBirth ? `${new Date().getFullYear() - new Date(r.dateOfBirth).getFullYear()} Thn` : '-'}</span>
        </div>
      </div>
    )},
    { key: 'phone', label: 'Kontak', render: (r) => (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-gray-700">
          <FiPhone className="w-3 h-3 text-gray-400" />
          <span className="text-xs font-bold leading-none">{r.phone}</span>
        </div>
        {r.email && (
          <span className="text-[10px] text-gray-400 font-medium truncate max-w-[150px]">{r.email}</span>
        )}
      </div>
    )},
    { key: 'bloodType', label: 'Gol Darah', render: (r) => (
      <span className={`text-[10px] font-black px-2 py-1 rounded-lg border shadow-sm ${r.bloodType !== '-' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
        {r.bloodType}
      </span>
    )},
    { key: 'bpjsNumber', label: 'Jaminan / Asuransi', render: (r) => (
      <div className="flex flex-col gap-1.5">
        {r.bpjsNumber ? (
           <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md w-fit">BPJS: {r.bpjsNumber}</span>
           </div>
        ) : r.insuranceName ? (
           <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md w-fit">{r.insuranceName}</span>
           </div>
        ) : (
           <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">UMUM / CASH</span>
        )}
      </div>
    )},
    { key: 'isActive', label: 'Status', render: (r) => <StatusBadge active={r.isActive} /> },
  ]


  if (!isAllowed) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mb-6">
          <FiLock className="w-10 h-10 text-rose-500" />
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-2">Akses Terbatas</h2>
        <p className="text-sm text-gray-400 max-w-md">Maaf, halaman Database Pasien hanya dapat diakses oleh Super Admin, Admin, dan Dokter.</p>
      </div>
    )
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Database Pasien" subtitle="Kelola data master pasien dan riwayat rekam medis"
        icon={<FiUsers className="w-5 h-5 sm:w-6 sm:h-6" />}
        onAdd={openAdd} addLabel="Pasien Baru" count={data.length}
        breadcrumb={['Admin', 'Data Master', 'Pasien']}
      />
      
      <DataTable
        data={data} columns={columns} loading={loading}
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="Cari nama, No. RM, No. HP, atau No. KTP..."
        onEdit={openEdit} onDelete={handleDelete}
        emptyText="Belum ada data pasien terdaftar."
      />

      <MasterModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Data Pasien' : 'Registrasi Pasien Baru'} 
        subtitle={editing ? `ID Rekam Medis: ${editing.medicalRecordNo}` : 'Lengkapi informasi identitas dan kontak pasien secara lengkap.'}
        size="3xl"
      >
        <div className="py-2 space-y-8">
          {error && (
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-md text-sm font-medium text-red-600">
              <FiAlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Left Section: Personal & Contact */}
            <div className="lg:col-span-7 space-y-8">
              
              {/* Identity Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <FiUser className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Identitas Pasien</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-1">
                    <label className="text-[11px] font-medium text-slate-500 flex justify-between items-center">
                      <span>No. Rekam Medis *</span>
                      <button type="button" onClick={fetchNextMR} className="text-primary hover:underline flex items-center gap-1 text-[10px] font-semibold">
                        <FiRefreshCw className="w-2.5 h-2.5" /> Auto
                      </button>
                    </label>
                    <input 
                      value={form.medicalRecordNo || ''} 
                      onChange={(e) => setForm(p => ({...p, medicalRecordNo: e.target.value}))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all font-mono font-medium" 
                      placeholder="RM-XXXX-XXXX"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-medium text-slate-500">Nama Lengkap Pasien *</label>
                    <input 
                      type="text" 
                      value={form.name || ''} 
                      onChange={(e) => setForm(p => ({...p, name: e.target.value}))} 
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                      placeholder="Contoh: Budi Santoso"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500">Jenis Kelamin</label>
                    <div className="flex gap-1 p-1 bg-slate-50 rounded-md border border-slate-200">
                      {['M', 'F'].map(g => (
                        <button 
                          key={g} type="button" 
                          onClick={() => setForm(p => ({ ...p, gender: g }))}
                          className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${form.gender === g ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          {g === 'M' ? 'Laki-laki' : 'Perempuan'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500">Tanggal Lahir</label>
                    <input 
                      type="date" 
                      value={form.dateOfBirth || ''} 
                      onChange={(e) => setForm(p => ({...p, dateOfBirth: e.target.value}))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                    />
                  </div>
                </div>
              </div>

              {/* Contact & Address Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <FiMapPin className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Kontak & Alamat</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500">No. WhatsApp Aktif *</label>
                    <input 
                      type="tel" 
                      value={form.phone || ''} 
                      onChange={(e) => setForm(p => ({...p, phone: e.target.value}))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                      placeholder="0812XXXXXXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500">Email (Opsional)</label>
                    <input 
                      type="email" 
                      value={form.email || ''} 
                      onChange={(e) => setForm(p => ({...p, email: e.target.value}))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                      placeholder="pasien@email.com"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-medium text-slate-500">Alamat Lengkap</label>
                    <textarea 
                      value={form.address || ''} 
                      onChange={(e) => setForm(p => ({...p, address: e.target.value}))} 
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all resize-none" 
                      placeholder="Jalan, Blok, No Rumah..." 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Section: Medical & Emergency */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Medical Information */}
              <div className="p-5 border border-slate-200 rounded-lg bg-slate-50/30 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <FiActivity className="w-4 h-4 text-slate-400" />
                  <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Informasi Medis</h4>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500 block">Golongan Darah</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['-', 'A', 'B', 'AB', 'O'].map(t => (
                        <button 
                          key={t} type="button" 
                          onClick={() => setForm(p => ({...p, bloodType: t}))}
                          className={`w-9 h-8 flex items-center justify-center rounded border text-xs font-medium transition-all ${form.bloodType === t ? 'bg-primary border-primary text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500 block">Catatan Alergi</label>
                    <textarea 
                      value={form.allergies || ''} 
                      onChange={(e) => setForm(p => ({...p, allergies: e.target.value}))} 
                      rows={2}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all resize-none" 
                      placeholder="Sebutkan alergi (jika ada)..." 
                    />
                  </div>
                </div>
              </div>

              {/* Insurance Section */}
              <div className="p-5 border border-slate-200 rounded-lg bg-slate-50/30 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <FiShield className="w-4 h-4 text-slate-400" />
                  <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Jaminan & Asuransi</h4>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-slate-500 block">No. Kartu BPJS</label>
                    <input 
                      type="text" 
                      value={form.bpjsNumber || ''} 
                      onChange={(e) => setForm(p => ({...p, bpjsNumber: e.target.value}))} 
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                      placeholder="0001XXXXXXXXX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-slate-500 block">Nama Asuransi Lain</label>
                    <input 
                      type="text" 
                      value={form.insuranceName || ''} 
                      onChange={(e) => setForm(p => ({...p, insuranceName: e.target.value}))} 
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                      placeholder="Nama Asuransi..."
                    />
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="p-1 space-y-3">
                 <div className="space-y-3">
                    <div className="group space-y-1.5">
                       <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider ml-1">Kontak Darurat (Nama KK)</label>
                       <input value={form.emergencyContact || ''} onChange={(e) => setForm(p => ({...p, emergencyContact: e.target.value}))} placeholder="Nama Keluarga..." className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" />
                    </div>
                    <div className="group space-y-1.5">
                       <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider ml-1">No. HP Darurat</label>
                       <input value={form.emergencyPhone || ''} onChange={(e) => setForm(p => ({...p, emergencyPhone: e.target.value}))} placeholder="08xxxxxxxx" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" />
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setModalOpen(false)} 
              className="px-6 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all active:scale-95"
            >
              Batal
            </button>
            <button 
              onClick={handleSave} 
              disabled={saving} 
              className="px-8 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>{editing ? 'Perbarui Data' : 'Simpan Pasien'}</>
              )}
            </button>
          </div>
        </div>
      </MasterModal>
    </div>
  )
}
