'use client'

import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FiSearch, FiRefreshCw, FiClock, FiCheckCircle, FiUser, 
  FiArrowLeft, FiSave, FiAlertCircle, FiPlus, FiTrash2, FiClipboard,
  FiPaperclip, FiFile, FiImage, FiX, FiPrinter
} from 'react-icons/fi'
import { HiOutlineBeaker } from 'react-icons/hi'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type LabOrder = {
  id: string; orderNo: string; orderDate: string; status: string;
  patient: { name: string; medicalRecordNo: string; dateOfBirth?: string; gender?: string };
  doctor: { name: string };
  attachments?: any[];
  orderedTestsSummary?: string[]; // Tests ordered by the doctor
  labNotesSummary?: string; // Doctor's lab notes/instructions
}

type LabResultItem = {
  testMasterId: string;
  testName: string;
  resultValue: string;
  unit: string;
  normalRange: string;
  isCritical: boolean;
  notes: string;
  category: string;
}

export default function LabInputPage() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [orderDetails, setOrderDetails] = useState<any>(null)
  const [testMasters, setTestMasters] = useState<any[]>([])
  const [results, setResults] = useState<LabResultItem[]>([])
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMasterDropdownOpen, setIsMasterDropdownOpen] = useState(false)
  const [activeStatus, setActiveStatus] = useState('pending')
  const [activeClinic, setActiveClinic] = useState<any>(null)

  const fetchActiveClinic = useCallback(async () => {
    const clinicId = typeof window !== 'undefined' ? localStorage.getItem('activeClinicId') : null
    if (clinicId) {
      try {
        const { data } = await api.get(`/master/clinics/${clinicId}`)
        setActiveClinic(data)
      } catch (e) {}
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/lab/orders', { params: { status: activeStatus } })
      setOrders(data)
    } finally { setLoading(false) }
  }, [activeStatus])

  const fetchMasters = useCallback(async () => {
    try {
      const { data } = await api.get('/lab/test-masters')
      setTestMasters(data)
    } catch (e) {}
  }, [])

  useEffect(() => { 
    fetchOrders()
    fetchMasters()
    fetchActiveClinic()
  }, [fetchOrders, fetchMasters, fetchActiveClinic])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const container = document.getElementById('master-dropdown-container');
      if (container && !container.contains(event.target as Node)) {
        setIsMasterDropdownOpen(false);
      }
    };

    if (isMasterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMasterDropdownOpen]);

  const loadOrderDetails = async (id: string) => {
    setSelectedOrder(id)
    try {
      const { data } = await api.get(`/lab/orders/${id}`)
      setOrderDetails(data)
      setClinicalNotes(data.clinicalNotes || '')
      
      // Map existing results if any
      if (data.results && data.results.length > 0) {
        setResults(data.results.map((r: any) => ({
          testMasterId: r.testMasterId,
          testName: r.testMaster?.name || '',
          category: r.testMaster?.category || 'Umum',
          resultValue: r.resultValue,
          unit: r.testMaster?.unit || '',
          normalRange: r.testMaster?.normalRangeText || '',
          isCritical: r.isCritical,
          notes: r.notes || ''
        })))
      } else {
        setResults([])
      }
    } catch (e) {
      toast.error('Gagal memuat detail order')
    }
  }

  const generatePDF = () => {
    if (!orderDetails) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // --- Header / Letterhead ---
    const clinic = orderDetails.medicalRecord?.clinic || activeClinic;
    const clinicName = clinic?.name || 'KLINIK SOLUSI IT';
    const clinicAddress = clinic?.address || 'Alamat Klinik Belum Diatur';
    const clinicPhone = clinic?.phone || '-';

    doc.setFontSize(20);
    doc.setTextColor(2, 132, 199); // Sky-700 (Biru Laut)
    doc.setFont('helvetica', 'bold');
    doc.text(clinicName.toUpperCase(), pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`${clinicAddress} | Telp: ${clinicPhone}`, pageWidth / 2, 27, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(15, 32, pageWidth - 15, 32);

    // --- Report Title ---
    doc.setFontSize(14);
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.text('HASIL PEMERIKSAAN LABORATORIUM', pageWidth / 2, 45, { align: 'center' });

    // --- Patient & Order Info ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const leftX = 15;
    const rightX = pageWidth / 2 + 10;
    let currentY = 55;

    // Left Column
    doc.text(`No. Rekam Medis : ${orderDetails.patient.medicalRecordNo}`, leftX, currentY);
    doc.text(`Nama Pasien      : ${orderDetails.patient.name}`, leftX, currentY + 7);
    doc.text(`Tgl. Lahir / JK   : ${orderDetails.patient.dateOfBirth ? new Date(orderDetails.patient.dateOfBirth).toLocaleDateString('id-ID') : '-'} / ${orderDetails.patient.gender || '-'}`, leftX, currentY + 14);

    // Right Column
    doc.text(`No. Order        : ${orderDetails.orderNo}`, rightX, currentY);
    doc.text(`Dokter Pengirim : ${orderDetails.doctor.name}`, rightX, currentY + 7);
    doc.text(`Tgl. Pemeriksaan : ${new Date(orderDetails.orderDate).toLocaleString('id-ID')}`, rightX, currentY + 14);

    currentY += 25;

    // --- Results Table ---
    const tableData = results.map(r => [
      r.testName,
      r.resultValue,
      r.unit,
      r.normalRange,
      r.isCritical ? 'KRITIS' : 'Normal'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Parameter Pemeriksaan', 'Hasil', 'Satuan', 'Nilai Rujukan', 'Keterangan']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 10, halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4 && data.cell.text[0] === 'KRITIS') {
          data.cell.styles.textColor = [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // --- Footer ---
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    
    if (clinicalNotes) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Catatan / Kesimpulan:', 15, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text(clinicalNotes, 15, finalY + 7, { maxWidth: pageWidth - 30 });
    }

    const signY = finalY + 40;
    doc.text('Petugas Laboratorium,', pageWidth - 60, signY);
    doc.text('( ____________________ )', pageWidth - 60, signY + 25);

    doc.save(`Hasil_Lab_${orderDetails.orderNo}_${orderDetails.patient.name}.pdf`);
  };

  const handlePreviewPDF = () => {
    if (!orderDetails) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // --- Header / Letterhead ---
    const clinic = orderDetails.medicalRecord?.clinic || activeClinic;
    const clinicName = clinic?.name || 'KLINIK SOLUSI IT';
    const clinicAddress = clinic?.address || 'Alamat Klinik Belum Diatur';
    const clinicPhone = clinic?.phone || '-';

    doc.setFontSize(20);
    doc.setTextColor(2, 132, 199); // Sky-700 (Biru Laut)
    doc.setFont('helvetica', 'bold');
    doc.text(clinicName.toUpperCase(), pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`${clinicAddress} | Telp: ${clinicPhone}`, pageWidth / 2, 27, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(15, 32, pageWidth - 15, 32);

    // --- Report Title ---
    doc.setFontSize(14);
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.text('HASIL PEMERIKSAAN LABORATORIUM', pageWidth / 2, 45, { align: 'center' });

    // --- Patient & Order Info ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const leftX = 15;
    const rightX = pageWidth / 2 + 10;
    let currentY = 55;

    // Left Column
    doc.text(`No. Rekam Medis : ${orderDetails.patient.medicalRecordNo}`, leftX, currentY);
    doc.text(`Nama Pasien      : ${orderDetails.patient.name}`, leftX, currentY + 7);
    doc.text(`Tgl. Lahir / JK   : ${orderDetails.patient.dateOfBirth ? new Date(orderDetails.patient.dateOfBirth).toLocaleDateString('id-ID') : '-'} / ${orderDetails.patient.gender || '-'}`, leftX, currentY + 14);

    // Right Column
    doc.text(`No. Order        : ${orderDetails.orderNo}`, rightX, currentY);
    doc.text(`Dokter Pengirim : ${orderDetails.doctor.name}`, rightX, currentY + 7);
    doc.text(`Tgl. Pemeriksaan : ${new Date(orderDetails.orderDate).toLocaleString('id-ID')}`, rightX, currentY + 14);

    currentY += 25;

    // --- Results Table ---
    const tableData = results.map(r => [
      r.testName,
      r.resultValue,
      r.unit,
      r.normalRange,
      r.isCritical ? 'KRITIS' : 'Normal'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Parameter Pemeriksaan', 'Hasil', 'Satuan', 'Nilai Rujukan', 'Keterangan']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 10, halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4 && data.cell.text[0] === 'KRITIS') {
          data.cell.styles.textColor = [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // --- Footer ---
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    
    if (clinicalNotes) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Catatan / Kesimpulan:', 15, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text(clinicalNotes, 15, finalY + 7, { maxWidth: pageWidth - 30 });
    }

    const signY = finalY + 40;
    doc.text('Petugas Laboratorium,', pageWidth - 60, signY);
    doc.text('( ____________________ )', pageWidth - 60, signY + 25);

    window.open(doc.output('bloburl'), '_blank');
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedOrder) return
    
    setUploading(true)
    const formData = new FormData()
    Array.from(files).forEach(file => formData.append('files', file))

    try {
      const { data } = await api.post(`/lab/orders/${selectedOrder}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('File berhasil diunggah')
      // Update order details to show new attachments
      setOrderDetails((prev: any) => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...data]
      }))
    } catch (e) {
      toast.error('Gagal mengunggah file')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAttachment = async (id: string) => {
    if (!window.confirm('Hapus lampiran ini?')) return
    try {
      await api.delete(`/lab/attachments/${id}`)
      setOrderDetails((prev: any) => ({
        ...prev,
        attachments: prev.attachments.filter((a: any) => a.id !== id)
      }))
      toast.success('Lampiran dihapus')
    } catch (e) {
      toast.error('Gagal menghapus lampiran')
    }
  }

  const isReadOnly = orderDetails?.status === 'completed'

  const addTest = (master: any) => {
    if (results.find(r => r.testMasterId === master.id)) return
    setResults([...results, {
      testMasterId: master.id,
      testName: master.name,
      category: master.category || 'Umum',
      resultValue: '',
      unit: master.unit || '',
      normalRange: master.normalRangeText || '',
      isCritical: false,
      notes: ''
    }])
  }

  const handleSaveResults = async (status: string = 'completed') => {
    if (!selectedOrder) return
    setSaving(true)
    try {
      await api.put(`/lab/orders/${selectedOrder}/results`, {
        results,
        status,
        clinicalNotes
      })
      toast.success(status === 'completed' ? 'Hasil lab berhasil disimpan!' : 'Draft berhasil disimpan')
      if (status === 'completed') {
        setSelectedOrder(null)
        setOrderDetails(null)
        fetchOrders()
      }
    } catch (e) {
      toast.error('Gagal menyimpan hasil lab')
    } finally { setSaving(false) }
  }

  const filteredOrders = orders.filter(o => 
    o.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.patient.medicalRecordNo.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!selectedOrder) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <HiOutlineBeaker className="text-rose-500" /> Antrian Laboratorium
            </h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Kelola input hasil pemeriksaan pasien</p>
          </div>
          <button onClick={fetchOrders} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-primary hover:border-primary transition-all shadow-sm">
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="relative group">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari No. Order, Nama Pasien, atau No. RM..." 
            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:border-primary outline-none shadow-sm" 
          />
        </div>

        {/* Status Toggle */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
          <button 
            onClick={() => setActiveStatus('pending')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeStatus === 'pending' ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <FiClock /> Antrian Pending
            {activeStatus === 'pending' && orders.length > 0 && (
              <span className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold">{orders.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveStatus('completed')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeStatus === 'completed' ? 'bg-white text-emerald-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <FiCheckCircle /> Sudah Selesai
          </button>
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <FiRefreshCw className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Memuat Antrian...</p>
          </div>
        ) : filteredOrders.length > 0 ? (
          activeStatus === 'pending' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOrders.map(order => (
                <motion.div 
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => loadOrderDetails(order.id)}
                  className="bg-white border border-slate-200 rounded-[2rem] p-6 hover:shadow-xl hover:shadow-slate-200/50 hover:border-primary transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 font-black text-lg border border-rose-100 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                      {order.orderNo.slice(-2)}
                    </div>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-widest flex items-center gap-1.5 ${order.status === 'in_progress' ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {order.status === 'in_progress' ? <FiSave className="w-3 h-3" /> : <FiClock className="w-3 h-3" />}
                      {order.status === 'in_progress' ? 'Draft' : 'Pending'}
                    </span>
                  </div>
                  
                  <div className="space-y-1 mb-4">
                    <h3 className="text-base font-black text-slate-900 tracking-tight">{order.patient.name}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.patient.medicalRecordNo}</p>
                  </div>

                  {/* Ordered Tests Preview */}
                  {order.orderedTestsSummary && order.orderedTestsSummary.length > 0 && (
                    <div className="mb-4 p-3 bg-sky-50 rounded-2xl border border-sky-100">
                      <p className="text-[8px] font-black text-sky-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <HiOutlineBeaker className="w-3 h-3" /> Pemeriksaan Diminta
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {order.orderedTestsSummary.slice(0, 3).map((t, i) => (
                          <span key={i} className="px-2 py-1 bg-white border border-sky-200 text-sky-700 rounded-lg text-[9px] font-black uppercase">
                            {t}
                          </span>
                        ))}
                        {order.orderedTestsSummary.length > 3 && (
                          <span className="px-2 py-1 bg-sky-100 text-sky-500 rounded-lg text-[9px] font-black uppercase">
                            +{order.orderedTestsSummary.length - 3} lagi
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lab Notes Preview */}
                  {order.labNotesSummary && (
                    <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1">Catatan Dokter</p>
                      <p className="text-[10px] font-medium text-amber-800 line-clamp-2">{order.labNotesSummary}</p>
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-50 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <FiUser className="w-3 h-3" /> dr. {order.doctor.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <HiOutlineBeaker className="w-3 h-3" /> {order.orderNo}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">No. Order</th>
                    <th className="text-left py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tgl Pemeriksaan</th>
                    <th className="text-left py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pasien</th>
                    <th className="text-left py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Dokter</th>
                    <th className="text-center py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-5 px-8">
                        <span className="text-xs font-black text-slate-800">{order.orderNo}</span>
                      </td>
                      <td className="py-5 px-6">
                        <span className="text-xs font-bold text-slate-500">{new Date(order.orderDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="py-5 px-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-800 uppercase">{order.patient.name}</span>
                          <span className="text-[10px] font-bold text-slate-400">{order.patient.medicalRecordNo}</span>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <span className="text-xs font-bold text-slate-600">dr. {order.doctor.name}</span>
                      </td>
                      <td className="py-5 px-8 text-center">
                        <button 
                          onClick={() => loadOrderDetails(order.id)}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm"
                        >
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="py-32 text-center bg-white border border-dashed border-slate-200 rounded-[3rem]">
            <HiOutlineBeaker className="w-16 h-16 text-slate-100 mx-auto mb-4" />
            <p className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">
              {activeStatus === 'pending' ? 'Tidak Ada Antrian Lab Pending' : 'Belum Ada Riwayat Lab'}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedOrder(null)} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200">
              <FiArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">{orderDetails?.patient.name}</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{orderDetails?.orderNo}</p>
            </div>
          </div>
          {!isReadOnly && (
            <div className="flex gap-2">
              <button 
                onClick={() => handleSaveResults('in_progress')}
                disabled={saving}
                className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 transition-all"
              >
                Simpan Draft
              </button>
              <button 
                onClick={() => handleSaveResults('completed')}
                disabled={saving}
                className="px-6 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
              >
                Kirim Hasil ke Dokter
              </button>
            </div>
          )}
          {isReadOnly && (
            <div className="flex items-center gap-4">
              <button 
                onClick={handlePreviewPDF}
                className="px-6 py-3 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-100 transition-all shadow-sm"
              >
                <FiSearch /> Preview
              </button>
              <button 
                onClick={generatePDF}
                className="px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
              >
                <FiPrinter /> Cetak Hasil Lab
              </button>
              <div className="px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <FiCheckCircle /> Hasil Sudah Terkirim
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Main Results Panel — Full Width */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm w-full">
            <div className="flex items-center justify-between mb-10 pb-6 border-b border-slate-50">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Input Hasil Parameter</h3>
              {!isReadOnly && (
                <div className="relative" id="master-dropdown-container">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMasterDropdownOpen(!isMasterDropdownOpen);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all border border-rose-100 shadow-sm"
                  >
                    <FiPlus /> Tambah Parameter
                  </button>
                  
                  <AnimatePresence>
                    {isMasterDropdownOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-3 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-2 max-h-[400px] overflow-y-auto"
                      >
                        <div className="p-3 border-b border-slate-50 mb-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pilih Parameter</p>
                        </div>
                        {testMasters.map(m => (
                          <button 
                            key={m.id} 
                            onClick={() => {
                              addTest(m);
                              setIsMasterDropdownOpen(false);
                            }} 
                            className="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 transition-colors flex flex-col gap-0.5 border-b border-slate-50 last:border-0 group"
                          >
                            <span className="uppercase group-hover:text-primary transition-colors">{m.name}</span>
                            <span className="text-[9px] text-slate-400 font-medium">{m.category} • {m.unit || 'No Unit'}</span>
                          </button>
                        ))}
                        {testMasters.length === 0 && (
                          <div className="p-4 text-center text-[10px] font-bold text-slate-300 uppercase">Master data kosong</div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Doctor Instructions Panel — shown when order is opened */}
            {orderDetails && (
              <div className="mb-8 rounded-[2rem] border border-sky-100 bg-gradient-to-br from-sky-50 to-indigo-50/30 overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-sky-100/60">
                  <div className="w-8 h-8 bg-sky-500 rounded-xl flex items-center justify-center shrink-0">
                    <FiClipboard className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Instruksi & Permintaan Dokter</p>
                    <p className="text-[9px] font-bold text-sky-400 uppercase tracking-widest">dr. {orderDetails.doctor?.name}</p>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Ordered Lab Tests — specific test masters chosen by doctor */}
                  {(() => {
                    const ordered: any[] = orderDetails.doctorInstructions?.orderedTests || []
                    // Also check consultationDraft as fallback
                    const draftLab = orderDetails.medicalRecord?.consultationDraft?.services?.filter((s: any) => s.isLab) || []
                    const finalServiceLab = orderDetails.medicalRecord?.services?.filter((s: any) =>
                      s.service?.serviceName?.toLowerCase().includes('lab') ||
                      s.service?.serviceCategory?.categoryName?.toLowerCase().includes('lab')
                    ) || []

                    const hasOrdered = ordered.length > 0
                    const hasDraft = draftLab.length > 0
                    const hasFinal = finalServiceLab.length > 0

                    if (!hasOrdered && !hasDraft && !hasFinal) return null

                    return (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <HiOutlineBeaker className="w-3 h-3" /> Pemeriksaan Yang Diminta
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {/* From doctorInstructions (specific test masters, most accurate) */}
                          {ordered.map((t: any, i: number) => {
                            const testMaster = testMasters.find((m: any) => m.name?.toLowerCase() === t.name?.toLowerCase())
                            return (
                              <button
                                key={`ordered-${i}`}
                                onClick={() => testMaster && !isReadOnly && addTest(testMaster)}
                                title={testMaster && !isReadOnly ? `Klik untuk tambah parameter "${testMaster.name}" ke hasil` : t.name}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase border transition-all shadow-sm
                                  ${testMaster && !isReadOnly
                                    ? results.find(r => r.testMasterId === testMaster.id)
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                                      : 'bg-white border-sky-200 text-sky-700 hover:bg-sky-500 hover:text-white hover:border-sky-500 cursor-pointer'
                                    : 'bg-white border-slate-200 text-slate-600 cursor-default'
                                  }`}
                              >
                                {testMaster && results.find(r => r.testMasterId === testMaster.id)
                                  ? <FiCheckCircle className="w-3 h-3 text-emerald-500" />
                                  : testMaster && !isReadOnly
                                    ? <FiPlus className="w-3 h-3" />
                                    : <HiOutlineBeaker className="w-3 h-3" />
                                }
                                {t.name}
                              </button>
                            )
                          })}

                          {/* From final services */}
                          {hasFinal && finalServiceLab.map((s: any) => (
                            <span key={s.id} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold uppercase shadow-sm">
                              <FiCheckCircle className="w-3 h-3 text-indigo-400" /> {s.service?.serviceName}
                            </span>
                          ))}

                          {/* From draft services */}
                          {!hasFinal && hasDraft && draftLab.map((s: any, idx: number) => {
                            const testMaster = testMasters.find((m: any) =>
                              m.name?.toLowerCase() === s.name?.toLowerCase() ||
                              m.code?.toLowerCase() === s.code?.toLowerCase()
                            )
                            return (
                              <button
                                key={`draft-${idx}`}
                                onClick={() => testMaster && !isReadOnly && addTest(testMaster)}
                                title={testMaster && !isReadOnly ? `Klik untuk tambah parameter "${s.name}"` : s.name}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase border transition-all shadow-sm
                                  ${testMaster && !isReadOnly
                                    ? results.find(r => r.testMasterId === testMaster.id)
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                                      : 'bg-white border-sky-200 text-sky-700 hover:bg-sky-500 hover:text-white hover:border-sky-500 cursor-pointer'
                                    : 'bg-white border-amber-200 text-amber-700 cursor-default'
                                  }`}
                              >
                                {testMaster && results.find(r => r.testMasterId === testMaster.id)
                                  ? <FiCheckCircle className="w-3 h-3 text-emerald-500" />
                                  : testMaster && !isReadOnly ? <FiPlus className="w-3 h-3" /> : <HiOutlineBeaker className="w-3 h-3" />
                                }
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                        {!isReadOnly && ordered.length > 0 && (
                          <p className="mt-3 text-[9px] font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1">
                            <FiPlus className="w-3 h-3" /> Klik badge biru untuk langsung tambah parameter ke tabel hasil
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Doctor's Lab Notes */}
                  {orderDetails.doctorInstructions?.labNotes && (
                    <div className="p-4 bg-white/70 rounded-2xl border border-sky-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Catatan / Instruksi Dokter</p>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                        {orderDetails.doctorInstructions.labNotes}
                      </p>
                    </div>
                  )}

                  {/* No instructions at all */}
                  {!orderDetails.doctorInstructions?.labNotes &&
                    !orderDetails.doctorInstructions?.orderedTests?.length &&
                    !orderDetails.medicalRecord?.consultationDraft?.services?.filter((s: any) => s.isLab).length &&
                    !orderDetails.medicalRecord?.services?.filter((s: any) =>
                      s.service?.serviceName?.toLowerCase().includes('lab')
                    ).length && (
                    <p className="text-[10px] font-bold text-slate-300 italic uppercase text-center py-2">
                      Tidak ada instruksi khusus dari dokter
                    </p>
                  )}
                </div>
              </div>
            )}

            {results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 w-[30%]">Parameter</th>
                      <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Hasil</th>
                      <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 w-24">Satuan</th>
                      <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 w-[25%]">Nilai Normal</th>
                      <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(results.reduce((acc, curr) => {
                      if (!acc[curr.category]) acc[curr.category] = []
                      acc[curr.category].push(curr)
                      return acc
                    }, {} as Record<string, typeof results>)).map(([category, items]) => (
                      <React.Fragment key={category}>
                        <tr>
                          <td colSpan={5} className="py-4 px-4 bg-slate-50/50">
                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{category}</span>
                          </td>
                        </tr>
                        {items.map((r, itemIdx) => {
                          // Find original index to update the state correctly
                          const idx = results.findIndex(res => res.testMasterId === r.testMasterId);
                          return (
                            <tr key={idx} className="border-b border-slate-50/50 group">
                              <td className="py-6 px-4 pl-8">
                                <p className="text-sm font-black text-slate-800 uppercase">{r.testName}</p>
                              </td>
                              <td className="py-4 px-4 w-full">
                                <input 
                                  value={r.resultValue} 
                                  disabled={isReadOnly}
                                  onChange={(e) => {
                                    const n = [...results]; 
                                    n[idx].resultValue = e.target.value;
                                    setResults(n);
                                  }}
                                  className={`w-full min-w-[160px] p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black focus:bg-white focus:border-primary outline-none transition-all disabled:opacity-75 disabled:bg-slate-100/50 ${r.isCritical ? 'text-rose-500 border-rose-200 bg-rose-50' : ''}`} 
                                  placeholder="Masukkan nilai..." 
                                />
                              </td>
                              <td className="py-6 px-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{r.unit || '-'}</span>
                              </td>
                              <td className="py-6 px-4">
                                <span className="text-[10px] font-bold text-slate-500 italic">{r.normalRange || '-'}</span>
                              </td>
                              <td className="py-6 px-4">
                                {!isReadOnly && (
                                  <button onClick={() => setResults(results.filter((_, i) => i !== idx))} className="p-2 text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                    <FiTrash2 />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-32 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/30">
                <FiPlus className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest leading-loose">Pilih parameter hasil<br/>untuk diinput</p>
              </div>
            )}
        </div>

        {/* Bottom Sidebar Row — 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Catatan Lab & Klinis</h4>
            <textarea 
              value={clinicalNotes}
              disabled={isReadOnly}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="w-full p-6 bg-slate-50 border border-slate-200 rounded-2xl min-h-[200px] text-sm font-bold focus:bg-white focus:border-primary outline-none transition-all disabled:opacity-75 disabled:bg-slate-100/50"
              placeholder={isReadOnly ? "Tidak ada catatan tambahan" : "Input catatan klinis atau kesimpulan hasil lab..."}
            />
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lampiran Dokumen & Foto</h4>
              {!isReadOnly && (
                <label className="cursor-pointer p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all">
                  <FiPlus className="w-4 h-4" />
                  <input 
                    type="file" 
                    className="hidden" 
                    multiple 
                    accept=".pdf,image/*" 
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                </label>
              )}
            </div>

            <div className="space-y-3">
              {orderDetails?.attachments?.map((file: any) => (
                <div key={file.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary transition-all">
                  <a 
                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api'}${file.fileUrl}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 overflow-hidden"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${file.fileType.includes('pdf') ? 'bg-rose-100 text-rose-500' : 'bg-blue-100 text-blue-500'}`}>
                      {file.fileType.includes('pdf') ? <FiFile className="w-5 h-5" /> : <FiImage className="w-5 h-5" />}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-black text-slate-700 truncate uppercase">{file.fileName}</p>
                      <p className="text-[9px] font-bold text-slate-400">{(file.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </a>
                  {!isReadOnly && (
                    <button 
                      onClick={() => handleDeleteAttachment(file.id)}
                      className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {(!orderDetails?.attachments || orderDetails.attachments.length === 0) && (
                <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <FiPaperclip className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Belum ada lampiran</p>
                </div>
              )}
              
              {uploading && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <FiRefreshCw className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Mengunggah...</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] border border-indigo-100/50">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FiAlertCircle /> Health Warning
            </p>
            <p className="text-[10px] font-medium text-indigo-700 leading-relaxed italic">
              Jika hasil pemeriksaan masuk dalam kategori KRITIS, harap segera memberitahu Dokter Pengirim melalui sistem atau telepon.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
