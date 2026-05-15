'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiPlus, FiSave, FiCheck, FiX, FiSearch, FiTrash2, FiShoppingBag, FiPrinter } from 'react-icons/fi'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'react-hot-toast'
import api from '@/lib/api'

interface Product {
  id: string
  productCode: string
  productName: string
  sellingPrice: number
  unit: string
}

interface Stock {
  id: string
  productId: string
  batchId?: string
  onHandQty: number
  product: Product
  batch?: {
    batchNumber: string
    expiryDate: string
  }
}

interface PurchaseItem {
  productId: string
  batchId?: string | null
  productName: string
  batchNumber?: string
  quantity: number
  unitPrice: number
  subtotal: number
}

interface Purchase {
  id: string
  purchaseNo: string
  employeeName: string
  purchaseDate: string
  status: string
  notes: string
  totalAmount: number
  discount: number
  items: any[]
}

export default function PembelianKaryawanPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Form state
  const [employeeName, setEmployeeName] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [discount, setDiscount] = useState<number>(0)
  const [editId, setEditId] = useState<string | null>(null)
  
  // Stock selection state
  const [stocks, setStocks] = useState<Stock[]>([])
  const [stockSearch, setStockSearch] = useState('')
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [qtyToAdd, setQtyToAdd] = useState<number>(1)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  useEffect(() => {
    fetchPurchases()
    fetchStocks()
  }, [])

  const fetchPurchases = async () => {
    try {
      setLoading(true)
      const res = await api.get('/direct-purchases')
      setPurchases(res.data.data)
    } catch (error: any) {
      toast.error('Gagal mengambil data pembelian')
    } finally {
      setLoading(false)
    }
  }

  const fetchStocks = async () => {
    try {
      const res = await api.get('/inventory/stocks')
      // The API returns the array directly in res.data, not res.data.data
      const stocksData = Array.isArray(res.data) ? res.data : (res.data.data || []);
      // Only keep stocks with > 0 quantity
      const availableStocks = stocksData.filter((s: Stock) => s.onHandQty > 0)
      setStocks(availableStocks)
    } catch (error: any) {
      console.error('Error fetching stocks:', error)
    }
  }

  const handleAddItem = () => {
    if (!selectedStock) return
    if (qtyToAdd <= 0) {
      toast.error('Jumlah harus lebih dari 0')
      return
    }
    if (qtyToAdd > selectedStock.onHandQty) {
      toast.error('Jumlah melebihi stok yang tersedia')
      return
    }

    // Check if item already exists in the cart
    const existingIndex = items.findIndex(i => 
      i.productId === selectedStock.productId && i.batchId === selectedStock.batchId
    )

    if (existingIndex >= 0) {
      const newItems = [...items]
      const newQty = newItems[existingIndex].quantity + qtyToAdd
      if (newQty > selectedStock.onHandQty) {
        toast.error('Total jumlah melebihi stok yang tersedia')
        return
      }
      newItems[existingIndex].quantity = newQty
      newItems[existingIndex].subtotal = newQty * newItems[existingIndex].unitPrice
      setItems(newItems)
    } else {
      setItems([...items, {
        productId: selectedStock.productId,
        batchId: selectedStock.batchId || null,
        productName: selectedStock.product.productName,
        batchNumber: selectedStock.batch?.batchNumber,
        quantity: qtyToAdd,
        unitPrice: selectedStock.product.sellingPrice || 0,
        subtotal: qtyToAdd * (selectedStock.product.sellingPrice || 0)
      }])
    }

    // Reset selection
    setSelectedStock(null)
    setStockSearch('')
    setQtyToAdd(1)
    setIsDropdownOpen(false)
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...items]
    newItems.splice(index, 1)
    setItems(newItems)
  }

  const handleSaveDraft = async () => {
    if (!employeeName.trim()) {
      toast.error('Nama karyawan harus diisi')
      return
    }
    if (items.length === 0) {
      toast.error('Pilih minimal 1 obat')
      return
    }

    try {
      setSubmitting(true)
      const payload = {
        employeeName,
        notes,
        items,
        discount
      }

      if (editId) {
        await api.put(`/direct-purchases/${editId}`, payload)
        toast.success('Pembelian berhasil diperbarui')
      } else {
        await api.post('/direct-purchases', payload)
        toast.success('Pembelian berhasil disimpan sebagai draft')
      }
      
      setIsModalOpen(false)
      resetForm()
      fetchPurchases()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menyimpan pembelian')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePosting = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin memposting pembelian ini? Stok akan dikurangi dan tidak dapat dibatalkan.')) return

    try {
      setLoading(true)
      await api.post(`/direct-purchases/${id}/post`)
      toast.success('Pembelian berhasil diposting')
      fetchPurchases()
      fetchStocks() // Refresh stocks since they were reduced
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal memposting pembelian')
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmployeeName('')
    setNotes('')
    setItems([])
    setDiscount(0)
    setEditId(null)
    setSelectedStock(null)
    setStockSearch('')
    setQtyToAdd(1)
  }

  const handlePrintInvoice = (purchase: Purchase) => {
    const doc = new jsPDF()
    
    // Header
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text("INVOICE PENJUALAN", 105, 20, { align: "center" })
    
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(`No. Invoice : ${purchase.purchaseNo}`, 14, 35)
    doc.text(`Tanggal     : ${new Date(purchase.purchaseDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 14, 41)
    
    doc.text(`Pelanggan : ${purchase.employeeName} (Karyawan)`, 130, 35)
    doc.text(`Status    : ${purchase.status === 'POSTED' ? 'LUNAS' : 'DRAFT'}`, 130, 41)

    // Table
    const tableColumn = ["No", "Nama Obat", "Batch", "Qty", "Harga Satuan", "Subtotal"]
    const tableRows: any[] = []

    purchase.items.forEach((item, index) => {
      const itemData = [
        index + 1,
        item.product?.productName || "Obat",
        item.batch?.batchNumber || "-",
        item.quantity,
        `Rp ${item.unitPrice.toLocaleString('id-ID')}`,
        `Rp ${item.subtotal.toLocaleString('id-ID')}`
      ]
      tableRows.push(itemData)
    })

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo-600 to match primary
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      }
    })

    const finalY = (doc as any).lastAutoTable.finalY || 50

    // Summary
    const subtotal = purchase.items.reduce((sum: number, i: any) => sum + i.subtotal, 0)
    const discountAmount = purchase.discount || 0
    
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(`Subtotal :`, 130, finalY + 10)
    doc.text(`Rp ${subtotal.toLocaleString('id-ID')}`, 196, finalY + 10, { align: 'right' })
    
    doc.text(`Diskon   :`, 130, finalY + 16)
    doc.text(`Rp ${discountAmount.toLocaleString('id-ID')}`, 196, finalY + 16, { align: 'right' })

    doc.setFont("helvetica", "bold")
    doc.text(`TOTAL BAYAR :`, 130, finalY + 24)
    doc.text(`Rp ${purchase.totalAmount.toLocaleString('id-ID')}`, 196, finalY + 24, { align: 'right' })

    // Footer
    doc.setFont("helvetica", "italic")
    doc.setFontSize(9)
    doc.text("Terima kasih atas pembelian Anda.", 105, finalY + 40, { align: "center" })

    // Save
    doc.save(`Invoice_${purchase.purchaseNo}.pdf`)
  }

  const handleEdit = (purchase: Purchase) => {
    setEditId(purchase.id)
    setEmployeeName(purchase.employeeName)
    setNotes(purchase.notes || '')
    setDiscount(purchase.discount || 0)
    setItems(purchase.items.map((i: any) => ({
      productId: i.productId,
      batchId: i.batchId,
      productName: i.product?.productName || 'Unknown Product',
      batchNumber: i.batch?.batchNumber,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.subtotal
    })))
    setIsModalOpen(true)
  }

  const filteredStocks = stocks.filter(s => 
    s.product.productName.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.product.productCode.toLowerCase().includes(stockSearch.toLowerCase())
  ).slice(0, 50) // Show up to 50 matches for dropdown

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
  const grandTotal = Math.max(0, subtotal - discount)

  return (
    <div className="p-6 w-full mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <FiShoppingBag className="text-primary" /> Pembelian Obat Karyawan
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Catat dan kelola pembelian obat langsung untuk karyawan internal</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-primary text-white px-4 py-2.5 rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <FiPlus /> Tambah Pembelian
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-600 font-semibold">
              <tr>
                <th className="px-6 py-4">No. Transaksi</th>
                <th className="px-6 py-4">Tanggal & Keterangan</th>
                <th className="px-6 py-4">Karyawan</th>
                <th className="px-6 py-4 text-right">Rincian Pembayaran</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Memuat data...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 font-medium">
                    Belum ada data pembelian
                  </td>
                </tr>
              ) : (
                purchases.map(purchase => (
                  <tr key={purchase.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">{purchase.purchaseNo}</td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 font-medium">
                        {new Date(purchase.purchaseDate).toLocaleDateString('id-ID', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                      {purchase.notes && (
                        <div className="text-xs text-gray-500 mt-1 italic max-w-[200px] truncate" title={purchase.notes}>
                          "{purchase.notes}"
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{purchase.employeeName}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end gap-1 text-xs">
                        {(purchase.discount || 0) > 0 && (
                          <>
                            <div className="text-gray-500">
                              Subtotal: Rp {(purchase.totalAmount + (purchase.discount || 0)).toLocaleString('id-ID')}
                            </div>
                            <div className="text-red-500 font-medium">
                              Diskon: -Rp {(purchase.discount || 0).toLocaleString('id-ID')}
                            </div>
                          </>
                        )}
                        <div className="text-gray-900 font-black text-sm">
                          Total: Rp {purchase.totalAmount.toLocaleString('id-ID')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        purchase.status === 'POSTED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {purchase.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex justify-center gap-2">
                      {purchase.status === 'DRAFT' ? (
                        <>
                          <button
                            onClick={() => handleEdit(purchase)}
                            className="bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white p-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm border border-blue-200 hover:border-transparent group"
                            title="Edit Draft"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button
                            onClick={() => handlePosting(purchase.id)}
                            className="bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white p-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm border border-emerald-200 hover:border-transparent group"
                            title="Posting & Kurangi Stok"
                          >
                            <FiCheck className="w-4 h-4" /> 
                            <span className="text-xs font-bold truncate transition-all overflow-hidden max-w-[0px] group-hover:max-w-[60px] opacity-0 group-hover:opacity-100 whitespace-nowrap">Posting</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-400 text-xs font-medium italic mt-2 mr-2">Selesai</span>
                          <button
                            onClick={() => handlePrintInvoice(purchase)}
                            className="bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white p-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm border border-indigo-200 hover:border-transparent group"
                            title="Cetak Invoice (PDF)"
                          >
                            <FiPrinter className="w-4 h-4" />
                            <span className="text-xs font-bold truncate transition-all overflow-hidden max-w-[0px] group-hover:max-w-[100px] opacity-0 group-hover:opacity-100 whitespace-nowrap">Cetak Struk</span>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-black text-gray-900">{editId ? 'Edit Pembelian' : 'Buat Pembelian Baru'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Nama Karyawan <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="Ketik nama karyawan..."
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Keterangan</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Opsional..."
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50/50 space-y-4">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <FiSearch className="text-gray-400" /> Pilih Obat dari Stok
                  </h3>
                  
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                      <div className="relative">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={stockSearch}
                          onFocus={() => setIsDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                          onChange={(e) => {
                            setStockSearch(e.target.value);
                            setSelectedStock(null);
                            setIsDropdownOpen(true);
                          }}
                          placeholder="Cari atau pilih obat dari list..."
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </div>
                      
                      {/* Search Results Dropdown */}
                      {isDropdownOpen && !selectedStock && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto overflow-hidden custom-scrollbar">
                          {filteredStocks.length > 0 ? (
                            filteredStocks.map(stock => (
                              <button
                                key={stock.id}
                                onClick={() => {
                                  setSelectedStock(stock);
                                  setStockSearch(stock.product.productName);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                              >
                                <div className="font-bold text-sm text-gray-900">{stock.product.productName}</div>
                                <div className="text-xs text-gray-500 mt-1 flex gap-3">
                                  <span>Tersedia: <span className="font-bold text-green-600">{stock.onHandQty} {stock.product.unit}</span></span>
                                  <span>Harga: <span className="font-bold">Rp {(stock.product.sellingPrice || 0).toLocaleString('id-ID')}</span></span>
                                  {stock.batch && <span>Batch: {stock.batch.batchNumber}</span>}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-500">Obat tidak ditemukan / stok kosong.</div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="w-32">
                      <input
                        type="number"
                        min="1"
                        value={qtyToAdd}
                        onChange={(e) => setQtyToAdd(parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                      />
                    </div>
                    <button
                      onClick={handleAddItem}
                      disabled={!selectedStock}
                      className="bg-indigo-600 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      Tambahkan
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-black text-gray-900 border-b border-gray-100 pb-2">Daftar Belanjaan</h3>
                  {items.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm font-medium border-2 border-dashed border-gray-100 rounded-2xl">
                      Belum ada obat yang ditambahkan.
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3">Nama Obat</th>
                            <th className="px-4 py-3">Batch</th>
                            <th className="px-4 py-3 text-right">Harga</th>
                            <th className="px-4 py-3 text-center">Qty</th>
                            <th className="px-4 py-3 text-right">Subtotal</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 font-bold text-gray-900">{item.productName}</td>
                              <td className="px-4 py-3 text-gray-500">{item.batchNumber || '-'}</td>
                              <td className="px-4 py-3 text-right">Rp {item.unitPrice.toLocaleString('id-ID')}</td>
                              <td className="px-4 py-3 text-center font-bold">{item.quantity}</td>
                              <td className="px-4 py-3 text-right font-bold text-indigo-600">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-600">Subtotal:</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">Rp {subtotal.toLocaleString('id-ID')}</td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-600 flex items-center justify-end gap-3">
                              Diskon (Rp):
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                max={subtotal}
                                value={discount || ''}
                                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                className="w-32 px-3 py-1.5 text-right rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm font-bold"
                                placeholder="0"
                              />
                            </td>
                            <td></td>
                          </tr>
                          <tr className="border-t border-gray-200">
                            <td colSpan={4} className="px-4 py-3 text-right font-black text-gray-900">Total Pembayaran:</td>
                            <td className="px-4 py-3 text-right font-black text-primary text-base">Rp {grandTotal.toLocaleString('id-ID')}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-end gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={submitting}
                  className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : <><FiSave /> Simpan sebagai Draft</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
