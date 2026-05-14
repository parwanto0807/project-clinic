'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, AlertTriangle, ArrowUpRight, ArrowDownRight, 
  Search, Filter, RefreshCw, Layers, ShieldAlert,
  History, Box, ChevronRight, EyeOff
} from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store/useAuthStore'
import toast from 'react-hot-toast'
import StockMutationDialog from '@/components/admin/inventory/StockMutationDialog'

interface Stock {
  id: string
  productId: string
  branchId: string
  batchId: string | null
  onHandQty: number
  reservedQty: number
  minStockAlert: number
  product: {
    productName: string
    productCode: string
    isMedicine: boolean
    purchasePrice: number
  }
  batch?: {
    batchNumber: string
    expiryDate: string
    purchasePrice: number
  }
}

export default function InventoryDashboard() {
  const { activeClinicId, user } = useAuthStore()
  const hidePrices = !['SUPER_ADMIN', 'ADMIN', 'ACCOUNTING'].includes(user?.role as string)

  const [stocks, setStocks] = useState<Stock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'medicine' | 'asset'>('all')
  
  // Pagination State
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<any>(null)
  
  // Mutation Dialog State
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [isMutationDialogOpen, setIsMutationDialogOpen] = useState(false)

  const openMutationHistory = (stock: Stock) => {
    setSelectedStock(stock)
    setIsMutationDialogOpen(true)
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const fetchStocks = async () => {
    try {
      if (!activeClinicId) return
      setIsLoading(true)
      const res = await api.get('/inventory/stocks', {
        params: { 
          branchId: activeClinicId,
          page,
          limit: 10,
          search: debouncedSearch
        }
      })
      
      // The API returns paginated data: { data: [], meta: {} }
      if (res.data.meta) {
        setStocks(res.data.data)
        setMeta(res.data.meta)
      } else {
        setStocks(res.data)
        setMeta(null)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      toast.error('Gagal mengambil data stok')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStocks()
  }, [activeClinicId, page, debouncedSearch])

  // Reset to page 1 on search
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const lowStockItems = stocks.filter(s => (s.onHandQty || 0) <= (s.minStockAlert || 0))
  const totalAssetValue = stocks.reduce((sum, s) => {
    const price = s.batch?.purchasePrice || s.product?.purchasePrice || 0;
    return sum + ((s.onHandQty || 0) * price);
  }, 0)

  // Client-side category filtering (The API currently doesn't filter by medicine/asset type)
  const filteredStocks = stocks.filter(s => {
    if (filterType === 'all') return true
    if (filterType === 'medicine') return s.product.isMedicine
    if (filterType === 'asset') return !s.product.isMedicine
    return true
  })

  return (
    <div className="p-3 md:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen pb-32">
      {/* Header Section - Modernized for mobile */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Package className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight uppercase truncate">Stok & Inventaris</h1>
              <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">Manajemen ketersediaan item cabang</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 sm:flex-none py-2 px-4 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col items-end min-w-[140px]">
             <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">Total Nilai Aset</span>
             {hidePrices ? (
               <span className="flex items-center gap-1.5 text-sm font-black text-gray-300">
                 <EyeOff className="w-3.5 h-3.5" />
                 <span className="tracking-[0.3em]">••••••••</span>
               </span>
             ) : (
               <span className="text-sm md:text-base font-black text-primary">Rp {(totalAssetValue || 0).toLocaleString('id-ID')}</span>
             )}
          </div>
          <button 
            onClick={fetchStocks}
            className="p-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all text-gray-400 active:scale-90 shadow-sm"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Modern Low Stock Alert - Professional Carousel style for mobile */}
      {lowStockItems.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-red-500 rounded-3xl p-4 md:p-6 shadow-xl shadow-red-500/20 relative overflow-hidden">
            <div className="absolute right-[-20px] top-[-20px] opacity-10">
              <ShieldAlert className="w-40 h-40 text-white" />
            </div>
            
            <div className="flex items-center gap-2 mb-4 relative z-10">
              <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
              <h2 className="text-xs font-black text-white uppercase tracking-[0.2em]">Peringatan Kritis: {lowStockItems.length} Item</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
              {lowStockItems.slice(0, 4).map((item) => (
                <div key={item.id} className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20">
                  <p className="text-[10px] font-black text-white truncate uppercase">{item.product?.productName}</p>
                  <p className="text-[9px] font-bold text-white/80 uppercase">Sisa: <span className="text-white font-black">{item.onHandQty}</span> / {item.minStockAlert}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Control Bar - Segmented Control & Search */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6 sticky top-20 z-30 lg:relative lg:top-0">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Cari nama produk atau kode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 md:py-4 bg-white border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all text-sm font-bold text-gray-700 shadow-sm"
          />
        </div>
        
        <div className="flex p-1.5 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto no-scrollbar gap-1">
          {['all', 'medicine', 'asset'].map((type) => (
            <button 
              key={type}
              onClick={() => setFilterType(type as any)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                filterType === type 
                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              {type === 'all' ? 'Semua Item' : type === 'medicine' ? 'Kategori Obat' : 'Kategori Aset'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content - Professional Table Grid Transition */}
      <div className="space-y-4">
        {/* Desktop Header - Hidden on Mobile */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50/50 rounded-2xl border border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <div className="col-span-4">Informasi Produk</div>
          <div className="col-span-1 text-center">Tipe</div>
          <div className="col-span-1 text-center">Fisik</div>
          <div className="col-span-1 text-center">Proses</div>
          <div className="col-span-1 text-center text-primary">Avail</div>
          <div className="col-span-2 text-right">{hidePrices ? <EyeOff className="w-3.5 h-3.5 ml-auto text-gray-300" /> : 'Harga Beli'}</div>
          <div className="col-span-2 text-right">{hidePrices ? <EyeOff className="w-3.5 h-3.5 ml-auto text-gray-300" /> : 'Total Nilai'}</div>
        </div>

        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-50">
              <RefreshCw className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Sinkronisasi Data...</p>
            </div>
          ) : filteredStocks.length === 0 ? (
            <div className="bg-white rounded-3xl p-20 border border-dashed border-gray-200 text-center">
              <Box className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-sm font-black text-gray-900 uppercase">Tidak Ada Data</p>
              <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Coba ubah filter atau lakukan pencarian lain</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:gap-4 lg:gap-2">
              {filteredStocks.map((stock) => {
                const onHand = stock.onHandQty || 0;
                const reserved = stock.reservedQty || 0;
                const available = onHand - reserved;
                const isLow = onHand <= (stock.minStockAlert || 0);
                const price = stock.batch?.purchasePrice || stock.product?.purchasePrice || 0;

                return (
                  <motion.div
                    key={stock.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="group"
                  >
                    {/* Desktop View */}
                    <div className="hidden lg:grid grid-cols-12 gap-4 items-center px-6 py-4 bg-white border border-gray-100 rounded-3xl hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all cursor-pointer" onClick={() => openMutationHistory(stock)}>
                      <div className="col-span-4 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${stock.product?.isMedicine ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                          {stock.product?.productName?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-gray-900 truncate uppercase text-sm">{stock.product?.productName}</p>
                          <div className="flex gap-2 items-center mt-0.5">
                            <span className="text-[9px] font-black bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 uppercase tracking-tighter">{stock.product?.productCode}</span>
                            {stock.batch && <span className="text-[9px] font-black text-primary uppercase tracking-tighter">Batch: {stock.batch.batchNumber}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter ${stock.product?.isMedicine ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                          {stock.product?.isMedicine ? 'Obat' : 'Aset'}
                        </span>
                      </div>
                      <div className="col-span-1 text-center font-black text-gray-900 text-sm">{onHand}</div>
                      <div className="col-span-1 text-center font-black text-orange-400 text-sm">{reserved}</div>
                      <div className="col-span-1 text-center font-black text-primary text-sm">{available}</div>
                      <div className="col-span-2 text-right font-bold text-gray-600">
                        {hidePrices
                          ? <span className="tracking-[0.25em] text-gray-300 font-black">••••••</span>
                          : `Rp ${price.toLocaleString('id-ID')}`}
                      </div>
                      <div className="col-span-2 text-right font-black text-gray-900">
                        {hidePrices
                          ? <span className="tracking-[0.25em] text-gray-300">••••••••</span>
                          : `Rp ${(onHand * price).toLocaleString('id-ID')}`}
                      </div>
                    </div>

                    {/* Mobile Native Card View */}
                    <div className="lg:hidden bg-white border border-gray-100 rounded-[2rem] p-5 shadow-sm active:scale-[0.98] transition-all" onClick={() => openMutationHistory(stock)}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${stock.product?.isMedicine ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                            {stock.product?.productName?.[0]}
                          </div>
                          <div>
                            <h3 className="font-black text-gray-900 text-sm leading-tight uppercase mb-0.5 truncate max-w-[180px]">{stock.product?.productName}</h3>
                            <span className="text-[8px] font-black bg-gray-100 px-2 py-0.5 rounded-full text-gray-400 uppercase">{stock.product?.productCode}</span>
                          </div>
                        </div>
                        {isLow && (
                          <div className="px-2 py-1 bg-red-50 text-red-600 rounded-lg flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span className="text-[8px] font-extrabold uppercase">Kritis</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-4 bg-gray-50/50 p-3 rounded-2xl">
                        <div className="text-center">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Stok Fisik</p>
                          <p className="text-sm font-black text-gray-900">{onHand}</p>
                        </div>
                        <div className="text-center border-x border-gray-100">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Booking</p>
                          <p className="text-sm font-black text-orange-400">{reserved}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">Available</p>
                          <p className="text-sm font-black text-primary">{available}</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Total Nilai Stok</p>
                          {hidePrices
                            ? <p className="text-sm font-black text-gray-300 tracking-[0.3em] leading-none">••••••••</p>
                            : <p className="text-sm font-black text-gray-900 leading-none">Rp {(onHand * price).toLocaleString('id-ID')}</p>}
                        </div>
                        <div className="p-2 bg-gray-50 rounded-xl">
                          <History className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      <StockMutationDialog 
        isOpen={isMutationDialogOpen}
        onClose={() => setIsMutationDialogOpen(false)}
        stock={selectedStock}
      />

      {/* Pagination Section */}
      {meta && meta.totalPages > 1 && (
        <div className="mt-10 flex flex-col md:flex-row items-center justify-between gap-6 px-6 py-6 bg-white border border-gray-100 rounded-[2.5rem] shadow-xl shadow-gray-200/50">
          <div className="flex flex-col">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Status Navigasi</p>
            <p className="text-xs font-bold text-gray-600">
              Menampilkan <span className="text-primary font-black">{((page - 1) * 10) + 1}</span> - <span className="text-primary font-black">{Math.min(page * 10, meta.total)}</span> dari <span className="text-gray-900 font-black">{meta.total}</span> Item
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-5 py-2.5 rounded-2xl bg-gray-50 text-gray-400 font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-gray-50 transition-all border border-transparent hover:border-gray-200"
            >
              Kembali
            </button>

            <div className="flex items-center gap-1 mx-2">
              {[...Array(meta.totalPages)].map((_, i) => {
                const p = i + 1;
                // Only show current, first, last and neighbors
                if (p === 1 || p === meta.totalPages || (p >= page - 1 && p <= page + 1)) {
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-10 h-10 rounded-xl font-black text-xs transition-all ${
                        page === p 
                        ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-110 z-10' 
                        : 'text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                }
                if (p === page - 2 || p === page + 2) {
                  return <span key={p} className="text-gray-300">••</span>;
                }
                return null;
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="px-5 py-2.5 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all"
            >
              Lanjut
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
