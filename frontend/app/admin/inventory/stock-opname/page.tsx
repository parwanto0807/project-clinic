'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, Search, Plus, Trash2, Save, CheckCircle, 
  Printer, History, AlertTriangle, ArrowRight, Loader2,
  FileText, TrendingUp, TrendingDown, DollarSign, ChevronDown,
  XCircle, Boxes, Phone, Mail, MapPin, Download, X
} from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { Card } from '@/components/ui/Card'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface OpnameItem {
  id: string
  productId: string
  batchId: string | null
  systemQty: number
  physicalQty: number
  diffQty: number
  unitPrice: number
  subtotal: number
  notes: string | null
  product: {
    productName: string
    productCode: string
  }
  batch?: {
    batchNumber: string
  } | null
}

interface OpnameSession {
  id: string
  branchId: string
  status: 'DRAFT' | 'COMPLETED'
  totalValue: number
  items: OpnameItem[]
  createdAt: string
}

export default function StockOpnamePage() {
  const { activeClinicId, user } = useAuthStore()
  const isAllowed = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const [session, setSession] = useState<OpnameSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const activeClinic = useMemo(() => {
    return user?.clinics?.find(c => c.id === activeClinicId)
  }, [user, activeClinicId])
  
  // Search & Input state
  const [searchProducts, setSearchProducts] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [physicalQty, setPhysicalQty] = useState<number>(0)
  const [unitPrice, setUnitPrice] = useState<number>(0)
  const [notes, setNotes] = useState('')
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [printMode, setPrintMode] = useState<'full' | 'blank'>('full')
  const router = useRouter()

  useEffect(() => {
    if (activeClinicId) {
      fetchSession()
    }
  }, [activeClinicId])

  const fetchSession = async () => {
    try {
      setIsLoading(true)
      const res = await api.get('inventory/opname/session', {
        params: { branchId: activeClinicId }
      })
      setSession(res.data)
    } catch (error) {
      console.error('Error fetching session:', error)
      toast.error('Gagal memuat sesi opname')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async (val: string, forceAll = false) => {
    setSearchTerm(val)
    if (!forceAll && val.length < 2) {
      setSearchProducts([])
      return
    }
    try {
      const res = await api.get('inventory/opname/products', {
        params: { branchId: activeClinicId, search: val }
      })
      setSearchProducts(res.data)
    } catch (error) {
      console.error('Search error:', error)
    }
  }

  const toggleShowAll = () => {
    if (searchProducts.length > 0) {
      setSearchProducts([])
    } else {
      handleSearch('', true)
    }
  }

  const selectProduct = (stock: any) => {
    setSelectedProduct(stock)
    setPhysicalQty(stock.onHandQty) // Default to current system qty
    setUnitPrice(stock.purchasePrice || 0) // Default to current system price
    setSearchTerm('')
    setSearchProducts([])
  }

  const addItem = async () => {
    if (!session || !selectedProduct) return
    try {
      setIsSubmitting(true)
      await api.post('inventory/opname/item', {
        sessionId: session.id,
        productId: selectedProduct.productId,
        masterProductId: selectedProduct.masterProductId,
        batchId: selectedProduct.batchId,
        physicalQty,
        unitPrice,
        notes,
        branchId: activeClinicId
      })
      toast.success('Item berhasil ditambahkan ke draft')
      setSelectedProduct(null)
      setPhysicalQty(0)
      setUnitPrice(0)
      setNotes('')
      fetchSession()
    } catch (error) {
      toast.error('Gagal menambahkan item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteItem = async (itemId: string) => {
    try {
      await api.delete(`inventory/opname/item/${itemId}`)
      toast.success('Item dihapus')
      fetchSession()
    } catch (error) {
    }
  }

  const finalizeOpname = async () => {
    if (!session) return
    if (session.items.length === 0) {
      toast.error('Daftar item masih kosong')
      return
    }

    if (!confirm('Apakah Anda yakin ingin melakukan rekonsiliasi stok? Tindakan ini akan langsung merubah data stok sistem.')) {
      return
    }

    try {
      setIsSubmitting(true)
      await api.post('inventory/opname/finalize', {
        sessionId: session.id
      })
      toast.success('Rekonsiliasi stok berhasil!')
      fetchSession()
    } catch (error) {
      toast.error('Gagal melakukan rekonsiliasi')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBulkLoad = async () => {
    if (!session) return
    
    if (!confirm('Muat seluruh stok sistem saat ini ke dalam draft? Item yang sudah ada tidak akan diduplikasi.')) {
      return
    }

    try {
      setIsSubmitting(true)
      const res = await api.post('inventory/opname/bulk-load', {
        sessionId: session.id,
        branchId: activeClinicId
      })
      setSession(res.data)
      toast.success('Seluruh stok sistem berhasil dimuat ke draft')
    } catch (error) {
      console.error('Bulk load error:', error)
      toast.error('Gagal memuat stok sistem')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateQty = async (item: OpnameItem, newQty: number) => {
    if (!session) return
    try {
      const updatedItems = session.items.map(i => {
        if (i.id === item.id) {
          const diff = newQty - i.systemQty
          return { 
            ...i, 
            physicalQty: newQty, 
            diffQty: diff,
            subtotal: newQty * i.unitPrice
          }
        }
        return i
      })
      const newTotal = updatedItems.reduce((sum, i) => sum + i.subtotal, 0)
      setSession({ ...session, items: updatedItems, totalValue: newTotal })

      await api.post('/inventory/opname/item', {
        sessionId: session.id,
        productId: item.productId,
        batchId: item.batchId,
        physicalQty: newQty,
        branchId: activeClinicId
      })
    } catch (error) {
      toast.error('Gagal memperbarui jumlah')
      fetchSession()
    }
  }

  const handleUpdatePrice = async (item: OpnameItem, newPrice: number) => {
    if (!session) return
    try {
      const updatedItems = session.items.map(i => {
        if (i.id === item.id) {
          return { 
            ...i, 
            unitPrice: newPrice, 
            subtotal: i.physicalQty * newPrice
          }
        }
        return i
      })
      const newTotal = updatedItems.reduce((sum, i) => sum + i.subtotal, 0)
      setSession({ ...session, items: updatedItems, totalValue: newTotal })

      await api.post('/inventory/opname/item', {
        sessionId: session.id,
        productId: item.productId,
        batchId: item.batchId,
        physicalQty: item.physicalQty,
        unitPrice: newPrice,
        branchId: activeClinicId
      })
    } catch (error) {
      toast.error('Gagal memperbarui harga')
      fetchSession()
    }
  }

  const handleUpdateNotes = async (item: OpnameItem, newNotes: string) => {
    if (!session) return
    try {
      const updatedItems = session.items.map(i => {
        if (i.id === item.id) {
          return { ...i, notes: newNotes }
        }
        return i
      })
      setSession({ ...session, items: updatedItems })

      await api.post('/inventory/opname/item', {
        sessionId: session.id,
        productId: item.productId,
        batchId: item.batchId,
        physicalQty: item.physicalQty,
        unitPrice: item.unitPrice,
        notes: newNotes,
        branchId: activeClinicId
      })
    } catch (error) {
      toast.error('Gagal memperbarui catatan')
      fetchSession()
    }
  }

  const handleSaveDraft = () => {
    toast.success('Data Berhasil simpan ke Draft dan tggu Proses Reconsiliasi', {
      position: 'top-center',
      duration: 4000
    })
  }

  const handleCancelSession = async () => {
    try {
      if (!session) return
      setIsSubmitting(true)
      await api.post('inventory/opname/cancel', {
        sessionId: session.id,
        reason: cancelReason
      })
      toast.success('Sesi opname dibatalkan')
      setShowCancelDialog(false)
      setCancelReason('')
      fetchSession()
    } catch (error) {
      toast.error('Gagal membatalakan sesi')
    } finally {
      setIsSubmitting(false)
    }
  }

  const generatePDF = (mode: 'full' | 'blank' = 'full') => {
    if (!session) return
    
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    })

    const clinicName = activeClinic?.name || 'Klinik Yasfina Pusat'
    const clinicAddress = activeClinic?.address || 'JL. CONTOH NO. 123, JAKARTA'
    const docNo = `SO-${session.id.substring(0, 8).toUpperCase()}`
    const docDate = format(new Date(), 'dd MMMM yyyy', { locale: id })

    // --- Header ---
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(30, 41, 59)
    doc.text(clinicName, 15, 20)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(clinicAddress, 15, 25)

    // --- Title ---
    doc.setFont('helvetica', 'bolditalic')
    doc.setFontSize(22)
    doc.setTextColor(59, 130, 246)
    doc.text(mode === 'blank' ? 'LEMBAR KERJA OPNAME' : 'LAPORAN STOCK OPNAME', 195, 20, { align: 'right' })
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 41, 59)
    doc.text(`${docNo} | ${docDate}`, 195, 26, { align: 'right' })

    doc.setDrawColor(219, 234, 254)
    doc.setLineWidth(0.5)
    doc.line(15, 32, 195, 32)

    // --- Table Configuration ---
    let head = mode === 'blank' 
      ? [['NO', 'DESKRIPSI BARANG / BATCH', 'STOK SISTEM', 'STOK FISIK (ISI DI SINI)', 'CATATAN / KONDISI']]
      : [['NO', 'DESKRIPSI BARANG', 'SISTEM', 'FISIK', 'HARGA SATUAN BELI TERBARU', 'SUBTOTAL']]

    const tableData = [...session.items]
      .sort((a, b) => a.product.productName.localeCompare(b.product.productName, undefined, { sensitivity: 'base' }))
      .map((item, idx) => {
        if (mode === 'blank') {
          return [
            idx + 1,
            `${item.product.productName.toUpperCase()}\nKODE: ${item.product.productCode}${item.batch ? ' • BN: ' + item.batch.batchNumber : ''}`,
            item.systemQty,
            '', // Blank for physical
            ''  // Blank for notes
          ]
        }
        return [
          idx + 1,
          { content: `${item.product.productName.toUpperCase()}\nKODE: ${item.product.productCode}${item.batch ? ' • BN: ' + item.batch.batchNumber : ''}`, styles: { fontStyle: 'bold' as const } },
          item.systemQty,
          item.physicalQty,
          `Rp ${item.unitPrice.toLocaleString('id-ID')}`,
          { content: `Rp ${item.subtotal.toLocaleString('id-ID')}`, styles: { fontStyle: 'bold' as const, halign: 'right' as const } }
        ]
      })

    autoTable(doc, {
      startY: 38,
      head: head,
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: mode === 'blank' ? [100, 116, 139] : [59, 130, 246], 
        textColor: 255, 
        fontSize: mode === 'blank' ? 8 : 9, 
        fontStyle: 'bold' as const,
        halign: 'center' as const
      },
      styles: { 
        fontSize: mode === 'blank' ? 7 : 8,
        cellPadding: mode === 'blank' ? 2 : 4,
        valign: 'middle' as const
      },
      columnStyles: mode === 'blank' ? {
        0: { halign: 'center' as const, cellWidth: 10 },
        2: { halign: 'center' as const, cellWidth: 25 },
        3: { halign: 'center' as const, cellWidth: 40 },
        4: { halign: 'left' as const, cellWidth: 40 }
      } : {
        0: { halign: 'center' as const, cellWidth: 10 },
        2: { halign: 'center' as const, cellWidth: 20 },
        3: { halign: 'center' as const, cellWidth: 20 },
        4: { halign: 'center' as const, cellWidth: 35 },
        5: { halign: 'right' as const, cellWidth: 35 }
      }
    })

    if (mode === 'full') {
      const finalY = (doc as any).lastAutoTable.finalY + 10
      doc.setFillColor(59, 130, 246)
      doc.roundedRect(135, finalY, 60, 10, 2, 2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.text(`TOTAL: Rp ${session.totalValue.toLocaleString('id-ID')}`, 190, finalY + 6, { align: 'right' })
    }

    // Signatures
    const sigY = (doc as any).lastAutoTable.finalY + (mode === 'blank' ? 20 : 35)
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(mode === 'blank' ? 'PETUGAS GUDANG,' : 'DISETUJUI OLEH,', 45, sigY - 10, { align: 'center' })
    doc.text(mode === 'blank' ? 'KEPALA UNIT,' : 'DIBUAT OLEH,', 155, sigY - 10, { align: 'center' })
    doc.setDrawColor(30, 41, 59)
    doc.line(20, sigY + 5, 70, sigY + 5)
    doc.line(130, sigY + 5, 180, sigY + 5)

    return doc
  }

  const handleCetak = (mode: 'full' | 'blank' = 'full') => {
    const doc = generatePDF(mode)
    if (!doc) return
    const blob = doc.output('bloburl')
    setPdfUrl(blob.toString())
    setShowPdfModal(true)
  }

  const downloadPDF = () => {
    // We can detect mode from PDF URL or just regenerate full for download
    // For simplicity, let's just save the current preview
    const docNo = `SO-${session?.id.substring(0, 8).toUpperCase()}`
    const doc = generatePDF(pdfUrl.includes('LEMBAR%20KERJA') ? 'blank' : 'full')
    doc?.save(`StockOpname_${docNo}.pdf`)
  }

  const printSheet = () => {
    handleCetak('full')
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen opacity-50">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Menyiapkan Sesi Opname...</p>
      </div>
    )
  }

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 uppercase mb-2">Akses Terbatas</h2>
        <p className="text-gray-500 font-bold text-sm max-w-md uppercase tracking-widest leading-relaxed">
          Mohon maaf, Anda tidak memiliki izin untuk mengakses halaman Rekonsiliasi Stok Opname. 
          Silakan hubungi administrator jika Anda memerlukan akses ini.
        </p>
        <button 
          onClick={() => router.push('/admin/inventory')}
          className="mt-8 px-8 py-4 bg-gray-900 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all"
        >
          Kembali ke Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen pb-40">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 print:hidden">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3 uppercase">
            <div className="p-2.5 bg-primary/10 rounded-2xl">
              <History className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            </div>
            Stock Opname
          </h1>
          <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 leading-none">Rekonsiliasi stok fisik vs sistem</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleBulkLoad}
            disabled={isSubmitting || !session}
            className="flex-1 sm:flex-none px-5 py-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Boxes className="w-4 h-4" />
            Muat Semua Stok
          </button>
          <button 
            onClick={() => handleCetak('blank')}
            className="px-5 py-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all text-blue-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
            title="Cetak Lembar Kerja Kosong untuk gudang"
          >
            <FileText className="w-4 h-4" />
            Lembar Kerja
          </button>
          <button 
            onClick={printSheet}
            className="px-5 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Cetak Hasil
          </button>
          <button 
            onClick={fetchSession}
            className="p-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 text-gray-400 active:scale-95 shadow-sm"
          >
            <Loader2 className={`w-5 h-5 ${isSubmitting ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
        {/* Left Side: Input Form - Mobile Optimized */}
        <div className="xl:col-span-4 space-y-6 print:hidden order-2 xl:order-1">
          <Card className="p-5 md:p-6 border-none shadow-xl shadow-gray-200/40 bg-white rounded-[2rem]">
            <div className="flex items-center gap-2 mb-6">
               <Plus className="w-5 h-5 text-primary" />
               <h3 className="text-sm md:text-base font-black text-gray-900 uppercase">Input Item Opname</h3>
            </div>

            <div className="space-y-6">
              {/* Product Search */}
              <div className="relative">
                <label className="block text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Cari Produk</label>
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text"
                    placeholder="Nama atau kode barang..."
                    className="w-full pl-12 pr-12 py-3.5 md:py-4 bg-gray-50/50 border border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm"
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                  <button 
                    onClick={toggleShowAll}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-400"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${searchProducts.length > 0 ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <AnimatePresence>
                  {searchProducts.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[50] max-h-64 overflow-y-auto overflow-hidden divide-y divide-gray-50"
                    >
                      {searchProducts.map((stock, index) => (
                        <button
                          key={index} onClick={() => selectProduct(stock)}
                          className="w-full px-4 py-4 flex items-center justify-between hover:bg-primary/5 transition-colors text-left"
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm font-black text-gray-900 truncate uppercase">{stock.productName}</p>
                            <div className="flex items-center gap-2 mt-1">
                               <span className="text-[9px] font-bold text-gray-400 uppercase">{stock.productCode}</span>
                               {stock.batchNumber && <span className="text-[9px] font-black text-indigo-400 italic">BN: {stock.batchNumber}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                             <p className="text-sm font-black text-primary">{stock.onHandQty}</p>
                             <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Sistem</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Selected Product Form */}
              <AnimatePresence mode="wait">
                {selectedProduct ? (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    key={selectedProduct.productId}
                    className="p-5 bg-primary/5 rounded-[2rem] border border-primary/10 space-y-5"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mb-1">Terpilih</p>
                        <h4 className="font-black text-gray-900 leading-tight uppercase truncate">{selectedProduct.productName}</h4>
                      </div>
                      <button onClick={() => setSelectedProduct(null)} className="p-2 bg-white rounded-xl text-red-500 shadow-sm active:scale-90">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                       <div className="p-3 bg-white rounded-2xl border border-primary/10">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Stok Sistem</p>
                          <p className="text-xl font-black text-gray-900">{selectedProduct.onHandQty}</p>
                       </div>
                       <div className="p-3 bg-white rounded-2xl border border-primary/10">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Harga Beli</p>
                          <p className="text-sm font-black text-primary truncate">Rp {selectedProduct.purchasePrice?.toLocaleString('id-ID')}</p>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                             <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1 text-center">Fisik Aktu</label>
                             <input 
                               type="number"
                               className="w-full px-4 py-4 bg-white border-2 border-primary/20 rounded-2xl focus:ring-4 focus:ring-primary/5 outline-none text-center font-black text-lg text-primary"
                               value={physicalQty}
                               onChange={(e) => setPhysicalQty(Number(e.target.value))}
                             />
                          </div>
                          <div>
                             <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1 text-center">Harga Baru</label>
                             <input 
                               type="number"
                               className="w-full px-4 py-4 bg-white border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 outline-none text-center font-black text-base text-gray-900"
                               value={unitPrice}
                               onChange={(e) => setUnitPrice(Number(e.target.value))}
                             />
                          </div>
                       </div>
                       
                       <textarea 
                          rows={2}
                          placeholder="Catatan penyesuaian..."
                          className="w-full px-4 py-3 bg-white border-none rounded-2xl focus:ring-4 focus:ring-primary/5 outline-none font-bold text-xs text-gray-600 placeholder:text-gray-300"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                       />
                       
                       <button 
                        disabled={isSubmitting}
                        onClick={addItem}
                        className="w-full py-5 bg-primary text-white font-black rounded-3xl shadow-xl shadow-primary/20 hover:shadow-2xl transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                       >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Simpan ke Draft
                       </button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="py-16 text-center border-2 border-dashed border-gray-100 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                       <Package className="w-8 h-8 text-gray-200" />
                    </div>
                    <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Pilih Item untuk Check Stok</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </Card>

          {/* Floating Mobile Summary or Context Summary */}
          {session && session.items.length > 0 && (
            <Card className="p-6 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 overflow-hidden relative">
               <div className="absolute top-[-20px] right-[-20px] opacity-10">
                  <DollarSign className="w-32 h-32" />
               </div>
               
               <div className="relative z-10 space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-white/10">
                    <div>
                       <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Total Draft</p>
                       <h2 className="text-2xl font-black">{session.items.length} Item</h2>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Total Nilai Fisik</p>
                       <h2 className="text-xl font-black">Rp {session.totalValue.toLocaleString('id-ID')}</h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button onClick={finalizeOpname} disabled={isSubmitting} className="w-full py-5 bg-emerald-500 text-white font-black rounded-[2rem] shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50">
                       <CheckCircle className="w-6 h-6" /> FINALISASI & REKONSILIASI PENUH
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                       <button onClick={handleSaveDraft} className="py-3 bg-indigo-500 text-white font-black rounded-2xl hover:bg-indigo-400 transition-all flex items-center justify-center gap-2 text-[10px] tracking-widest">
                          <Save className="w-4 h-4" /> DRAFT
                       </button>
                       <button onClick={() => setShowCancelDialog(true)} className="py-3 bg-red-500 text-white font-black rounded-2xl hover:bg-red-600 transition-all flex items-center justify-center gap-2 text-[10px] tracking-widest">
                          <Trash2 className="w-4 h-4" /> BATAL
                       </button>
                    </div>
                  </div>
 
                  {/* Table Footer Summary */}
                  {session && session.items.length > 0 && (
                    <div className="px-8 py-6 bg-gray-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                       <div className="flex items-center gap-6">
                          <div>
                             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Item</p>
                             <p className="text-lg font-black">{session.items.length} SKU</p>
                          </div>
                          <div className="w-px h-8 bg-white/10 hidden md:block"></div>
                          <div>
                             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status Draft</p>
                             <p className="text-sm font-black text-amber-400 uppercase">Belum Rekonsiliasi</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Nilai Fisik (Harga Total)</p>
                          <p className="text-2xl font-black text-primary">Rp {session.totalValue.toLocaleString('id-ID')}</p>
                       </div>
                    </div>
                  )}
               </div>
            </Card>
          )}
        </div>

        {/* Right Side: Draft List - Responsive cards/table */}
        <div className="xl:col-span-8 order-1 xl:order-2">
           <Card className="bg-white rounded-[3rem] border-none shadow-2xl shadow-gray-200/40 overflow-hidden flex flex-col min-h-[500px]">
              <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                 <div>
                    <h2 className="text-lg md:text-xl font-black text-gray-900 leading-tight">Review Rekonsiliasi</h2>
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">Periksa perbedaan stok sebelum finalisasi</p>
                 </div>
                 <div className="px-4 py-1 bg-amber-100 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest hidden md:block">
                    Draft Aktif
                 </div>
              </div>

              <div className="flex-1 overflow-x-auto min-h-0">
                 {/* Desktop Only Table Header */}
                 <div className="hidden lg:grid grid-cols-12 gap-4 px-8 py-4 bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <div className="col-span-3">Informasi Produk</div>
                    <div className="col-span-1 text-center">Sistem</div>
                    <div className="col-span-1 text-center">Fisik</div>
                    <div className="col-span-1 text-center">Selisih</div>
                    <div className="col-span-4 text-center whitespace-normal break-words">Harga Satuan Beli Terbaru</div>
                    <div className="col-span-2 text-right">Total Fisik</div>
                 </div>

                 {/* List Container */}
                 <div className="divide-y divide-gray-50 max-h-[700px] overflow-y-auto custom-scrollbar">
                    {session?.items.length === 0 ? (
                      <div className="py-32 text-center opacity-30">
                         <Boxes className="w-16 h-16 mx-auto mb-4" />
                         <p className="text-xs font-black uppercase tracking-[0.3em]">Draft Kosong</p>
                      </div>
                    ) : (
                      [...(session?.items || [])]
                        .sort((a, b) => a.product.productName.localeCompare(b.product.productName, undefined, { sensitivity: 'base' }))
                        .map((item) => {
                        const isLoss = item.diffQty < 0
                        const isGain = item.diffQty > 0
                        return (
                          <div key={item.id}>
                            {/* Desktop Row View */}
                            <div className="hidden lg:block hover:bg-gray-50/30 transition-colors">
                               <div className="grid grid-cols-12 gap-4 items-center px-8 py-5">
                                 <div className="col-span-3 flex items-center gap-4">
                                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center font-black text-gray-400">
                                       {item.product.productName[0]}
                                    </div>
                                    <div className="min-w-0">
                                       <p className="font-black text-gray-900 leading-none truncate uppercase text-sm">{item.product.productName}</p>
                                       <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase truncate">{item.product.productCode} {item.batch && `• BN: ${item.batch.batchNumber}`}</p>
                                    </div>
                                 </div>
                                 <div className="col-span-1 text-center font-black text-gray-400">{item.systemQty}</div>
                                 <div className="col-span-1 flex justify-center">
                                    <input type="number" className="w-16 px-2 py-1 bg-gray-50 rounded-lg text-center font-black text-gray-900 outline-none" value={item.physicalQty} onChange={(e) => handleUpdateQty(item, Number(e.target.value))} />
                                  </div>
                                 <div className="col-span-1 flex flex-col items-center">
                                    <div className={`flex items-center gap-1 font-black leading-none ${isLoss ? 'text-red-600' : isGain ? 'text-green-600' : 'text-gray-300'}`}>
                                       {isGain ? '+' : ''}{item.diffQty}
                                    </div>
                                 </div>
                                 <div className="col-span-4 flex justify-center">
                                    <div className="relative w-full max-w-[180px]">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">Rp</span>
                                      <input type="number" className="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-xl text-right font-black text-gray-900 outline-none text-sm border border-transparent focus:border-primary/20 transition-all" value={item.unitPrice} onChange={(e) => handleUpdatePrice(item, Number(e.target.value))} />
                                    </div>
                                 </div>
                                 <div className="col-span-2 flex items-center justify-end gap-3">
                                    <span className="font-black text-primary text-sm whitespace-nowrap">Rp {item.subtotal.toLocaleString('id-ID')}</span>
                                    <button onClick={() => deleteItem(item.id)} className="p-2 text-gray-200 hover:text-red-500 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>
                                 </div>
                               </div>
                               {/* Row Note Edit */}
                               <div className="px-8 pb-4 flex items-center gap-3">
                                  <div className="w-6 h-px bg-gray-100"></div>
                                  <FileText className="w-3 h-3 text-gray-300" />
                                  <input 
                                    type="text" 
                                    placeholder="Tambahkan catatan untuk item ini..." 
                                    className="flex-1 bg-transparent border-none outline-none text-[10px] font-bold text-gray-400 placeholder:text-gray-200 italic" 
                                    value={item.notes || ''} 
                                    onChange={(e) => handleUpdateNotes(item, e.target.value)} 
                                  />
                               </div>
                            </div>

                            {/* Mobile Card View */}
                            <div className="lg:hidden p-5 space-y-4">
                               <div className="flex justify-between items-start">
                                  <div className="flex gap-3">
                                     <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center font-black text-indigo-400">{item.product.productName[0]}</div>
                                     <div className="min-w-0">
                                        <h4 className="text-sm font-black text-gray-900 uppercase truncate leading-tight w-40">{item.product.productName}</h4>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">{item.product.productCode}</p>
                                     </div>
                                  </div>
                                  <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${isLoss ? 'bg-red-50 text-red-600' : isGain ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                                     {isLoss ? 'Loss' : isGain ? 'Gain' : 'Bal'} {item.diffQty !== 0 && `(${item.diffQty})`}
                                  </div>
                               </div>
                               
                               <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-2xl">
                                  <div className="space-y-1">
                                     <p className="text-[8px] font-black text-gray-400 uppercase text-center">Fisik Aktu</p>
                                     <input type="number" className="w-full bg-white px-2 py-2 rounded-xl text-center font-black text-sm text-primary outline-none" value={item.physicalQty} onChange={(e) => handleUpdateQty(item, Number(e.target.value))} />
                                  </div>
                                  <div className="space-y-1">
                                     <p className="text-[8px] font-black text-gray-400 uppercase text-center">Har Satuan Beli</p>
                                     <input type="number" className="w-full bg-white px-2 py-2 rounded-xl text-center font-black text-gray-900 text-sm outline-none" value={item.unitPrice} onChange={(e) => handleUpdatePrice(item, Number(e.target.value))} />
                                  </div>
                               </div>
                               
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-gray-400 uppercase px-1">Catatan</p>
                                  <input 
                                    type="text" 
                                    placeholder="Tambahkan catatan..." 
                                    className="w-full bg-gray-50 px-4 py-2 rounded-xl text-[10px] font-bold text-gray-600 outline-none" 
                                    value={item.notes || ''} 
                                    onChange={(e) => handleUpdateNotes(item, e.target.value)} 
                                  />
                               </div>
                               
                               <div className="flex justify-between items-center">
                                  <div>
                                     <p className="text-[8px] font-black text-gray-400 uppercase leading-none mb-1">Subtotal Fisik</p>
                                     <p className="text-sm font-black text-gray-900">Rp {item.subtotal.toLocaleString('id-ID')}</p>
                                  </div>
                                  <button onClick={() => deleteItem(item.id)} className="p-3 bg-red-50 rounded-xl text-red-400 active:scale-90"><Trash2 className="w-4 h-4" /></button>
                               </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                 </div>
              </div>
           </Card>
        </div>
      </div>

      {/* Cancel Dialog Modal */}
      <AnimatePresence>
        {/* PDF Preview Modal */}
        {showPdfModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPdfModal(false)} className="absolute inset-0 bg-gray-900/80 backdrop-blur-md" />
             <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="bg-white rounded-[3rem] w-full max-w-5xl h-[90vh] relative z-10 shadow-2xl overflow-hidden flex flex-col">
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-white">
                         <FileText className="w-6 h-6" />
                      </div>
                      <div>
                         <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Dokumen Preview</h3>
                         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SO-{session?.id.substring(0, 8).toUpperCase()}</p>
                      </div>
                   </div>
                   <div className="flex gap-3">
                      <button onClick={downloadPDF} className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-black rounded-2xl shadow-xl shadow-gray-900/20 active:scale-95 uppercase text-[10px] tracking-widest">
                         <Download className="w-4 h-4" /> Download PDF
                      </button>
                      <button onClick={() => setShowPdfModal(false)} className="p-3 bg-gray-100 text-gray-400 hover:text-gray-900 rounded-2xl transition-colors">
                         <X className="w-6 h-6" />
                      </button>
                   </div>
                </div>

                {/* PDF Viewer */}
                <div className="flex-1 bg-gray-200">
                   <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Preview" />
                </div>
             </motion.div>
          </div>
        )}

        {showCancelDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCancelDialog(false)} className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
             <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-[2.5rem] p-8 w-full max-w-md relative z-10 shadow-2xl">
                <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center mb-6">
                   <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Batalkan Sesi?</h3>
                <p className="text-gray-500 font-bold text-sm mb-6 uppercase tracking-widest leading-relaxed">Seluruh draft item yang telah Anda masukkan akan dihapus permanen.</p>
                <textarea rows={3} placeholder="Alasan pembatalan..." className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-4 focus:ring-red-500/10 outline-none font-bold text-sm mb-6" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={() => setShowCancelDialog(false)} className="py-4 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase text-[10px] tracking-widest">Tutup</button>
                   <button onClick={handleCancelSession} disabled={isSubmitting} className="py-4 bg-red-500 text-white font-black rounded-2xl shadow-xl shadow-red-500/20 active:scale-95 uppercase text-[10px] tracking-widest disabled:opacity-50">Batalkan Sesi</button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Professional PO-Style Print Header */}
      <div className="hidden print:block mb-10">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900 leading-none">{activeClinic?.name || 'Klinik Yasfina Pusat'}</h1>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                <MapPin className="w-3 h-3 text-blue-500" /> {activeClinic?.address || 'JL. CONTOH NO. 123, JAKARTA'}
              </p>
              <p className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                <Phone className="w-3 h-3 text-blue-500" /> {activeClinic?.phone || '021-12345678'}
              </p>
              <p className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                <Mail className="w-3 h-3 text-blue-500" /> {activeClinic?.email || 'INFO@KLINIKTERPADU.COM'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-black text-blue-500 uppercase tracking-tight mb-2 italic">Stock Opname</h2>
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Nomor Dokumen</p>
              <p className="text-lg font-black text-slate-900">SO-{session?.id.substring(0, 8).toUpperCase()}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Tanggal</p>
              <p className="text-sm font-black text-slate-900">{format(new Date(), 'dd MMMM yyyy', { locale: id })}</p>
            </div>
          </div>
        </div>

        <div className="border-t-2 border-blue-100 mb-8"></div>

        <div className="grid grid-cols-2 gap-6 mb-10">
           <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Penanggung Jawab</p>
              <h3 className="text-sm font-black text-slate-900 uppercase mb-1">{user?.name}</h3>
              <p className="text-[10px] font-bold text-slate-400 leading-relaxed italic">
                Verifikasi stok dilakukan secara berkala untuk memastikan integritas data persediaan klinik.
              </p>
           </div>
           <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Lokasi Unit (Shipping)</p>
              <h3 className="text-sm font-black text-slate-900 uppercase mb-1">{activeClinic?.name || 'Klinik Yasfina Pusat'}</h3>
              <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase italic">
                {activeClinic?.address || 'JL. CONTOH NO. 123, JAKARTA'}
              </p>
           </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 1cm 1.5cm; }
          .print\\:hidden, button, input, textarea, .xl\\:col-span-4 { display: none !important; }
          .xl\\:col-span-8 { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .bg-white { border: none !important; box-shadow: none !important; }
          .rounded-\\[3rem\\], .rounded-3xl, .rounded-2xl { border-radius: 1rem !important; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #3b82f6 !important; color: white !important; padding: 12px 10px !important; font-size: 11px !important; font-weight: 900 !important; text-transform: uppercase; border: none !important; white-space: normal !important; word-wrap: break-word !important; }
          td { padding: 12px 10px !important; font-size: 10px !important; border-bottom: 1px solid #f1f5f9 !important; vertical-align: middle; }
          
          .hidden.print\\:block { display: block !important; }
          .hidden.print\\:grid { display: grid !important; }
          .lg\\:grid { display: none !important; }
          .print-table { display: table !important; width: 100%; border: 1px solid #f1f5f9; border-radius: 12px; overflow: hidden; }
          
          .total-box { 
            background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%) !important; 
            color: white !important; 
            padding: 16px 24px !important; 
            border-radius: 16px !important;
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .signature-line { border-top: 3px solid #1e293b !important; margin-top: 60px; width: 280px; margin-left: auto; margin-right: auto; }
        }
      `}</style>

      {/* Professional PO-Style Table */}
      <table className="hidden print-table">
        <thead>
          <tr>
            <th className="text-left w-12">No</th>
            <th className="text-left">Deskripsi Barang</th>
            <th className="text-center">Sistem</th>
            <th className="text-center">Fisik</th>
            <th className="text-center whitespace-normal break-words">Harga Satuan Beli Terbaru</th>
            <th className="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {[...(session?.items || [])]
            .sort((a, b) => a.product.productName.localeCompare(b.product.productName, undefined, { sensitivity: 'base' }))
            .map((item, idx) => (
            <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-slate-50/30'}>
              <td className="text-center font-bold text-slate-400">{idx + 1}</td>
              <td>
                <div className="font-black text-slate-900 uppercase text-xs">{item.product.productName}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic">
                  {item.product.productCode} {item.batch && `• BATCH: ${item.batch.batchNumber}`}
                </div>
              </td>
              <td className="text-center font-bold text-slate-300">{item.systemQty}</td>
              <td className="text-center font-black text-slate-900">{item.physicalQty}</td>
              <td className="text-center font-bold text-slate-500">Rp {item.unitPrice.toLocaleString('id-ID')}</td>
              <td className="text-right font-black text-slate-900">Rp {item.subtotal.toLocaleString('id-ID')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Section like PO */}
      <div className="hidden print:block w-[400px] ml-auto mt-6 space-y-2">
         <div className="flex justify-between text-[11px] font-bold text-slate-400 px-6">
            <span>SUBTOTAL FISIK</span>
            <span>Rp {session?.totalValue.toLocaleString('id-ID')}</span>
         </div>
         <div className="flex justify-between text-[11px] font-bold text-slate-400 px-6">
            <span>PAJAK / PPN (0%)</span>
            <span>RP 0</span>
         </div>
         <div className="total-box">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/80">Total Nilai Fisik</span>
            <span className="text-xl font-black">Rp {session?.totalValue.toLocaleString('id-ID')}</span>
         </div>
      </div>

      {/* Signature Section like PO */}
      <div className="hidden print:grid grid-cols-2 gap-20 mt-24 text-center">
        <div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-20">Disetujui Oleh,</p>
           <div className="signature-line"></div>
           <p className="text-xs font-black text-slate-900 uppercase mt-4">( Manager Operasional )</p>
        </div>
        <div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-20">Dibuat Oleh,</p>
           <div className="signature-line"></div>
           <p className="text-xs font-black text-slate-900 uppercase mt-4">( Bagian Logistik & Aset )</p>
        </div>
      </div>

      <div className="hidden print:block mt-20 text-center border-t border-slate-100 pt-6">
         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic leading-relaxed max-w-3xl mx-auto">
            Catatan: Laporan ini dihasilkan secara elektronik oleh sistem klinik terpusat. 
            Hasil perhitungan fisik telah diverifikasi oleh tim logistik dan aset. 
            Segala bentuk perbedaan stok telah dilakukan rekonsiliasi sesuai prosedur.
         </p>
      </div>
    </div>
  )
}
