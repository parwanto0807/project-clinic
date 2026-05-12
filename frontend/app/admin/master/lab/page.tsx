'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { FiActivity, FiAlertCircle, FiRefreshCw, FiInfo } from 'react-icons/fi'
import { HiOutlineBeaker } from 'react-icons/hi'
import DataTable, { Column } from '@/components/admin/master/DataTable'
import PageHeader from '@/components/admin/master/PageHeader'
import MasterModal from '@/components/admin/master/MasterModal'
import { StatusBadge, CategoryBadge } from '@/components/admin/master/StatusBadge'

const EMPTY = { code: '', name: '', category: 'Hematologi', unit: '', normalRangeText: '', minNormal: '', maxNormal: '', price: '', isActive: true }

type LabTest = {
  id: string; code: string; name: string; category: string; unit?: string;
  normalRangeText?: string; minNormal?: number; maxNormal?: number; price: number; isActive: boolean;
}

export default function LabMasterPage() {
  const [data, setData] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LabTest | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/lab/test-masters')
      setData(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openAdd = () => { 
    setEditing(null); 
    setForm(EMPTY); 
    setError(''); 
    setModalOpen(true)
  }
  const openEdit = (r: LabTest) => {
    setEditing(r)
    setForm({ 
      code: r.code, 
      name: r.name, 
      category: r.category, 
      unit: r.unit || '', 
      normalRangeText: r.normalRangeText || '', 
      minNormal: r.minNormal ? String(r.minNormal) : '', 
      maxNormal: r.maxNormal ? String(r.maxNormal) : '', 
      price: String(r.price), 
      isActive: r.isActive 
    })
    setError(''); setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.code || !form.name || !form.category) { 
      setError('Kode, nama, dan kategori wajib diisi')
      return 
    }
    setSaving(true); setError('')
    try {
      const payload = { ...form, price: Number(form.price) }
      if (editing) await api.put(`/lab/test-masters/${editing.id}`, payload)
      else await api.post('/lab/test-masters', payload)
      setModalOpen(false); fetchData()
    } catch (e: any) { setError(e.response?.data?.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = async (r: LabTest) => {
    if (!confirm(`Hapus parameter lab "${r.name}"?`)) return
    try { await api.delete(`/lab/test-masters/${r.id}`); fetchData() } catch { }
  }

  const columns: Column<LabTest>[] = [
    { key: 'code', label: 'Kode', render: (r) => <span className="text-xs font-bold font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">{r.code}</span> },
    { key: 'name', label: 'Nama Parameter', render: (r) => <span className="text-sm font-semibold text-gray-800">{r.name}</span> },
    { key: 'category', label: 'Kategori', render: (r) => <CategoryBadge category={r.category} /> },
    { key: 'unit', label: 'Satuan', render: (r) => <span className="text-xs font-medium text-gray-500">{r.unit || '-'}</span> },
    { key: 'normalRangeText', label: 'Nilai Normal', render: (r) => <span className="text-xs font-medium text-slate-500 italic">{r.normalRangeText || '-'}</span> },
    { key: 'isActive', label: 'Status', render: (r) => <StatusBadge active={r.isActive} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Master Laboratorium" subtitle="Kelola parameter pemeriksaan, nilai rujukan, dan satuan lab"
        icon={<HiOutlineBeaker className="w-5 h-5 sm:w-6 sm:h-6" />}
        onAdd={openAdd} addLabel="Tambah Parameter" count={data.length}
        breadcrumb={['Admin', 'Data Master', 'Laboratorium']}
      />
      
      <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
        <FiInfo className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs font-medium text-amber-800 leading-relaxed">
          <strong>Tip:</strong> Parameter ini digunakan untuk menginput hasil pemeriksaan yang terstruktur. 
          Anda dapat menyamakan nama parameter dengan Nama Layanan (Master Services) agar memudahkan identifikasi.
        </div>
      </div>

      <DataTable
        data={data} columns={columns} loading={loading}
        groupBy={(r) => r.category}
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="Cari kode atau nama parameter..."
        onEdit={openEdit} onDelete={handleDelete}
        emptyText="Belum ada data parameter laboratorium."
      />

      <MasterModal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Parameter Lab' : 'Tambah Parameter Lab'} size="lg">
        <div className="space-y-4">
          {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-medium text-red-700"><FiAlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Nama Parameter *</label>
              <input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} placeholder="cth: Hemoglobin, Glukosa Puasa"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Kode Parameter *</label>
              <input value={form.code} onChange={(e) => setForm(p => ({...p, code: e.target.value}))}
                placeholder="LAB-HB" className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Kategori *</label>
              <select value={form.category} onChange={(e) => setForm(p => ({...p, category: e.target.value}))}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white font-medium">
                <option value="Hematologi">Hematologi</option>
                <option value="Kimia Darah">Kimia Darah</option>
                <option value="Urinalisa">Urinalisa</option>
                <option value="Imunologi">Imunologi</option>
                <option value="Imunoserologi">Imunoserologi</option>
                <option value="Paket Lab">Paket Lab</option>
                <option value="Mikrobiologi">Mikrobiologi</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Satuan</label>
              <input value={form.unit} onChange={(e) => setForm(p => ({...p, unit: e.target.value}))} placeholder="g/dL, mg/dL, %"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Harga (Opsional)</label>
              <input type="number" value={form.price} onChange={(e) => setForm(p => ({...p, price: e.target.value}))}
                placeholder="0" className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Nilai Normal (Teks)</label>
              <input value={form.normalRangeText} onChange={(e) => setForm(p => ({...p, normalRangeText: e.target.value}))} placeholder="cth: 12.0 - 16.0"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Min Normal (Angka)</label>
              <input type="number" value={form.minNormal} onChange={(e) => setForm(p => ({...p, minNormal: e.target.value}))} placeholder="12.0"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Max Normal (Angka)</label>
              <input type="number" value={form.maxNormal} onChange={(e) => setForm(p => ({...p, maxNormal: e.target.value}))} placeholder="16.0"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-primary font-medium" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))} className={`relative w-12 h-6 rounded-full transition-colors ${form.isActive ? 'bg-primary' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-6' : ''}`} />
            </button>
            <span className="text-sm font-semibold text-gray-700">{form.isActive ? 'Aktif' : 'Nonaktif'}</span>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Batal</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-60">{saving ? 'Menyimpan...' : (editing ? 'Simpan' : 'Tambah')}</button>
          </div>
        </div>
      </MasterModal>
    </div>
  )
}
