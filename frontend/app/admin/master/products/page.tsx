'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { FiShoppingBag, FiAlertCircle, FiPlus, FiHash, FiImage, FiUpload, FiX, FiCamera, FiShield } from 'react-icons/fi'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/useAuthStore'
import DataTable, { Column } from '@/components/admin/master/DataTable'
import PageHeader from '@/components/admin/master/PageHeader'
import MasterModal from '@/components/admin/master/MasterModal'
import { StatusBadge, CategoryBadge } from '@/components/admin/master/StatusBadge'
import DeleteConfirmModal from '@/components/admin/master/DeleteConfirmModal'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Tabs } from '@/components/ui/Tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Layout, Truck, DollarSign, Package, AlertCircle } from 'lucide-react'

const EMPTY = { 
  masterProductId: '', 
  productCode: '', 
  sku: '', 
  productName: '', 
  purchaseUnit: 'box',
  storageUnit: 'pcs',
  usedUnit: 'tablet',
  purchasePrice: 0, 
  sellingPrice: 0, 
  clinicIds: [] as string[],
  description: '',
  isActive: true,
  image: null as File | string | null,
  brand: '',
  productType: '',
  manufacturer: '',
  defaultUnit: 'pcs',
  supplier: '',
  minStock: 0,
  reorderPoint: 0,
  qtyPerPurchaseUnit: 1,
  qtyPerStorageUnit: 1
}

type ProductCategory = { id: string; categoryName: string; description?: string }
type ProductMaster = { id: string; masterName: string; masterCode: string; description?: string }
type Clinic = { id: string; name: string; code: string }

type ProductInventory = {
  id: string;
  masterCode: string;
  masterName: string;
  image?: string;
  description?: string;
  isActive: boolean;
  productCategory?: ProductCategory;
  medicine?: {
    image?: string;
    medicineName: string;
  };
  brand?: string;
  productType?: string;
  manufacturer?: string;
  sku?: string;
  defaultUnit?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  minStock?: number;
  reorderPoint?: number;
  purchaseUnit?: string;
  storageUnit?: string;
  usedUnit?: string;
  supplier?: string;
  totalStock?: number;
  stock?: number;
  unit?: string;
  qtyPerPurchaseUnit?: number;
  qtyPerStorageUnit?: number;
  products?: any[];
}

