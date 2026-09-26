'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { FiUsers, FiAlertCircle, FiRefreshCw, FiPhone, FiMapPin, FiCalendar, FiUser, FiInfo, FiPlus, FiActivity, FiLock, FiShield, FiFileText } from 'react-icons/fi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import DataTable, { Column } from '@/components/admin/master/DataTable'
import PageHeader from '@/components/admin/master/PageHeader'
import MasterModal from '@/components/admin/master/MasterModal'
import MergePatientDialog from '@/components/admin/master/MergePatientDialog'
import PatientHistoryDialog from '@/components/admin/master/PatientHistoryDialog'
import { StatusBadge } from '@/components/admin/master/StatusBadge'
import { motion } from 'framer-motion'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL + '/api/master'
const EMPTY = { 
  medicalRecordNo: '', 
  oldMedicalRecordNo: '',
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
  familyHeadName: '',
  emergencyContact: '', 
  emergencyPhone: '', 
  allergies: '', 
  bpjsNumber: '',
  insuranceName: '',
  patientType: 'Poli Umum',
  corporatePartnerId: '',
  isActive: true 
}

type Patient = typeof EMPTY & { id: string; createdAt: string; updatedAt: string; age?: number }

export default function PatientsPage() {
  const { user, activeClinicId } = useAuthStore()
  const isAllowed = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'DOCTOR' || user?.role === 'NURSE' || user?.role === 'STAFF'
  const [data, setData] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [patientTypeFilter, setPatientTypeFilter] = useState('Semua')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [updatedId, setUpdatedId] = useState<string | null>(null)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<Patient | null>(null)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyPatientId, setHistoryPatientId] = useState<string | null>(null)
  const [corporatePartners, setCorporatePartners] = useState<{id: string, name: string}[]>([])

  const fetchCorporatePartners = useCallback(async () => {
    if (!activeClinicId) return
    try {
      const res = await api.get('/master/corporate-partners', { params: { clinicId: activeClinicId } })
      setCorporatePartners(res.data.filter((c: any) => c.isActive))
    } catch (e) { console.error('Failed to fetch corporate partners', e) }
  }, [activeClinicId])

  useEffect(() => {
    fetchCorporatePartners()
  }, [fetchCorporatePartners])

  // Debounce logic
  const calculateAge = (dob: string) => {
    if (!dob) return '-';
    const birthDate = new Date(dob);
    const today = new Date();
    
    let ageY = today.getFullYear() - birthDate.getFullYear();
    let ageM = today.getMonth() - birthDate.getMonth();
    
    if (today.getDate() < birthDate.getDate()) {
        ageM--;
    }
    
    if (ageM < 0) {
        ageY--;
        ageM += 12;
    }
    
    if (ageY === 0 && ageM === 0) return '< 1 Bln';
    if (ageY === 0) return `${ageM} Bln`;
    if (ageM === 0) return `${ageY} Thn`;
    
    return `${ageY} Thn ${ageM} Bln`;
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1) // Reset page on search
    }, 500)
    return () => clearTimeout(handler)
  }, [search])

  // Reset page when patientTypeFilter changes
  useEffect(() => {
    setPage(1)
  }, [patientTypeFilter])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, limit: 10 }
      if (debouncedSearch) params.search = debouncedSearch
      if (patientTypeFilter !== 'Semua') params.patientType = patientTypeFilter
      const res = await api.get('/master/patients', { params })
      
      if (res.data.meta) {
        setData(res.data.data)
        setMeta(res.data.meta)
      } else {
        const patientsArray = Array.isArray(res.data) ? res.data : (res.data.data || [])
        setData(patientsArray)
      }
    } finally { setLoading(false) }
  }, [debouncedSearch, page, patientTypeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchNextMR = useCallback(async () => {
    try {
      const { data } = await api.get('/master/patients/next-mr')
      setForm(p => ({ ...p, medicalRecordNo: data.nextCode }))
    } catch (e) { console.error('Failed to fetch next MR No', e) }
  }, [])

  const handleDateChange = (val: string) => {
    let cleaned = val.replace(/\D/g, '');
    let formatted = '';
    if (cleaned.length > 0) formatted = cleaned.substring(0, 2);
    if (cleaned.length > 2) formatted += '-' + cleaned.substring(2, 4);
    if (cleaned.length > 4) formatted += '-' + cleaned.substring(4, 8);
    setForm(p => ({ ...p, dateOfBirth: formatted }));
  }

  const openAdd = () => { 
    setEditing(null); 
    setForm(EMPTY); 
    setError(''); 
    setModalOpen(true)
    fetchNextMR()
  }

  const openEdit = (r: Patient) => {
    setEditing(r)
    let dob = '';
    if (r.dateOfBirth) {
       const datePart = r.dateOfBirth.substring(0, 10);
       const parts = datePart.split('-');
       if (parts.length === 3) {
          if (parts[0].length === 4) {
             // YYYY-MM-DD -> DD-MM-YYYY
             dob = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else {
             dob = datePart;
          }
       }
    }
    setForm({ 
      medicalRecordNo: r.medicalRecordNo || '',
      oldMedicalRecordNo: r.oldMedicalRecordNo || '',
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      address: r.address || '',
      city: r.city || '',
      province: r.province || '',
      zipCode: r.zipCode || '',
      dateOfBirth: dob,
      gender: r.gender || 'M',
      bloodType: r.bloodType || '-',
      identityType: r.identityType || 'KTP',
      identityNumber: r.identityNumber || '',
      familyHeadName: r.familyHeadName || '',
      emergencyContact: r.emergencyContact || '',
      emergencyPhone: r.emergencyPhone || '',
      allergies: r.allergies || '',
      bpjsNumber: r.bpjsNumber || '',
      insuranceName: r.insuranceName || '',
      patientType: r.patientType || 'Poli Umum',
      corporatePartnerId: r.corporatePartnerId || '',
      isActive: r.isActive ?? true
    })
    setError(''); setModalOpen(true)
  }

  const openMerge = (r: Patient) => {
    setMergeTarget(r)
    setMergeModalOpen(true)
  }

  const openHistory = (r: Patient) => {
    setHistoryPatientId(r.id)
    setHistoryModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.medicalRecordNo || !form.name || !form.phone) { 
      setError('No. RM, Nama, dan No. HP wajib diisi')
      return 
    }

    let finalForm = { ...form };
    if (finalForm.dateOfBirth) {
      if (/^\d{2}-\d{2}-\d{4}$/.test(finalForm.dateOfBirth)) {
         const [d, m, y] = finalForm.dateOfBirth.split('-');
         finalForm.dateOfBirth = `${y}-${m}-${d}`;
      } else {
         setError('Format Tanggal Lahir tidak valid. Gunakan format DD-MM-YYYY');
         return;
      }
    }

    setSaving(true); setError('')
    try {
      if (editing) {
        await api.put(`/master/patients/${editing.id}`, finalForm)
        setUpdatedId(editing.id)
        setTimeout(() => setUpdatedId(null), 8000) // Highlight for 8 seconds
      } else {
        await api.post('/master/patients', finalForm)
        setSearch('')
        setPage(1)
      }
      
      setModalOpen(false)
      fetchData()
    } catch (e: any) { setError(e.response?.data?.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = async (r: Patient) => {
    if (!confirm(`Hapus data pasien "${r.name}"?`)) return
    try { await api.delete(`/master/patients/${r.id}`); fetchData() } catch { }
  }

  const columns: Column<Patient>[] = [
    { key: 'medicalRecordNo', label: 'No. Rekam Medis', render: (r) => (
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-black font-mono text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/10 w-fit">{r.medicalRecordNo}</span>
        {r.oldMedicalRecordNo && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">ID Lama:</span>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 rounded border border-amber-100">{r.oldMedicalRecordNo}</span>
          </div>
        )}
      </div>
    )},
    { key: 'name', label: 'Identitas Pasien', render: (r) => (
      <div className="flex items-center gap-3 py-1">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white shadow-md ${r.gender === 'F' ? 'bg-gradient-to-br from-rose-400 to-rose-600' : 'bg-gradient-to-br from-blue-400 to-blue-600'}`}>
          {r.name.charAt(0)}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-black text-gray-900 tracking-tight leading-tight">{r.name}</span>
            {r.patientType && (
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border ${
                r.patientType === 'Poli Gigi' 
                  ? 'bg-cyan-50 text-cyan-600 border-cyan-100 shadow-sm' 
                  : 'bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm'
              }`}>
                {r.patientType}
              </span>
            )}
            {r.id === updatedId && (
              <span className="text-[9px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-lg animate-pulse shadow-sm shadow-amber-200">
                BARU SAJA DIUPDATE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{r.gender === 'M' ? 'L' : 'P'} • {r.dateOfBirth ? calculateAge(r.dateOfBirth) : (r.age ? `${r.age} Thn` : '-')}</span>
             {r.identityNumber && (
               <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                 NIK: {r.identityNumber}
               </span>
             )}
             {r.familyHeadName && (
               <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                 <FiUser className="w-2.5 h-2.5" /> KK: {r.familyHeadName}
               </span>
             )}
          </div>
        </div>
      </div>
    )},
    { key: 'address', label: 'Alamat', mobileHide: true, render: (r) => (
      <span className="text-[10px] text-gray-400 font-medium line-clamp-2 max-w-[200px]">
        {r.address || <span className="text-gray-200 italic">Tidak ada alamat</span>}
      </span>
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
        <p className="text-sm text-gray-400 max-w-md">Maaf, halaman Database Pasien hanya dapat diakses oleh Admin, Dokter, dan Staff.</p>
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
      >
        <Link 
          href="/admin/master/patients/import"
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all active:scale-95 shadow-sm mr-2"
        >
          <FiFileText className="w-4 h-4" />
          <span>Import Excel</span>
        </Link>
      </PageHeader>
      
      <DataTable
        data={data} columns={columns} loading={loading}
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="Cari nama, RM, Alamat, No. HP, KTP, Nama KK, atau BPJS..."
        onEdit={openEdit} onDelete={handleDelete} onMerge={openMerge}
        onView={(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') ? openHistory : undefined}
        emptyText="Belum ada data pasien terdaftar."
        page={page}
        totalPages={meta.totalPages}
        onPageChange={setPage}
        extraFilters={
          <select
            value={patientTypeFilter}
            onChange={(e) => setPatientTypeFilter(e.target.value)}
            className="text-xs font-bold bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/5 text-gray-700 outline-none cursor-pointer shadow-sm hover:border-gray-300 transition-all"
          >
            <option value="Semua">Semua Poli</option>
            <option value="Poli Umum">Poli Umum</option>
            <option value="Poli Gigi">Poli Gigi</option>
          </select>
        }
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

                  <div className="space-y-2 md:col-span-1">
                    <label className="text-[11px] font-medium text-slate-500 flex justify-between items-center">
                      <span>ID Lama / Old RM (Opsional)</span>
                    </label>
                    <input 
                      value={form.oldMedicalRecordNo || ''} 
                      onChange={(e) => setForm(p => ({...p, oldMedicalRecordNo: e.target.value}))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono font-medium" 
                      placeholder="RM Lama / Manual..."
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

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-medium text-slate-500">NIK / No. KTP</label>
                    <input 
                      type="text" 
                      value={form.identityNumber || ''} 
                      onChange={(e) => setForm(p => ({...p, identityNumber: e.target.value, identityType: 'KTP'}))} 
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all font-mono" 
                      placeholder="Masukkan 16 digit NIK..."
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
                    <label className="text-[11px] font-medium text-slate-500">Tanggal Lahir (Hari-Bulan-Tahun)</label>
                    <input 
                      type="text" 
                      value={form.dateOfBirth || ''} 
                      onChange={(e) => handleDateChange(e.target.value)}
                      placeholder="DD-MM-YYYY"
                      maxLength={10}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all font-mono" 
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-medium text-slate-500">Tipe / Kategori Pasien</label>
                    <div className="flex gap-1 p-1 bg-slate-50 rounded-md border border-slate-200">
                      {['Poli Umum', 'Poli Gigi'].map(type => (
                        <button 
                          key={type} type="button" 
                          onClick={() => setForm(p => ({ ...p, patientType: type }))}
                          className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${form.patientType === type ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700 bg-white/40'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-medium text-slate-500">Karyawan Perusahaan (Corporate Partner)</label>
                    <select 
                      value={form.corporatePartnerId || ''} 
                      onChange={(e) => setForm(p => ({...p, corporatePartnerId: e.target.value}))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    >
                      <option value="">-- Bukan Pasien Perusahaan --</option>
                      {corporatePartners.map(cp => (
                        <option key={cp.id} value={cp.id}>{cp.name}</option>
                      ))}
                    </select>
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

      <MergePatientDialog
        isOpen={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        targetPatient={mergeTarget}
        onSuccess={() => {
          fetchData()
          setUpdatedId(mergeTarget?.id || null)
          setTimeout(() => setUpdatedId(null), 8000)
        }}
      />

      <PatientHistoryDialog
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        patientId={historyPatientId}
      />
    </div>
  )
}
