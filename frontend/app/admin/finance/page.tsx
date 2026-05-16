'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FiDollarSign, FiFileText, FiSearch, FiFilter, 
  FiClock, FiCheckCircle, FiMoreVertical, FiEye, 
  FiCreditCard, FiCalendar, FiArrowRight, FiActivity, FiShare2, FiZap, FiSend, FiPlus, FiBriefcase, FiEdit2, FiX,
  FiRefreshCw, FiRepeat, FiShield,
  FiUser
} from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/useAuthStore'
import api from '@/lib/api'

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  price: number
  subtotal: number
  serviceId?: string | null
  service?: {
    id: string
    serviceCode: string
    serviceName: string
  }
}

interface Payment {
  id: string
  paymentNo: string
  amount: number
  paymentMethod: string
  paymentDate: string
}

interface Bank {
  id: string
  bankName: string
  accountNumber: string
  accountHolder: string
  isActive?: boolean
  coa?: {
    code: string
    name: string
  }
}

interface ClinicProfile {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
}

interface Invoice {
  id: string
  invoiceNo: string
  invoiceDate: string
  subtotal: number
  discount: number
  total: number
  amountPaid: number
  status: 'paid' | 'unpaid' | 'partial' | 'cancelled'
  patient: {
    name: string
    medicalRecordNo: string
    phone: string
  }
  items: InvoiceItem[]
  payments: Payment[]
  bankId?: string | null
  bank?: Bank | null
  isPosted: boolean
  postedAt?: string
  registration?: {
    queueNumbers: Array<{
      status: string
      queueDate: string
    }>
  }
}

const getExamStatusBadge = (status?: string) => {
  if (!status) return null;
  switch (status) {
    case 'waiting':
      return <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-black uppercase border border-amber-100 flex items-center gap-1"><FiActivity className="w-2 h-2"/> Antrian</span>
    case 'ongoing':
      return <span className="px-2 py-0.5 bg-sky-50 text-sky-600 rounded text-[8px] font-black uppercase border border-sky-100 flex items-center gap-1 animate-pulse"><FiActivity className="w-2 h-2"/> Diperiksa</span>
    case 'finished':
    case 'completed':
      return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black uppercase border border-emerald-100 flex items-center gap-1"><FiCheckCircle className="w-2 h-2"/> Selesai</span>
    default:
      return null;
  }
}

interface ReceiptPreviewData {
  clinicName: string
  clinicCode: string
  clinicAddress: string
  clinicPhone: string
  clinicEmail: string
  invoiceNo: string
  patientName: string
  medicalRecordNo: string
  paymentNo: string
  paymentDate: string
  paymentMethod: string
  amount: number
  cashierName: string
  items: InvoiceItem[]
}