export default function ProductsPage() {
  const { activeClinicId, user } = useAuthStore()
  const [data, setData] = useState<ProductInventory[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'info' | 'logistics' | 'pricing'>('info')
  const [catFilter, setCatFilter] = useState('')
  const [clinicFilter, setClinicFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProductInventory | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<ProductInventory | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  
  const isPusat = user?.clinics?.some(c => c.isMain) || user?.role === 'SUPER_ADMIN'
  const hidePrices = !['SUPER_ADMIN', 'ADMIN', 'ACCOUNTING'].includes(user?.role as string)

  const [debouncedSearch, setDebouncedSearch] = useState(search)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { 
        page, 
        limit: 10,
        search: debouncedSearch,
        categoryId: catFilter,
        clinicId: clinicFilter
      }
      const res = await api.get('/master/products', { params })
      const resData = res.data
      const products = Array.isArray(resData) ? resData : (resData?.data || resData?.products || [])
      setData(products)
      setTotalPages(resData?.meta?.totalPages || resData?.totalPages || 1)
    } catch (e) {
      console.error('Fetch data error:', e)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, catFilter, clinicFilter])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const fetchDependencies = useCallback(async () => {
    try {
      const [catRes, clinicRes] = await Promise.all([
        api.get('/master/product-categories'),
        api.get('/master/clinics')
      ])
      setCategories(catRes.data)
      setClinics(clinicRes.data)
    } catch { }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchDependencies() }, [fetchDependencies])

  // Security Guard: Only Super Admin and Admin can access this page
  if (!loading && user && !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <FiShield className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Akses Terbatas</h1>
        <p className="text-gray-500 text-sm max-w-md mb-8 font-medium">
          Maaf, halaman Master Produk hanya dapat diakses oleh Super Admin dan Administrator. 
          Silakan hubungi IT Support jika Anda memerlukan akses ini.
        </p>
        <Link href="/admin" className="px-8 py-3 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-gray-200 active:scale-95 transition-all">
          Kembali ke Dashboard
        </Link>
      </div>
    )
  }

  const openAdd = () => { 
    setEditing(null)
    setForm({ ...EMPTY, clinicIds: [activeClinicId].filter(Boolean) as string[] })
    setImagePreview(null)
    setError('')
    setModalOpen(true) 
  }

  const openEdit = (r: ProductInventory | any) => {
    setEditing(r)
    setForm({ 
      ...EMPTY,
      masterProductId: r.categoryId || '',
      productCode: r.masterCode,
      productName: r.masterName,
      description: r.description || '',
      isActive: r.isActive,
      image: getProductImage(r),
      brand: r.brand || '',
      productType: r.productType || '',
      manufacturer: r.manufacturer || '',
      sku: r.sku || '',
      defaultUnit: r.defaultUnit || 'pcs',
      purchaseUnit: r.purchaseUnit || 'box',
      storageUnit: r.storageUnit || 'pcs',
      usedUnit: r.usedUnit || 'tablet',
      supplier: r.supplier || '',
      purchasePrice: r.purchasePrice || 0,
      sellingPrice: r.sellingPrice || 0,
      minStock: r.minStock || 0,
      reorderPoint: r.reorderPoint || 0,
      qtyPerPurchaseUnit: r.qtyPerPurchaseUnit || 1,
      qtyPerStorageUnit: r.qtyPerStorageUnit || 1
    })
    const img = getProductImage(r)
    setImagePreview(img ? (process.env.NEXT_PUBLIC_API_URL || '') + img : null)
    setError('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.productName || !form.sku) { setError('Nama produk dan SKU wajib diisi'); return }
    setSaving(true); setError('')
    try {
      const formData = new FormData()
      const payload: any = {
        masterName: form.productName,
        masterCode: form.productCode,
        sku: form.sku,
        categoryId: form.masterProductId,
        description: form.description,
        brand: form.brand,
        productType: form.productType,
        manufacturer: form.manufacturer,
        defaultUnit: form.usedUnit || form.defaultUnit || 'pcs',
        purchaseUnit: form.purchaseUnit,
        storageUnit: form.storageUnit,
        usedUnit: form.usedUnit,
        supplier: form.supplier,
        purchasePrice: form.purchasePrice,
        sellingPrice: form.sellingPrice,
        minStock: form.minStock,
        reorderPoint: form.reorderPoint,
        qtyPerPurchaseUnit: form.qtyPerPurchaseUnit,
        qtyPerStorageUnit: form.qtyPerStorageUnit,
        isActive: form.isActive
      }

      Object.entries(payload).forEach(([key, value]) => {
        formData.append(key, String(value))
      })

      if (form.image instanceof File) {
        formData.append('image', form.image)
      }

      if (editing) {
        await api.put(`/master/products/${editing.id}`, formData, { 
          headers: { 'Content-Type': 'multipart/form-data' } 
        })
      } else {
        await api.post('/master/products', formData, { 
          headers: { 'Content-Type': 'multipart/form-data' } 
        })
      }

      setModalOpen(false); fetchData()
      toast.success(editing ? 'Master produk diperbarui' : 'Master produk ditambahkan')
    } catch (e: any) { setError(e.response?.data?.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = (r: ProductInventory) => {
    setItemToDelete(r)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete) return
    setDeleteModalOpen(false)
    setIsDeleting(true)
    try { 
      await api.delete(`/master/products/${itemToDelete.id}`)
      fetchData() 
      toast.success('Master produk berhasil dihapus')
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal menghapus master produk')
    } finally {
      setIsDeleting(false)
      setItemToDelete(null)
    }
  }

  const getProductImage = (r: ProductInventory) => {
    const img = r.image || r.medicine?.image
    if (!img || img === 'null' || img === 'undefined' || img.includes('undefined') || img.includes('/null')) return null
    return img
  }

  const columns: Column<ProductInventory>[] = [
    { key: 'image', label: '', render: (r: ProductInventory) => {
      const img = getProductImage(r)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
      return (
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center shadow-sm">
          {img ? (
            <img src={`${apiBase}${img}`} alt={r.masterName} className="w-full h-full object-cover" />
          ) : (
            <FiImage className="w-6 h-6 text-gray-200" />
          )}
        </div>
      )
    }},
    { key: 'masterName', label: 'Produk & Identitas', render: (r: ProductInventory) => (
      <div className="flex flex-col space-y-0.5">
        <p className="text-xs md:text-sm font-black text-gray-900 uppercase truncate max-w-[200px] md:max-w-none">{r.masterName}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
           <span className="text-[9px] font-black text-primary px-1.5 py-0.5 bg-primary/5 rounded border border-primary/10 tracking-widest">{r.masterCode || 'AUTO'}</span>
           <span className="text-[9px] font-bold text-gray-400 uppercase hidden md:inline">{r.brand}</span>
           {r.productType && (
             <span className="text-[9px] font-bold text-gray-500 uppercase hidden md:inline border-l pl-1.5 border-gray-200 ml-0.5">
               {r.productType}
             </span>
           )}
        </div>
      </div>
    )},
    { key: 'units', label: 'LOGISTIK & UNIT', mobileHide: true, render: (r: ProductInventory) => (
      <div className="flex flex-col space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black text-gray-800 uppercase">{r.purchaseUnit || 'UNIT'}</span>
          <FiHash className="w-2.5 h-2.5 text-gray-300" />
          <span className="text-[10px] font-bold text-gray-500">{r.qtyPerPurchaseUnit || 1} {r.unit}</span>
        </div>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Satuan Jual: {r.unit}</p>
      </div>
    )},
    { key: 'stock', label: 'STOK', render: (r: ProductInventory) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-black ${(r.stock ?? 0) <= (r.minStock || 0) ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>{r.stock ?? 0}</p>
            <span className="text-[9px] font-bold text-gray-400 uppercase">{r.unit}</span>
          </div>
          {(r.minStock || 0) > 0 && (
            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-tight">Min: {r.minStock}</p>
          )}
        </div>
    )},
    { key: 'pricing', label: 'FINANSIAL', mobileHide: true, render: (r: ProductInventory) => {
      const margin = r.purchasePrice && r.sellingPrice && r.qtyPerPurchaseUnit 
        ? ((r.sellingPrice - (r.purchasePrice / r.qtyPerPurchaseUnit)) / (r.purchasePrice / r.qtyPerPurchaseUnit) * 100)
        : 0
      
      return (
        <div className="flex flex-col">
            <p className="text-[11px] font-black text-gray-900 leading-tight">
              {hidePrices ? '••••••' : `Rp ${(r.sellingPrice || 0).toLocaleString('id-ID')}`}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
               <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">SKU: {r.sku}</span>
               {!hidePrices && margin > 0 && (
                 <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">+{margin.toFixed(0)}%</span>
               )}
            </div>
        </div>
      )
    }},
    { key: 'category', label: 'KATEGORI', mobileHide: true, render: (r: ProductInventory) => <CategoryBadge category={r.productCategory?.categoryName || 'Common'} /> },
    { key: 'isActive', label: 'STATUS', mobileHide: true, render: (r: ProductInventory) => <StatusBadge active={r.isActive} /> },
  ]

  return (
    <div className="p-3 md:p-0">
      <PageHeader
        title="Master Produk" subtitle="Katalog produk & inventaris global"
        icon={<FiShoppingBag className="w-5 h-5 md:w-6 md:h-6" />}
        onAdd={openAdd} addLabel="Master Baru" count={data.length}
      />
      <DataTable
        data={data} columns={columns} loading={loading}
        groupBy={(r: ProductInventory) => r.productCategory?.categoryName || 'Uncategorized'}
        searchValue={search} onSearchChange={(v) => { setSearch(v); setPage(1) }}
        onEdit={openEdit} onDelete={handleDelete}
        page={page} totalPages={totalPages} onPageChange={setPage}
        extraFilters={
          <div className="flex gap-2">
            <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1) }}
              className="text-[10px] md:text-[11px] font-black bg-white border border-gray-100 rounded-xl px-4 py-2.5 outline-none uppercase tracking-widest shadow-sm">
              <option value="">Semua Kategori</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
            </select>
          </div>
        }
      />

      <MasterModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Produk' : 'Master Baru'} size="2xl">
        <div className="space-y-6">
          <Tabs 
            tabs={[
              { id: 'info', label: 'Identitas', icon: <Package className="w-4 h-4" /> },
              { id: 'logistics', label: 'Logistik', icon: <Truck className="w-4 h-4" /> },
              { id: 'pricing', label: 'Harga & Stok', icon: <DollarSign className="w-4 h-4" /> }
            ].filter(t => t.id !== 'pricing' || !hidePrices)}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as any)}
          />

          <div className="min-h-[450px]">
            <AnimatePresence mode="wait">
              {activeTab === 'info' && (
                <motion.div key="info" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-8 space-y-4">
                       <div className="space-y-2">
                          <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Nama Produk *</Label>
                          <Input 
                            value={form.productName || ''} 
                            onChange={(e) => setForm(p => ({...p, productName: e.target.value}))} 
                            placeholder="Contoh: Amoxicillin 500mg"
                            className="h-12 text-sm font-bold"
                          />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Kode Master</Label>
                              <div className="relative group">
                                <Input 
                                  value={form.productCode || ''} 
                                  onChange={(e) => setForm(p => ({...p, productCode: e.target.value}))} 
                                  className="h-12 bg-gray-50 font-mono text-primary font-black uppercase tracking-widest pr-12"
                                  placeholder="AUTO-GEN"
                                />
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const timestamp = Date.now().toString().slice(-6)
                                    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
                                    setForm(p => ({ ...p, productCode: `PM-${timestamp}${random}` }))
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-primary/10 text-primary rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white"
                                  title="Generate Code"
                                >
                                  <FiHash className="w-3 h-3" />
                                </button>
                              </div>
                           </div>
                          <div className="space-y-2">
                             <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">SKU / Barcode *</Label>
                             <Input 
                               value={form.sku || ''} 
                               onChange={(e) => setForm(p => ({...p, sku: e.target.value}))} 
                               className="h-12 font-bold"
                               placeholder="Scan barcode atau isi SKU"
                             />
                          </div>
                       </div>
                    </div>
                    
                    <div className="md:col-span-4 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl p-4 bg-gray-50/50 hover:bg-gray-50 transition-all cursor-pointer relative overflow-hidden group">
                      {imagePreview ? (
                        <div className="relative w-full h-full min-h-[140px]">
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-2xl" />
                          <button 
                            onClick={() => { setImagePreview(null); setForm(p => ({ ...p, image: null })) }}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur shadow-sm rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-all"
                          >
                            <FiX className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center space-y-2 cursor-pointer w-full h-full py-8">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                            <FiCamera className="w-5 h-5 text-gray-400" />
                          </div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unggah Foto</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                setForm(p => ({ ...p, image: file }))
                                setImagePreview(URL.createObjectURL(file))
                              }
                            }} 
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Kategori *</Label>
                        <select 
                          value={form.masterProductId || ''} 
                          onChange={(e) => setForm(p => ({ ...p, masterProductId: e.target.value }))} 
                          className="flex h-12 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 font-bold uppercase"
                        >
                           <option value="">Pilih Kategori</option>
                           {categories.map(c => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
                        </select>
                     </div>
                     <div className="space-y-2">
                        <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Jenis / Sub-Kategori</Label>
                        <Input 
                          value={form.productType || ''} 
                          onChange={(e) => setForm(p => ({...p, productType: e.target.value}))} 
                          placeholder="Contoh: Obat Lambung"
                          className="h-12 text-sm font-bold"
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Brand</Label>
                        <Input value={form.brand || ''} onChange={(e) => setForm(p => ({...p, brand: e.target.value}))} className="h-12 font-bold" />
                     </div>
                     <div className="space-y-2">
                        <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Vendor</Label>
                        <Input value={form.manufacturer || ''} onChange={(e) => setForm(p => ({...p, manufacturer: e.target.value}))} className="h-12 font-bold" />
                     </div>
                  </div>

                  <div className="space-y-2">
                     <Label className="text-gray-500 uppercase tracking-wider text-[10px] font-black">Deskripsi Singkat</Label>
                     <textarea 
                        value={form.description || ''} 
                        onChange={(e) => setForm(p => ({...p, description: e.target.value}))} 
                        rows={3} 
                        className="flex w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-medium text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary outline-none" 
                     />
                  </div>
                </motion.div>
              )}

              {activeTab === 'logistics' && (
                <motion.div key="logistics" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <Card>
                        <CardHeader>
                          <CardTitle className="text-xs uppercase tracking-widest flex items-center gap-2">
                            <FiHash className="text-primary" /> Mekanisme Satuan
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Beli (Ex: Box/Lusin)</Label>
                              <div className="flex gap-2">
                                <Input value={form.purchaseUnit || ''} onChange={(e) => setForm(p => ({...p, purchaseUnit: e.target.value}))} className="h-11 font-black uppercase flex-1" />
                                <div className="flex items-center gap-2 bg-gray-50 px-3 rounded-lg border border-gray-100">
                                   <span className="text-[9px] font-black text-gray-400">ISI</span>
                                   <input 
                                     type="number" 
                                     value={form.qtyPerPurchaseUnit || ''} 
                                     onChange={(e) => setForm(p => ({...p, qtyPerPurchaseUnit: parseFloat(e.target.value)}))}
                                     className="w-12 bg-transparent border-none text-center font-black text-xs focus:outline-none"
                                   />
                                   <span className="text-[9px] font-black text-gray-400 uppercase">{form.usedUnit || 'UNIT'}</span>
                                </div>
                              </div>
                           </div>
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Simpan (Ex: Pcs/Btl)</Label>
                              <div className="flex gap-2">
                                <Input value={form.storageUnit || ''} onChange={(e) => setForm(p => ({...p, storageUnit: e.target.value}))} className="h-11 font-black uppercase flex-1" />
                                <div className="flex items-center gap-2 bg-gray-50 px-3 rounded-lg border border-gray-100">
                                   <span className="text-[9px] font-black text-gray-400">ISI</span>
                                   <input 
                                     type="number" 
                                     value={form.qtyPerStorageUnit || ''} 
                                     onChange={(e) => setForm(p => ({...p, qtyPerStorageUnit: parseFloat(e.target.value)}))}
                                     className="w-12 bg-transparent border-none text-center font-black text-xs focus:outline-none"
                                   />
                                   <span className="text-[9px] font-black text-gray-400 uppercase">{form.usedUnit || 'UNIT'}</span>
                                </div>
                              </div>
                           </div>
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black text-primary uppercase tracking-widest">Unit Resep/Gunakan (Satuan Terkecil)</Label>
                              <Input value={form.usedUnit || ''} onChange={(e) => setForm(p => ({...p, usedUnit: e.target.value}))} className="h-11 bg-primary/5 border-primary/20 text-primary font-black uppercase" />
                           </div>
                        </CardContent>
                     </Card>

                     <div className="space-y-4">
                       <div className="bg-primary p-8 rounded-[2.5rem] text-white shadow-xl shadow-primary/10">
                          <Layout className="w-8 h-8 mb-4 opacity-50" />
                          <h4 className="text-sm font-black uppercase tracking-widest leading-none mb-2">Konversi Otomatis</h4>
                          <p className="text-[11px] font-bold text-primary-foreground/70 uppercase tracking-widest leading-relaxed">
                            Pastikan unit resep sesuai dengan unit terkecil yang bisa dikonsumsi pasien. Ini akan digunakan dalam perhitungan resep dokter.
                          </p>
                       </div>
                       
                       <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4 items-start">
                         <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 text-amber-500 shadow-sm">
                           <FiAlertCircle className="w-5 h-5" />
                         </div>
                         <div className="space-y-1">
                           <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Peringatan Konversi</p>
                           <p className="text-[10px] font-bold text-amber-700/70 leading-relaxed uppercase">
                             Perubahan unit setelah produk memiliki transaksi stok dapat menyebabkan diskrepansi data.
                           </p>
                         </div>
                       </div>
                     </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'pricing' && (
                <motion.div key="pricing" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-6">
                        <Card>
                          <CardHeader className="bg-emerald-50/30">
                            <CardTitle className="text-xs uppercase tracking-widest flex items-center gap-2">
                              <DollarSign className="text-emerald-500 w-4 h-4" /> Estimasi Harga
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Harga Beli Est.</Label>
                                  <Input type="number" value={form.purchasePrice ?? 0} onChange={(e) => setForm(p => ({ ...p, purchasePrice: parseFloat(e.target.value) || 0 }))} className="h-11 font-black" />
                               </div>
                               <div className="space-y-2">
                                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Harga Jual Est.</Label>
                                  <Input type="number" value={form.sellingPrice ?? 0} onChange={(e) => setForm(p => ({ ...p, sellingPrice: parseFloat(e.target.value) || 0 }))} className="h-11 text-right bg-emerald-50 text-emerald-600 border-emerald-100 font-black" />
                               </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-rose-100 bg-rose-50/10">
                           <CardContent className="p-6 space-y-4">
                              <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Ambang Batas Stok
                              </h4>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stok Minimum</Label>
                                    <Input type="number" value={form.minStock ?? 0} onChange={(e) => setForm(p => ({ ...p, minStock: parseInt(e.target.value) || 0 }))} className="h-11 font-black text-center text-rose-600 border-rose-100 bg-white" />
                                 </div>
                                 <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Titik Reorder</Label>
                                    <Input type="number" value={form.reorderPoint ?? 0} onChange={(e) => setForm(p => ({ ...p, reorderPoint: parseInt(e.target.value) || 0 }))} className="h-11 font-black text-center text-blue-600 border-blue-100 bg-white" />
                                 </div>
                              </div>
                           </CardContent>
                        </Card>
                      </div>

                      <div className="space-y-6">
                        <Card className="h-full bg-gray-50/50 border-dashed border-2">
                          <CardContent className="flex flex-col justify-center h-full space-y-4">
                             <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary shadow-sm">
                                <FiShoppingBag className="w-6 h-6" />
                             </div>
                             <div className="space-y-2">
                                <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Supplier Prioritas</Label>
                                <Input 
                                  value={form.supplier || ''} 
                                  onChange={(e) => setForm(p => ({ ...p, supplier: e.target.value }))} 
                                  className="h-12 bg-white border-none shadow-sm font-bold" 
                                  placeholder="Ex: Kimia Farma" 
                                />
                             </div>
                             <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed italic">
                               * Supplier ini akan menjadi pilihan default saat membuat Purchase Order baru untuk produk ini.
                             </p>
                          </CardContent>
                        </Card>
                      </div>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col md:flex-row gap-3 pt-6 border-t border-gray-100">
            <button 
              onClick={() => setModalOpen(false)} 
              className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black rounded-2xl uppercase text-[10px] tracking-widest transition-all"
            >
              BATAL
            </button>
            <button 
              onClick={handleSave} 
              disabled={saving} 
              className="flex-1 py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 uppercase text-[10px] tracking-widest active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? 'MENYIMPAN...' : (editing ? 'UPDATE KATALOG MASTER' : 'DAFTARKAN PRODUK BARU')}
            </button>
          </div>
        </div>
      </MasterModal>

      <DeleteConfirmModal
        isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={confirmDelete}
        title="Hapus Master Produk" message="Apakah Anda yakin ingin menghapus produk ini? Tindakan ini tidak dapat dibatalkan." itemName={itemToDelete?.masterName} loading={isDeleting}
      />
    </div>
  )
}