export default function FinanceDashboard() {
  const { user, activeClinicId } = useAuthStore()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [activeClinicProfile, setActiveClinicProfile] = useState<ClinicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [summary, setSummary] = useState({ todayRevenue: 0, pendingRevenue: 0 })
  
  const cashBanks = useMemo(() => banks.filter(b => 
    b.bankName.toLowerCase().includes('cash') || 
    b.bankName.toLowerCase().includes('kas') ||
    b.bankName.toLowerCase().includes('petty')
  ), [banks])

  const transferBanks = useMemo(() => banks.filter(b => 
    !b.bankName.toLowerCase().includes('cash') && 
    !b.bankName.toLowerCase().includes('kas') &&
    !b.bankName.toLowerCase().includes('petty')
  ), [banks])
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
      method: 'cash',
      amount: 0,
      transactionRef: '',
      bankId: '',
      insuranceNo: '',
      insuranceProvider: '',
      notes: '',
      discount: 0,
      discountType: 'amount' as 'amount' | 'percent',
      discountInput: 0
   })
  const [processing, setProcessing] = useState(false)
  const [receivedAmount, setReceivedAmount] = useState<number>(0)
  const [showReceiptPreviewModal, setShowReceiptPreviewModal] = useState(false)
  const [receiptPreviewData, setReceiptPreviewData] = useState<ReceiptPreviewData | null>(null)
  
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  
  const [showPostConfirmModal, setShowPostConfirmModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [invoiceToPost, setInvoiceToPost] = useState<Invoice | null>(null)

  const fetchData = useCallback(async () => {
    if (!activeClinicId) return
    try {
      setLoading(true)
      const [invRes, sumRes, clinicRes] = await Promise.all([
        api.get('/finance/invoices', {
          params: { 
            search: search || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
            page: page,
            limit: 10
          }
        }),
        api.get('/finance/summary'),
        api.get('/master/clinics')
      ])
      
      const invoiceData = invRes.data?.data || (Array.isArray(invRes.data) ? invRes.data : [])
      setInvoices(invoiceData)
      
      if (invRes.data?.meta) {
        setTotalPages(invRes.data.meta.totalPages || 1)
        setTotalItems(invRes.data.meta.total || invoiceData.length)
      } else {
        setTotalPages(1)
        setTotalItems(invoiceData.length)
      }
      
      setSummary(sumRes.data || { todayRevenue: 0, pendingRevenue: 0 })
      const clinics = Array.isArray(clinicRes.data) ? clinicRes.data : []
      const activeClinic = clinics.find((c: ClinicProfile) => c.id === activeClinicId) || null
      setActiveClinicProfile(activeClinic)
    } catch (error) {
      console.error('Fetch Finance Error:', error)
      toast.error('Gagal mengambil data keuangan')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, activeClinicId])

  useEffect(() => {
    fetchData()
    fetchBanks()
  }, [])

  const fetchBanks = async () => {
    try {
        const res = await api.get('/master/banks')
        setBanks(Array.isArray(res.data) ? res.data.filter((b: Bank) => b.isActive) : [])
    } catch (error) {
        console.error('Failed to fetch banks')
    }
  }

  useEffect(() => {
    if (activeClinicId) fetchData()
  }, [fetchData, activeClinicId])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100">Lunas</span>
      case 'partial':
        return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-amber-100">Cicilan</span>
      case 'unpaid':
        return <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-100">Belum Bayar</span>
      default:
        return <span className="px-3 py-1 bg-slate-50 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-100">{status}</span>
    }
  }

  const handleProcessPayment = async () => {
    if (!selectedInvoice) return
    try {
        setProcessing(true)
        await api.post('/finance/payments', {
          invoiceId: selectedInvoice.id,
          amount: paymentData.amount,
          paymentMethod: paymentData.method,
          transactionRef: paymentData.transactionRef || paymentData.insuranceNo || '',
          bankId: paymentData.bankId || null,
          notes: paymentData.notes,
          discount: paymentData.discount,
          discountType: paymentData.discountType
        })
        toast.success('Pembayaran berhasil diproses')
        setShowPaymentModal(false)
        setSelectedInvoice(null)
        setPaymentData({
           method: 'cash',
           amount: 0,
           transactionRef: '',
           bankId: '',
           insuranceNo: '',
           insuranceProvider: '',
           notes: '',
           discount: 0,
           discountType: 'amount',
           discountInput: 0
        })
        fetchData()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal memproses pembayaran')
    } finally {
      setProcessing(false)
    }
  }

  const handleReprintFromInvoice = (inv: Invoice) => {
    const latestPayment = [...(inv.payments || [])].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]
    if (!latestPayment) return toast.error('Belum ada data pembayaran.')
    setReceiptPreviewData({
      clinicName: activeClinicProfile?.name || 'Klinik', clinicCode: activeClinicProfile?.code || '-',
      clinicAddress: activeClinicProfile?.address || '-', clinicPhone: activeClinicProfile?.phone || '-', clinicEmail: activeClinicProfile?.email || '-',
      invoiceNo: inv.invoiceNo, patientName: inv.patient.name, medicalRecordNo: inv.patient.medicalRecordNo,
      paymentNo: latestPayment.paymentNo, paymentDate: latestPayment.paymentDate, paymentMethod: latestPayment.paymentMethod,
      amount: Number(latestPayment.amount || 0), cashierName: user?.name || 'Admin Klinik', items: inv.items || []
    })
    setShowReceiptPreviewModal(true)
  }

  const handlePostToGL = async (invoiceId: string) => {
    try {
        setProcessing(true)
        // Fixed: Match backend route /invoices/post-to-ledger and send invoiceId in body
        await api.post(`/finance/invoices/post-to-ledger`, { invoiceId })
        toast.success('Invoice berhasil diposting ke GL')
        setShowPostConfirmModal(false)
        setInvoiceToPost(null)
        fetchData()
    } catch (error: any) {
        toast.error(error?.response?.data?.message || 'Gagal memposting invoice')
    } finally {
        setProcessing(false)
    }
  }

  const handlePrintReceipt = () => {
    if (!receiptPreviewData) return
    const printWindow = window.open('', '_blank', 'width=420,height=900')
    if (!printWindow) return toast.error('Popup diblokir browser.')

    // 1. Separate Medicine Items
    const medicineItems = receiptPreviewData.items.filter(item => {
      const desc = (item.description || '').toLowerCase();
      const sName = (item.service?.serviceName || '').toLowerCase();
      const sCode = (item.service?.serviceCode || '').toUpperCase();

      const isExplicitMed = sCode === 'MED-GEN' || sName.includes('obat');
      if (isExplicitMed) return true;

      const isNonMedService = 
        desc.includes('pendaftaran') || desc.includes('registrasi') || desc.includes('pemeriksaan') || 
        desc.includes('konsultasi') || desc.includes('admin') || desc.includes('kartu') || 
        desc.includes('lab') || desc.includes('darah') || desc.includes('urin') || desc.includes('feses') || 
        desc.includes('rontgen') || desc.includes('usg') || desc.includes('ekg') || 
        desc.includes('nebulizer') || desc.includes('injeksi') || desc.includes('suntik') || desc.includes('infus') ||
        desc.includes('tindakan') || desc.includes('rawat') || desc.includes('jahit') || desc.includes('bedah');

      const hasMedKeywords = desc.includes('obat') || desc.includes('kapsul') || desc.includes('tablet') || 
                             desc.includes('sirup') || desc.includes('puyer') || desc.includes('salep') || 
                             desc.includes('drop') || desc.includes('racikan') ||
                             /\d+\s*(mg|ml|gr|tab|cap|btl|tablet|botol|pcs|tablet|strip)/.test(desc);
      const hasParentheses = /\(.*\)/.test(desc);

      return !isNonMedService && (hasMedKeywords || hasParentheses || !item.serviceId);
    })

    // 2. Separate Tindakan Items (Procedures)
    const tindakanItems = receiptPreviewData.items.filter(item => {
       if (medicineItems.some(med => med.id === item.id)) return false;
       const desc = (item.description || '').toLowerCase();
       return desc.includes('tindakan') || desc.includes('injeksi') || desc.includes('suntik') || 
              desc.includes('infus') || desc.includes('nebulizer') || desc.includes('jahit') || 
              desc.includes('bedah') || desc.includes('uap') || desc.includes('rawat luka') ||
              desc.includes('khitan') || desc.includes('sirkumsisi');
    })
    
    // 3. Remaining Items (Admin, Consultations, Lab, etc.)
    const otherItems = receiptPreviewData.items.filter(item => 
      !medicineItems.some(med => med.id === item.id) &&
      !tindakanItems.some(tin => tin.id === item.id)
    )
    
    const totalMedicineSubtotal = medicineItems.reduce((sum, item) => sum + (item.subtotal || 0), 0)
    const totalTindakanSubtotal = tindakanItems.reduce((sum, item) => sum + (item.subtotal || 0), 0)

    const itemRowsHtml = `
      ${otherItems.map((item) => `
        <div class="item-row">
          <div class="item-name">${item.description}</div>
          <div class="item-meta">${item.quantity} x ${formatCurrency(item.price)}</div>
          <div class="item-subtotal">${formatCurrency(item.subtotal)}</div>
        </div>
      `).join('')}
      
      ${totalTindakanSubtotal > 0 ? `
        <div class="item-row" style="border-top: 1px dashed #eee; padding-top: 4px; margin-top: 4px;">
          <div class="item-name"><strong>TINDAKAN MEDIS</strong></div>
          <div class="item-meta">Total Biaya Tindakan</div>
          <div class="item-subtotal"><strong>${formatCurrency(totalTindakanSubtotal)}</strong></div>
        </div>
      ` : ''}

      ${totalMedicineSubtotal > 0 ? `
        <div class="item-row" style="border-top: 1px dashed #eee; padding-top: 4px; margin-top: 4px;">
          <div class="item-name"><strong>TOTAL OBAT-OBATAN</strong></div>
          <div class="item-meta">Akumulasi Biaya Obat</div>
          <div class="item-subtotal"><strong>${formatCurrency(totalMedicineSubtotal)}</strong></div>
        </div>
      ` : ''}
    `

    const receiptHtml = `
      <html>
        <head>
          <title>Kwitansi ${receiptPreviewData.invoiceNo}</title>
          <style>
            @page { size: 80mm auto; margin: 3mm; }
            body { font-family: sans-serif; margin: 0; padding: 2mm; width: 80mm; font-size: 10px; }
            .center { text-align: center; }
            .title { font-size: 13px; font-weight: 900; margin-bottom: 2px; }
            .line { border-top: 1px dashed #333; margin: 5px 0; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; }
            .bold { font-weight: 900; }
            .item-row { padding: 3px 0; border-bottom: 1px dotted #ccc; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">${receiptPreviewData.clinicName}</div>
            <div>${receiptPreviewData.clinicAddress}</div>
            <div class="line"></div>
            <div class="bold">KWITANSI PEMBAYARAN</div>
          </div>
          <div class="line"></div>
          <div class="row"><span>Invoice</span><span>${receiptPreviewData.invoiceNo}</span></div>
          <div class="row"><span>Tanggal</span><span>${new Date(receiptPreviewData.paymentDate).toLocaleString('id-ID')}</span></div>
          <div class="row"><span>Pasien</span><span>${receiptPreviewData.patientName}</span></div>
          <div class="line"></div>
          ${itemRowsHtml}
          <div class="line"></div>
          <div class="row bold" style="font-size: 12px;"><span>TOTAL</span><span>${formatCurrency(receiptPreviewData.amount)}</span></div>
          <div class="line"></div>
          <div class="center" style="margin-top: 10px;">Terima Kasih</div>
        </body>
      </html>
    `
    printWindow.document.write(receiptHtml); printWindow.document.close(); printWindow.print()
  }

  return (
    <div className="p-3 md:p-6 lg:p-8 max-w-[1400px] mx-auto min-h-screen pb-40">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pt-2">
        <div className="flex items-center gap-4">
           <div className="p-3 bg-primary/10 rounded-[2rem] shadow-sm">
              <FiDollarSign className="w-6 h-6 md:w-8 md:h-8 text-primary" />
           </div>
           <div>
              <div className="flex items-center gap-4">
                <h1 className="text-xl md:text-3xl font-black text-gray-900 tracking-tight uppercase leading-none">Finance Center</h1>
                <button 
                  onClick={() => fetchData()}
                  disabled={loading}
                  className="p-2.5 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-90 group"
                  title="Refresh Data Keuangan"
                >
                  <FiRefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin text-primary' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                </button>
              </div>
              <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Billing & Invoicing Revenue</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
          <div className="bg-white p-4 md:p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                <FiZap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-[8px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">TODAY REVENUE</p>
                <h3 className="text-sm md:text-lg font-black text-gray-900 tracking-tighter truncate">{formatCurrency(summary.todayRevenue)}</h3>
            </div>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 shrink-0">
                <FiClock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-[8px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">UNPAID DEBT</p>
                <h3 className="text-sm md:text-lg font-black text-rose-600 tracking-tighter truncate">{formatCurrency(summary.pendingRevenue)}</h3>
            </div>
          </div>
      </div>

      <div className="bg-white p-2 rounded-[2.5rem] border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-2">
          <div className="flex items-center gap-3 bg-gray-50 px-5 py-3 rounded-2xl flex-1 min-w-0">
              <FiSearch className="text-gray-400 shrink-0" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="NO INVOICE / NAMA PASIEN..." className="bg-transparent border-none focus:outline-none text-[10px] font-black text-gray-700 w-full uppercase tracking-widest" />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
             {['all', 'paid', 'unpaid', 'partial'].map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'text-gray-400 hover:text-gray-600'}`}>{s}</button>
             ))}
          </div>
      </div>

      <div className="space-y-4">
        <div className="hidden lg:grid grid-cols-12 gap-4 px-10 py-5 bg-gray-50 rounded-[2rem] text-[9px] font-black text-gray-400 uppercase tracking-widest border border-gray-100 mb-2">
           <div className="col-span-3">Pasien & Rekam Medis</div>
           <div className="col-span-2">Referensi Invoice</div>
           <div className="col-span-2 text-right">Total Tagihan</div>
           <div className="col-span-2 text-center">Status Bayar</div>
           <div className="col-span-1 text-center">Jurnal GL</div>
           <div className="col-span-2 text-right">Tindakan</div>
        </div>

        <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="py-32 text-center flex flex-col items-center">
                 <FiRefreshCw className="w-10 h-10 text-primary animate-spin mb-4 opacity-30" />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Checking Finances...</p>
             </div>
           ) : invoices.length === 0 ? (
             <div className="bg-gray-50/50 rounded-[3rem] p-24 text-center border-4 border-dashed border-white flex flex-col items-center">
                <FiDollarSign className="w-12 h-12 text-gray-200 mb-4" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada transaksi ditemukan</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 gap-4">
                {invoices.map((inv, idx) => (
                   <motion.div key={inv.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }} className="bg-white border border-gray-100 rounded-[2.2rem] md:rounded-[3rem] overflow-visible group shadow-sm hover:shadow-2xl hover:border-primary/20 transition-all cursor-pointer">
                      
                      <div className="hidden lg:grid grid-cols-12 gap-4 items-center px-10 py-7">
                         <div className="col-span-3 flex items-center gap-5">
                            <div className="w-12 h-12 bg-gray-50 group-hover:bg-primary/5 rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-primary transition-all"><FiUser className="w-6 h-6" /></div>
                            <div className="min-w-0">
                               <p className="text-base font-black text-gray-900 group-hover:text-primary transition-colors truncate uppercase">{inv.patient.name}</p>
                               <p className="text-[10px] font-bold text-gray-400 tracking-widest font-mono uppercase">{inv.patient.medicalRecordNo}</p>
                            </div>
                         </div>
                         <div className="col-span-2">
                             <p className="text-xs font-black text-gray-700 uppercase leading-none">{inv.invoiceNo}</p>
                             <p className="text-[10px] font-bold text-gray-400 mt-1">{new Date(inv.invoiceDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})}</p>
                         </div>
                         <div className="col-span-2 text-right">
                             <div className="flex flex-col">
                                <span className="text-base font-black text-gray-900 leading-none">{formatCurrency(inv.total)}</span>
                                {inv.discount > 0 && (
                                   <div className="flex flex-col mt-1">
                                      <span className="text-[9px] font-bold text-gray-400 line-through decoration-rose-400/50 uppercase tracking-widest">{formatCurrency(inv.subtotal)}</span>
                                      <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-md inline-block w-fit ml-auto mt-0.5">-{formatCurrency(inv.discount)}</span>
                                   </div>
                                )}
                                {inv.amountPaid > 0 && <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-1">Lunas: {formatCurrency(inv.amountPaid)}</p>}
                             </div>
                         </div>
                         <div className="col-span-2 flex flex-col items-center gap-1.5">
                            {getStatusBadge(inv.status)}
                            {getExamStatusBadge(inv.registration?.queueNumbers?.[0]?.status)}
                         </div>
                         <div className="col-span-1 flex justify-center">
                            {inv.isPosted ? (
                              <span className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 tooltip" data-tip="Sudah Diposting">
                                <FiCheckCircle className="w-4 h-4"/>
                              </span>
                            ) : (
                              <span className="w-8 h-8 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center border border-amber-200 shadow-sm shadow-amber-100 animate-pulse tooltip" data-tip="BELUM DIPOSTING">
                                <FiClock className="w-4 h-4"/>
                              </span>
                            )}
                         </div>
                         <div className="col-span-2 flex justify-end gap-2">
                             <button 
                                onClick={() => { setSelectedInvoice(inv); setShowDetailModal(true); }} 
                                className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-primary/5 hover:text-primary transition-colors tooltip"
                                data-tip="Lihat Detail"
                             >
                                <FiEye className="w-4 h-4" />
                             </button>

                             {!inv.isPosted && inv.status === 'paid' && (
                                <button 
                                   onClick={() => { setInvoiceToPost(inv); setShowPostConfirmModal(true); }}
                                   className="p-3 bg-gray-50 text-emerald-500 rounded-xl hover:bg-emerald-50 transition-colors tooltip"
                                   data-tip="Posting ke Jurnal"
                                >
                                   <FiShare2 className="w-4 h-4" />
                                </button>
                             )}

                             {inv.status !== 'paid' ? (
                                <button 
                                   disabled={['waiting', 'ongoing', 'triage', 'ready', 'called'].includes(inv.registration?.queueNumbers?.[0]?.status || '')}
                                   onClick={() => { 
                                     setSelectedInvoice(inv); 
                                     const remaining = inv.total - (inv.amountPaid || 0);
                                     setReceivedAmount(remaining); 
                                     setPaymentData({ 
                                       ...paymentData, 
                                       amount: remaining, 
                                       method: 'cash',
                                       discount: 0,
                                       discountInput: 0,
                                       discountType: 'amount'
                                     }); 
                                     setShowPaymentModal(true); 
                                   }} 
                                   className={`px-5 py-3 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all tooltip ${
                                     ['waiting', 'ongoing', 'triage', 'ready', 'called'].includes(inv.registration?.queueNumbers?.[0]?.status || '')
                                     ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                     : 'bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95'
                                   }`}
                                   data-tip={['waiting', 'ongoing', 'triage', 'ready', 'called'].includes(inv.registration?.queueNumbers?.[0]?.status || '') ? 'Selesaikan Antrian Dahulu' : 'Proses Pembayaran'}
                                 >
                                   {['waiting', 'ongoing', 'triage', 'ready', 'called'].includes(inv.registration?.queueNumbers?.[0]?.status || '') ? 'ANTRIAN' : 'BAYAR'}
                                 </button>
                             ) : (
                                <button 
                                   onClick={() => handleReprintFromInvoice(inv)} 
                                   className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-sky-50 hover:text-sky-600 transition-colors tooltip"
                                   data-tip="Cetak Ulang Kwitansi"
                                >
                                   <FiFileText className="w-4 h-4" />
                                </button>
                             )}
                         </div>
                      </div>
                   </motion.div>
                ))}
             </div>
           )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
         {showPaymentModal && selectedInvoice && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !processing && setShowPaymentModal(false)} className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />
               <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row max-h-[90vh]">
                  
                  <div className="w-full lg:w-[380px] bg-gray-50 p-8 lg:p-10 border-r border-gray-100 overflow-y-auto">
                     <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                           <FiFileText className="w-6 h-6" />
                        </div>
                        <div>
                           <h3 className="text-lg font-black uppercase tracking-tight leading-none">Rincian Tagihan</h3>
                           <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{selectedInvoice.invoiceNo}</p>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pasien</p>
                           <p className="text-sm font-black text-gray-900 uppercase truncate">{selectedInvoice.patient.name}</p>
                           <p className="text-[9px] font-bold text-gray-400 mt-0.5 font-mono">{selectedInvoice.patient.medicalRecordNo}</p>
                        </div>

                        <div className="space-y-3">
                           {selectedInvoice.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-start gap-4">
                                 <div className="min-w-0">
                                    <p className="text-[10px] font-black text-gray-700 uppercase truncate leading-tight">{item.description}</p>
                                    <p className="text-[9px] font-bold text-gray-400">{item.quantity}x {formatCurrency(item.price)}</p>
                                 </div>
                                 <p className="text-[10px] font-black text-gray-900">{formatCurrency(item.subtotal)}</p>
                              </div>
                           ))}
                        </div>

                        <div className="pt-6 border-t border-dashed border-gray-200 space-y-2">
                           <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
                              <span>Subtotal</span>
                              <span>{formatCurrency(selectedInvoice.total)}</span>
                           </div>
                           {selectedInvoice.amountPaid > 0 && (
                              <div className="flex justify-between text-[10px] font-bold text-emerald-500 uppercase">
                                 <span>Sudah Dibayar</span>
                                 <span>-{formatCurrency(selectedInvoice.amountPaid)}</span>
                              </div>
                           )}
                           <div className="flex justify-between pt-2">
                               <span className="text-xs font-black text-gray-900 uppercase">Subtotal Sisa</span>
                               <span className="text-sm font-black text-gray-900">{formatCurrency(selectedInvoice.total - (selectedInvoice.amountPaid || 0))}</span>
                            </div>

                            <div className="pt-4 space-y-4">
                               <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipe Diskon</label>
                                  <div className="flex bg-gray-100 p-1 rounded-xl">
                                     <button 
                                        type="button"
                                        onClick={() => {
                                           const remaining = selectedInvoice.total - (selectedInvoice.amountPaid || 0);
                                           setPaymentData({ ...paymentData, discountType: 'percent', discount: 0, discountInput: 0, amount: remaining });
                                           setReceivedAmount(remaining);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${paymentData.discountType === 'percent' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                                     >
                                        %
                                     </button>
                                     <button 
                                        type="button"
                                        onClick={() => {
                                           const remaining = selectedInvoice.total - (selectedInvoice.amountPaid || 0);
                                           setPaymentData({ ...paymentData, discountType: 'amount', discount: 0, discountInput: 0, amount: remaining });
                                           setReceivedAmount(remaining);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${paymentData.discountType === 'amount' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                                     >
                                        Rp
                                     </button>
                                  </div>
                               </div>

                               <div className="relative">
                                  <input 
                                     type="number" 
                                     value={paymentData.discountInput || ''}
                                     onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const remaining = selectedInvoice.total - (selectedInvoice.amountPaid || 0);
                                        let discAmount = 0;
                                        if (paymentData.discountType === 'percent') {
                                           discAmount = (val / 100) * remaining;
                                        } else {
                                           discAmount = val;
                                        }
                                        const finalAmount = Math.max(0, remaining - discAmount);
                                        setPaymentData({ ...paymentData, discountInput: val, discount: discAmount, amount: finalAmount });
                                        setReceivedAmount(finalAmount);
                                     }}
                                     placeholder={paymentData.discountType === 'percent' ? "0%" : "Rp 0"}
                                     className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-black focus:border-primary outline-none transition-all"
                                  />
                               </div>

                               {paymentData.discount > 0 && (
                                  <div className="flex justify-between text-[10px] font-bold text-rose-500 uppercase">
                                     <span>Potongan</span>
                                     <span>-{formatCurrency(paymentData.discount)}</span>
                                  </div>
                               )}
                            </div>

                            <div className="pt-4 border-t border-dashed border-gray-200">
                               <div className="flex justify-between items-center">
                                  <span className="text-xs font-black text-gray-900 uppercase">Total Bayar</span>
                                  <span className="text-xl font-black text-primary">{formatCurrency(paymentData.amount)}</span>
                               </div>
                            </div>
                        </div>
                     </div>
                  </div>

                  <div className="flex-1 p-8 lg:p-12 overflow-y-auto">
                     <div className="flex justify-between items-center mb-10">
                        <h2 className="text-2xl font-black uppercase tracking-tight">Proses Pembayaran</h2>
                        <button onClick={() => !processing && setShowPaymentModal(false)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                           <FiX className="w-5 h-5 text-gray-400" />
                        </button>
                     </div>

                     <div className="space-y-8">
                        <div>
                           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block ml-1">Metode Pembayaran</label>
                           <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                              {[
                                 { id: 'cash', label: 'Tunai', icon: <FiDollarSign /> },
                                 { id: 'transfer', label: 'Transfer', icon: <FiRepeat /> },
                                 { id: 'card', label: 'Kartu', icon: <FiCreditCard /> },
                                 { id: 'insurance', label: 'Asuransi', icon: <FiShield /> },
                              ].map(m => (
                                 <button 
                                    key={m.id} 
                                    onClick={() => { setPaymentData({ ...paymentData, method: m.id, bankId: '', transactionRef: '', insuranceProvider: '', insuranceNo: '' }); if (m.id === 'cash' && cashBanks.length === 1) setPaymentData(prev => ({ ...prev, bankId: cashBanks[0].id })); }} 
                                    className={`flex flex-col items-center gap-2 py-5 rounded-[2rem] border-2 transition-all ${
                                       paymentData.method === m.id 
                                       ? 'bg-gray-900 border-gray-900 text-white shadow-xl shadow-gray-900/20 scale-[1.02]' 
                                       : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                                    }`}
                                 >
                                    <span className="text-lg">{m.icon}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest">{m.label}</span>
                                 </button>
                              ))}
                           </div>
                        </div>

                        <motion.div layout className="space-y-6">
                           {paymentData.method === 'cash' && (
                              <div className="space-y-6">
                                 <div className="bg-gray-50 p-8 rounded-[2.5rem] space-y-4">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block text-center">Jumlah Uang Diterima</label>
                                    <div className="relative">
                                       <span className="absolute left-6 top-1/2 -translate-y-1/2 text-lg font-black text-gray-400">Rp</span>
                                       <input 
                                          type="number" 
                                          value={receivedAmount || ''} 
                                          onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)} 
                                          className="w-full pl-16 pr-6 py-6 bg-white border-none rounded-3xl font-black text-3xl text-gray-900 focus:ring-4 focus:ring-primary/10 transition-all text-center shadow-inner"
                                          placeholder="0"
                                          onFocus={(e) => e.target.select()}
                                          autoFocus
                                       />
                                    </div>
                                    
                                    {cashBanks.length > 0 && (
                                       <div className="pt-4 border-t border-dashed border-gray-200 mt-4">
                                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 ml-1 text-center">Setor ke Akun Kas/Petty Cash</label>
                                          <div className="grid grid-cols-1 gap-2">
                                             {cashBanks.map(bank => (
                                                <button 
                                                   key={bank.id}
                                                   onClick={() => setPaymentData({ ...paymentData, bankId: bank.id })}
                                                   className={`p-5 rounded-3xl border-2 text-left transition-all ${
                                                      paymentData.bankId === bank.id ? 'bg-emerald-50 border-emerald-200 shadow-lg shadow-emerald-100 scale-[1.01]' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                                                   }`}
                                                >
                                                   <div className="flex justify-between items-center">
                                                      <div>
                                                         <div className="flex items-center gap-2">
                                                            <p className={`text-[10px] font-black uppercase tracking-widest ${paymentData.bankId === bank.id ? 'text-emerald-600' : 'text-gray-400'}`}>{bank.bankName}</p>
                                                            {bank.coa?.code && (
                                                              <span className="px-2 py-0.5 bg-gray-900 text-white text-[8px] font-black rounded uppercase">
                                                                 {bank.coa.code}
                                                              </span>
                                                            )}
                                                         </div>
                                                         <p className={`text-xs font-black mt-1 ${paymentData.bankId === bank.id ? 'text-emerald-900' : 'text-gray-500'}`}>a.n. {bank.accountHolder}</p>
                                                      </div>
                                                      {paymentData.bankId === bank.id && <FiCheckCircle className="w-6 h-6 text-emerald-500" />}
                                                   </div>
                                                </button>
                                             ))}
                                          </div>
                                       </div>
                                    )}

                                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                                       {[50000, 100000, 150000, 200000].map(val => (
                                          <button key={val} onClick={() => setReceivedAmount(val)} className="px-4 py-2 bg-white border border-gray-200 rounded-full text-[10px] font-black text-gray-500 hover:border-primary hover:text-primary transition-all uppercase">{formatCurrency(val)}</button>
                                       ))}
                                       <button onClick={() => setReceivedAmount(selectedInvoice.total - (selectedInvoice.amountPaid || 0))} className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black text-primary hover:bg-primary hover:text-white transition-all uppercase">Uang Pas</button>
                                    </div>
                                 </div>

                                 <div className={`p-8 rounded-[2.5rem] border-2 text-center transition-all ${
                                    receivedAmount - paymentData.amount >= 0 
                                    ? 'bg-emerald-50 border-emerald-100' 
                                    : 'bg-rose-50 border-rose-100'
                                 }`}>
                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                                       receivedAmount - paymentData.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                    }`}>
                                       {receivedAmount - paymentData.amount >= 0 ? 'Kembalian' : 'Kurang'}
                                    </p>
                                    <p className={`text-4xl font-black ${
                                       receivedAmount - paymentData.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                    }`}>
                                       {formatCurrency(Math.abs(receivedAmount - paymentData.amount))}
                                    </p>
                                 </div>
                              </div>
                           )}

                           {paymentData.method === 'transfer' && (
                              <div className="space-y-5">
                                 <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Pilih Bank Klinik</label>
                                    <div className="grid grid-cols-1 gap-2">
                                       {transferBanks.length > 0 ? transferBanks.map(bank => (
                                          <button 
                                             key={bank.id}
                                             onClick={() => setPaymentData({ ...paymentData, bankId: bank.id })}
                                             className={`p-5 rounded-3xl border-2 text-left transition-all ${
                                                paymentData.bankId === bank.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100 hover:border-gray-200'
                                             }`}
                                          >
                                             <div className="flex justify-between items-center">
                                                <div>
                                                   <div className="flex items-center gap-2">
                                                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{bank.bankName}</p>
                                                      {bank.coa?.code && (
                                                        <span className="px-2 py-0.5 bg-gray-900 text-white text-[8px] font-black rounded uppercase tracking-tighter">
                                                           Code: {bank.coa.code}
                                                        </span>
                                                      )}
                                                   </div>
                                                   <p className="text-sm font-black text-gray-900 mt-0.5">{bank.accountNumber}</p>
                                                   <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">a.n. {bank.accountHolder}</p>
                                                </div>
                                                {paymentData.bankId === bank.id && <FiCheckCircle className="w-6 h-6 text-indigo-500" />}
                                             </div>
                                          </button>
                                       )) : (
                                          <div className="p-8 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                                             <p className="text-[10px] font-black text-gray-400 uppercase">Belum ada bank terdaftar</p>
                                          </div>
                                       )}
                                    </div>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Nomor Referensi Transfer</label>
                                    <input 
                                       type="text" 
                                       placeholder="Contoh: TRX-123456789"
                                       value={paymentData.transactionRef}
                                       onChange={(e) => setPaymentData({ ...paymentData, transactionRef: e.target.value })}
                                       className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black text-gray-900 focus:ring-4 focus:ring-primary/10 transition-all uppercase placeholder:text-gray-300" 
                                    />
                                 </div>
                              </div>
                           )}

                           {paymentData.method === 'card' && (
                              <div className="space-y-5">
                                 <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Nomor Referensi EDC</label>
                                    <input 
                                       type="text" 
                                       placeholder="Contoh: 987654"
                                       value={paymentData.transactionRef}
                                       onChange={(e) => setPaymentData({ ...paymentData, transactionRef: e.target.value })}
                                       className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black text-gray-900 focus:ring-4 focus:ring-primary/10 transition-all uppercase placeholder:text-gray-300" 
                                    />
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Jenis Kartu</label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                       {['DEBIT', 'VISA', 'MASTERCARD', 'AMEX'].map(type => (
                                          <button 
                                             key={type} 
                                             onClick={() => setPaymentData({ ...paymentData, notes: type })} 
                                             className={`py-3 rounded-xl border-2 text-[9px] font-black transition-all ${
                                                paymentData.notes === type ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                                             }`}
                                          >
                                             {type}
                                          </button>
                                       ))}
                                    </div>
                                 </div>
                              </div>
                           )}

                           {paymentData.method === 'insurance' && (
                              <div className="space-y-5">
                                 <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Provider Asuransi</label>
                                    <select 
                                       value={paymentData.insuranceProvider}
                                       onChange={(e) => setPaymentData({ ...paymentData, insuranceProvider: e.target.value })}
                                       className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black text-gray-900 focus:ring-4 focus:ring-primary/10 transition-all uppercase"
                                    >
                                       <option value="">Pilih Provider</option>
                                       <option value="BPJS">BPJS Kesehatan</option>
                                       <option value="PRUDENTIAL">Prudential</option>
                                       <option value="MANULIFE">Manulife</option>
                                       <option value="ALLIANZ">Allianz</option>
                                       <option value="LAINNYA">Lainnya</option>
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">Nomor Kartu / Polis</label>
                                    <input 
                                       type="text" 
                                       placeholder="Contoh: 000123456789"
                                       value={paymentData.insuranceNo}
                                       onChange={(e) => setPaymentData({ ...paymentData, insuranceNo: e.target.value })}
                                       className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl font-black text-gray-900 focus:ring-4 focus:ring-primary/10 transition-all uppercase placeholder:text-gray-300" 
                                    />
                                 </div>
                              </div>
                           )}
                        </motion.div>

                        <div className="pt-8 border-t border-gray-100">
                           <button 
                               onClick={handleProcessPayment} 
                               disabled={processing || (paymentData.method === 'cash' && (receivedAmount < paymentData.amount || (cashBanks.length > 0 && !paymentData.bankId))) || (paymentData.method === 'transfer' && !paymentData.bankId)} 
                               className={`w-full py-6 rounded-[2.5rem] text-sm font-black uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                                  processing || (paymentData.method === 'cash' && (receivedAmount < paymentData.amount || (cashBanks.length > 0 && !paymentData.bankId))) || (paymentData.method === 'transfer' && !paymentData.bankId)
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-primary text-white shadow-primary/30'
                               }`}
                           >
                              {processing ? (
                                 <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                              ) : (
                                 <>
                                    <FiCheckCircle className="w-5 h-5" />
                                    <span>Konfirmasi & Selesaikan</span>
                                 </>
                              )}
                           </button>
                           <p className="text-[9px] font-bold text-gray-400 text-center mt-4 uppercase tracking-widest italic">* Pastikan semua data sudah sesuai sebelum menekan tombol konfirmasi</p>
                        </div>
                     </div>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      <AnimatePresence>
        {showReceiptPreviewModal && receiptPreviewData && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReceiptPreviewModal(false)} className="absolute inset-0 bg-slate-900/85 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-6 text-left">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900 leading-none underline decoration-primary/20 decoration-4 underline-offset-8">Receipt Preview</h3>
                   <button onClick={() => setShowReceiptPreviewModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><FiX className="w-5 h-5" /></button>
               </div>
               <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 space-y-4 mb-6">
                  <div className="text-center space-y-0.5 mb-2">
                     <p className="text-xs font-black uppercase">{receiptPreviewData.clinicName}</p>
                     <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{receiptPreviewData.clinicAddress}</p>
                  </div>
                  <div className="border-t border-dashed border-gray-200" />
                  <div className="space-y-1 text-[10px] font-bold text-gray-600">
                     <div className="flex justify-between"><span>No. Invoice</span><span>{receiptPreviewData.invoiceNo}</span></div>
                     <div className="flex justify-between"><span>Untuk Pasien</span><span>{receiptPreviewData.patientName}</span></div>
                  </div>
                  <div className="border-t border-dashed border-gray-200" />
                  <div className="text-center py-2">
                     <p className="text-2xl font-black text-gray-900">{formatCurrency(receiptPreviewData.amount)}</p>
                     <span className="text-[8px] font-black text-emerald-600 py-1 px-2 border border-emerald-100 bg-emerald-50 rounded-lg inline-block mt-2">DIBAYAR LUNAS</span>
                  </div>
               </div>
               <button onClick={handlePrintReceipt} className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] text-xs font-black tracking-widest uppercase shadow-xl shadow-emerald-200 active:scale-95 transition-all">CETAK SEKARANG</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
         {showDetailModal && selectedInvoice && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetailModal(false)} className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><FiFileText className="w-6 h-6" /></div>
                        <div>
                           <h3 className="text-xl font-black uppercase tracking-tight leading-none">Invoice Detail</h3>
                           <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{selectedInvoice.invoiceNo}</p>
                        </div>
                     </div>
                     <button onClick={() => setShowDetailModal(false)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"><FiX className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  
                  <div className="p-8 overflow-y-auto max-h-[60vh] space-y-8">
                     <div className="grid grid-cols-2 gap-8">
                        <div>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Informasi Pasien</p>
                           <p className="text-sm font-black text-gray-900 uppercase">{selectedInvoice.patient.name}</p>
                           <p className="text-[11px] font-bold text-gray-400 mt-0.5 font-mono uppercase">{selectedInvoice.patient.medicalRecordNo}</p>
                           <p className="text-[11px] font-bold text-gray-500 mt-1">{selectedInvoice.patient.phone}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Status Pembayaran</p>
                           {getStatusBadge(selectedInvoice.status)}
                           <p className="text-[11px] font-bold text-gray-400 mt-2">Tanggal: {new Date(selectedInvoice.invoiceDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                     </div>

                     <div className="space-y-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Item Tagihan</p>
                        <div className="space-y-3">
                           {selectedInvoice.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                 <div>
                                    <p className="text-xs font-black text-gray-800 uppercase">{item.description}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{item.quantity} x {formatCurrency(item.price)}</p>
                                 </div>
                                 <p className="text-sm font-black text-gray-900">{formatCurrency(item.subtotal)}</p>
                              </div>
                           ))}
                        </div>
                     </div>

                     {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                        <div className="space-y-4">
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Riwayat Pembayaran</p>
                           <div className="space-y-2">
                              {selectedInvoice.payments.map((p, idx) => (
                                 <div key={idx} className="flex justify-between items-center text-[10px] px-2">
                                    <div className="flex items-center gap-3">
                                       <FiCheckCircle className="text-emerald-500" />
                                       <span className="font-bold text-gray-600">{new Date(p.paymentDate).toLocaleString('id-ID')}</span>
                                       <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-black uppercase text-[8px]">{p.paymentMethod}</span>
                                    </div>
                                    <span className="font-black text-emerald-600">{formatCurrency(p.amount)}</span>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>

                  <div className="px-8 py-6 bg-gray-50 border-t border-gray-100">
                     <div className="space-y-2 max-w-xs ml-auto">
                        <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                           <span>Subtotal</span>
                           <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                        </div>
                        {selectedInvoice.discount > 0 && (
                           <div className="flex justify-between text-[10px] font-black text-rose-500 uppercase tracking-widest">
                              <span>Diskon</span>
                              <span>-{formatCurrency(selectedInvoice.discount)}</span>
                           </div>
                        )}
                        <div className="flex justify-between text-xs font-black text-gray-900 uppercase tracking-widest pt-2 border-t border-gray-200">
                           <span>Total Akhir</span>
                           <span>{formatCurrency(selectedInvoice.total)}</span>
                        </div>
                        {selectedInvoice.amountPaid > 0 && (
                           <div className="flex justify-between text-[10px] font-black text-emerald-600 uppercase tracking-widest pt-1">
                              <span>Telah Dibayar</span>
                              <span>{formatCurrency(selectedInvoice.amountPaid)}</span>
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="p-8 bg-gray-900 text-white flex justify-between items-center">
                     <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sisa Tagihan (AR)</p>
                        <p className="text-2xl font-black">{formatCurrency(Math.max(0, selectedInvoice.total - (selectedInvoice.amountPaid || 0)))}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Tagihan</p>
                        <p className="text-lg font-bold text-gray-300">{formatCurrency(selectedInvoice.total)}</p>
                     </div>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      <AnimatePresence>
         {showPostConfirmModal && invoiceToPost && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPostConfirmModal(false)} className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 text-center">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                     <FiShare2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-gray-900 mb-2">Posting ke Jurnal?</h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed mb-8 px-4">
                     Invoice <span className="text-gray-900">{invoiceToPost.invoiceNo}</span> akan diposting ke Buku Besar. Tindakan ini tidak dapat dibatalkan.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                     <button onClick={() => setShowPostConfirmModal(false)} className="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all">Batal</button>
                     <button 
                        onClick={() => handlePostToGL(invoiceToPost.id)} 
                        disabled={processing}
                        className="py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        {processing ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <><FiCheckCircle className="w-4 h-4" /> <span>Ya, Posting</span></>}
                     </button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .tooltip { position: relative; }
        .tooltip::after {
          content: attr(data-tip);
          position: absolute;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          padding: 6px 12px;
          background: rgba(15, 23, 42, 0.9);
          color: white;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-radius: 8px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          z-index: 200;
        }
        .tooltip:hover::after {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }
      `}</style>
    </div>
  )
}
