'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import { 
  FiActivity, FiCheckCircle, FiRefreshCw, FiUser, 
  FiHome, FiAlertCircle, FiClipboard, FiHeart, FiThermometer, FiWind,
  FiEdit3, FiTrash2, FiSearch, FiPackage, FiInfo, FiArrowLeft, FiSave, FiRotateCcw, FiPrinter,
  FiPlus, FiMinus, FiDollarSign, FiHash, FiClock, FiChevronDown, FiCalendar, FiLock, FiUnlock,
  FiMonitor
} from 'react-icons/fi'
import { HiOutlineBeaker } from 'react-icons/hi'
import { useAuthStore } from '@/lib/store/useAuthStore'
import { toast } from 'react-hot-toast'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

interface Queue {
  id: string
  patientId: string
  clinicId: string
  doctorId: string | null
  registrationId: string | null
  queueNo: string
  status: 'waiting' | 'called' | 'triage' | 'ready' | 'ongoing' | 'completed' | 'no-show'
  patient: { name: string; medicalRecordNo: string; gender: string; allergies?: string }
  doctor: { name: string; specialization: string } | null
  department: { name: string } | null
}

interface Referral {
  id: string
  type: 'INTERNAL' | 'EXTERNAL'
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  toClinicId?: string
  toDepartmentId?: string
  toHospitalName?: string
  notes?: string
  toClinic?: { name: string }
  toDepartment?: { name: string }
  createdAt: string
}

interface Template {
  id: string
  name: string
  type: 'SOAP' | 'PRESCRIPTION'
  content: any
}

interface MedicalRecordAttachment {
  id: string
  fileName: string
  filePath: string
  fileType: string
  createdAt: string
}

interface Medicine {
  id: string
  masterName: string
  masterCode: string
  medicineId: string | null
  stock: number
  availableStock?: number
  unit: string
  medicine?: {
    genericName: string
    dosageForm: string
    strength: string
  }
}

interface Service {
  id: string
  serviceCode: string
  serviceName: string
  price: number
  serviceCategory?: { categoryName: string }
}

export default function DoctorConsultationPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user, activeClinicId } = useAuthStore()
  
  const [queue, setQueue] = useState<Queue | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchMedicines, setSearchMedicines] = useState<Medicine[]>([])
  const [allServices, setAllServices] = useState<Service[]>([])
  const [filteredServices, setFilteredServices] = useState<Service[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  
  // Consultation State
  const [medicalRecord, setMedicalRecord] = useState<any>(null)
  const [subjective, setSubjective] = useState('')
  const [objective, setObjective] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [labNotes, setLabNotes] = useState('')
  const [labResults, setLabResults] = useState('')
  const [notes, setNotes] = useState('')
  const [hasInformedConsent, setHasInformedConsent] = useState(false)
  
  const [prescriptionItems, setPrescriptionItems] = useState<any[]>([])
  const [serviceItems, setServiceItems] = useState<any[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [attachments, setAttachments] = useState<any[]>([])
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)

  const [activeSegment, setActiveSegment] = useState<'nurse' | 'diag' | 'tindakan' | 'lab' | 'rx' | 'history' | 'referral' | 'attachment' | 'consent'>('nurse')
  const [searchMed, setSearchMed] = useState('')
  const [searchService, setSearchService] = useState('')

  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false)
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false)
  const [isMedDialogOpen, setIsMedDialogOpen] = useState(false)
  const [selectedMedicines, setSelectedMedicines] = useState<Medicine[]>([])
  
  // Referral State
  const [referralType, setReferralType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL')
  const [referralToClinicId, setReferralToClinicId] = useState('')
  const [referralToDepartmentId, setReferralToDepartmentId] = useState('')
  const [referralToHospitalName, setReferralToHospitalName] = useState('')
  const [referralNotes, setReferralNotes] = useState('')
  const [clinicsList, setClinicsList] = useState<any[]>([])
  const [departmentsList, setDepartmentsList] = useState<any[]>([])
  const [isPrinting, setIsPrinting] = useState(false)
  const [isReferralPreviewOpen, setIsReferralPreviewOpen] = useState(false)
  const [currentPrintReferral, setCurrentPrintReferral] = useState<any>(null)
  
  // Lab State
  const [labItems, setLabItems] = useState<any[]>([])
  const [labTestMasters, setLabTestMasters] = useState<any[]>([])
  const [searchLab, setSearchLab] = useState('')
  const [isLabDropdownOpen, setIsLabDropdownOpen] = useState(false)
  const [isLabPreviewOpen, setIsLabPreviewOpen] = useState(false)
  const [currentPrintLab, setCurrentPrintLab] = useState<any>(null)
  
  const [isRMEInfoOpen, setIsRMEInfoOpen] = useState(false)
  const hasFetchedRef = useRef<string | null>(null)
  const labDropdownRef = useRef<HTMLDivElement>(null)

  const isReadOnly = useMemo(() => queue?.status === 'completed', [queue])

  const latestVitals = useMemo(() => {
    return medicalRecord?.vitals?.[0] || null
  }, [medicalRecord])

  const fetchData = useCallback(async () => {
    if (!user || !id) return
    const fetchKey = `${String(id)}-${user.id}`
    if (hasFetchedRef.current === fetchKey) return
    hasFetchedRef.current = fetchKey
    setLoading(true)
    try {
      // Fetch specific queue
      const qRes = await api.get(`transactions/queues/${id}`)
      const qData = qRes.data
      setQueue(qData)
      const queueHeaders = qData?.clinicId ? { 'x-clinic-id': qData.clinicId } : undefined

      // Fetch independent resources in parallel to reduce total load time
      const [medicalRecordRes, historyRes, svcRes, labTestRes, templateRes, clinicsRes, deptsRes] = await Promise.all([
        qData.registrationId
          ? api.get(`transactions/medical-records/registration/${qData.registrationId}`)
          : Promise.resolve({ data: null }),
        qData.patientId
          ? api.get(`transactions/medical-records/patient/${qData.patientId}`)
          : Promise.resolve({ data: [] }),
        api.get('master/services', {
          params: { isActive: true, allClinics: true },
          headers: queueHeaders
        }),
        api.get('/lab/test-masters'),
        api.get('clinical/templates'),
        api.get('master/clinics'),
        api.get('master/departments')
      ])

      // Fetch draft medical record
      if (qData.registrationId) {
        const data = medicalRecordRes.data
        setMedicalRecord(data)
        if (data) {
          setSubjective(data.subjective || '')
          setObjective(data.objective || '')
          setDiagnosis(data.diagnosis || '')
          setTreatmentPlan(data.treatmentPlan || '')
          setLabNotes(data.labNotes || '')
          setLabResults(data.labResults || '')
          setNotes(data.notes || '')
          setHasInformedConsent(!!data.hasInformedConsent)
          setReferrals(data.referrals || [])
          setAttachments(data.attachments || [])
          
          if (data.prescriptions && data.prescriptions.length > 0) {
            const savedItems = data.prescriptions.flatMap((rx: any) =>
              rx.items.map((item: any) => ({
                medicineId: item.medicineId,
                name: item.medicine?.medicineName || 'Obat',
                quantity: item.quantity,
                dosage: item.dosage,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions || '',
                unit: item.unit || item.medicine?.unit || 'unit',
                availableStock: item.medicine?.stock ?? 0,
                alreadySavedInDB: true // Flag: already persisted, skip frontend stock check
              }))
            )
            setPrescriptionItems(savedItems)
          }

          if (data.consultationDraft) {
             const draft = data.consultationDraft;
             if (draft.prescriptions) {
               // Merge draft prescriptions with availableStock from previously loaded DB prescriptions
               // to avoid losing stock info when draft overrides
               setPrescriptionItems(draft.prescriptions.map((dp: any) => ({
                 ...dp,
                 // Keep availableStock if it exists in draft, else mark as unknown (server will validate)
                 availableStock: dp.availableStock ?? undefined,
                 alreadySavedInDB: false
               })));
             }
             if (draft.services) {
                // Separate general services and lab services
                const generalServices = draft.services.filter((s: any) => !s.isLab);
                const labServices = draft.services.filter((s: any) => s.isLab);
                
                setServiceItems(generalServices);
                // Map labServices back to the format expected by labItems state if needed
                setLabItems(labServices.map((s: any) => ({
                   id: s.serviceId,
                   serviceName: s.name || s.serviceName,
                   price: s.price,
                   serviceCode: s.code || s.serviceCode
                })));
             }
          }
           // In actual completed items, they should come from actual medical record services if present
           if (data.services && data.services.length > 0 && qData.status === 'completed') {
             const allSavedServices = data.services.map((s: any) => ({
               serviceId: s.serviceId,
               name: s.service?.serviceName || 'Layanan',
               code: s.service?.serviceCode || '',
               price: s.price,
               quantity: s.quantity,
               // Check if it's a lab service based on code or name
               isLab: s.service?.serviceCode === 'LAB-GEN' || 
                      s.service?.serviceName?.toLowerCase().includes('lab')
             }));

             setServiceItems(allSavedServices.filter((s: any) => !s.isLab));
             setLabItems(allSavedServices.filter((s: any) => s.isLab).map((s: any) => ({
               id: s.serviceId,
               serviceName: s.name,
               price: s.price,
               serviceCode: s.code
             })));
           }
        }

        setHistory((historyRes.data || []).filter((h: any) => h.id !== data?.id))
      } else {
        setMedicalRecord(null)
        setHistory(historyRes.data || [])
      }

      // Fetch services for tindakan based on queue's clinic context
      const servicesData = svcRes.data.data || svcRes.data
      setAllServices(Array.isArray(servicesData) ? servicesData : [])

      // Set Lab Test Masters
      setLabTestMasters(Array.isArray(labTestRes.data) ? labTestRes.data : [])

      // Fetch templates, clinics, depts
      setTemplates(templateRes.data)
      setClinicsList(clinicsRes.data)
      setDepartmentsList(deptsRes.data)

    } catch (e) {
      console.error('Failed to fetch consultation data', e)
      hasFetchedRef.current = null
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    hasFetchedRef.current = null
    fetchData()
  }, [fetchData])

  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (labDropdownRef.current && !labDropdownRef.current.contains(event.target as Node)) {
        setIsLabDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Medicine Search Logic
  useEffect(() => {
    if (isReadOnly) return
    const controller = new AbortController()
    
    const searchTimeout = setTimeout(async () => {
      // Tampilkan dropdown jika sedang dibuka, tidak peduli panjang search text
      if (!isMedDropdownOpen && !isMedDialogOpen) {
        setSearchMedicines([])
        return
      }
      try {
        const medRes = await api.get('master/products', { 
          headers: queue?.clinicId ? { 'x-clinic-id': queue.clinicId } : undefined,
          params: { 
            isActive: true, 
            search: searchMed || undefined, 
            limit: 50, // Tingkatkan limit agar lebih banyak produk muncul
            clinicId: queue?.clinicId
          },
          signal: controller.signal
        })
        const list = medRes.data.data || medRes.data
        // Filter produk yang punya medicineId (obat klinis) ATAU compoundFormulaId (racikan)
        setSearchMedicines(Array.isArray(list) ? list.filter((m: any) => m.medicineId || m.compoundFormulaId) : [])
      } catch (e: any) {
        if (e.name === 'CanceledError' || e.name === 'AbortError') {
          // Silently ignore aborted requests
          return
        }
        console.error('Medicine search failed:', e)
      }
    }, 300)

    return () => {
      clearTimeout(searchTimeout)
      controller.abort()
    }
  }, [searchMed, isMedDropdownOpen, isMedDialogOpen, isReadOnly, queue?.clinicId])

  // Service Search Logic
  useEffect(() => {
    if (isReadOnly || (!searchService && !isServiceDropdownOpen)) {
      setFilteredServices([])
      return
    }
    const searchLower = searchService.toLowerCase()
    const filtered = allServices.filter(s => {
      // Exclude laboratory services from Tindakan Medis
      const categoryName = s.serviceCategory?.categoryName?.toLowerCase() || '';
      const serviceName = s.serviceName.toLowerCase();
      
      const isLab = categoryName.includes('laboratorium') || 
                    categoryName.includes('lab') || 
                    serviceName.includes('lab');
      
      if (isLab) return false;
      
      return !searchService || 
        serviceName.includes(searchLower) ||
        s.serviceCode.toLowerCase().includes(searchLower);
    })
    setFilteredServices(filtered.slice(0, 100))
  }, [searchService, allServices, isServiceDropdownOpen, isReadOnly])

  // Click Outside to Close
  useEffect(() => {
    const handleClickOutside = () => {
      setIsMedDropdownOpen(false)
      setIsServiceDropdownOpen(false)
    }
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  const addPrescription = (m: Medicine) => {
    // Allow both medicine products (medicineId) and compound formula products (compoundFormulaId)
    if ((!m.medicineId && !(m as any).compoundFormulaId) || isReadOnly) return
    setPrescriptionItems([...prescriptionItems, {
      medicineId: m.medicineId || m.id, // Use product id if medicineId is null (for compound formulas)
      name: m.masterName,
      quantity: 1,
      availableStock: m.availableStock ?? m.stock,
      dosage: m.medicine?.strength || '',
      frequency: '3x1',
      duration: '5 hari',
      instructions: 'Sesudah makan',
      unit: m.unit || 'unit' // Tambahkan satuan
    }])
    setSearchMed('')
  }

  const addServiceItem = (s: Service) => {
    if (isReadOnly || serviceItems.find(item => item.serviceId === s.id)) return
    setServiceItems([...serviceItems, {
      serviceId: s.id,
      name: s.serviceName,
      code: s.serviceCode,
      price: s.price,
      quantity: 1
    }])
    setSearchService('')
  }

  const handleReopen = async () => {
    if (!confirm('Buka kembali rekam medis ini untuk pengeditan? Status antrean akan dikembalikan ke "Processing".')) return
    try {
      setLoading(true)
      await api.patch(`transactions/queues/${id}/status`, { status: 'processing' })
      toast.success('Rekam medis berhasil dibuka kembali')
      hasFetchedRef.current = null
      fetchData()
    } catch (e: any) {
      toast.error('Gagal membuka kembali rekam medis: ' + (e.response?.data?.message || e.message))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConsultation = async (isFinal: boolean = true, goToPrescription: boolean = false) => {
    if (!queue || !medicalRecord || isReadOnly) return

    // Confirmation dialog for final saving
    if (isFinal) {
      const confirmSave = window.confirm(
        "Konfirmasi Penyelesaian Pemeriksaan\n\n" +
        "Apakah Anda yakin ingin menyelesaikan pemeriksaan ini? \n" +
        "Setelah disimpan, rekam medis akan dikunci secara permanen untuk keperluan arsip (Archive) dan tidak dapat dibuka kembali untuk pengeditan. \n\n" +
        "Pastikan semua diagnosis, tindakan, dan resep obat sudah benar."
      );
      if (!confirmSave) return;
    }

    setSaving(true)
    const toastId = toast.loading(isFinal ? 'Menyimpan hasil konsultasi...' : 'Menyimpan draft...')
    try {
      // Validate prescription quantities against stock
      // Skip validation for items already saved in DB (alreadySavedInDB=true)
      // Server will perform authoritative real-time stock check
      for (const p of prescriptionItems) {
        if (p.alreadySavedInDB) continue // Already in DB, server validates against real-time stock
        if (p.availableStock !== undefined && p.availableStock !== null && (parseInt(p.quantity) || 0) > p.availableStock) {
          toast.error(`Stok tidak mencukupi untuk ${p.name} (Tersedia: ${p.availableStock})`, { id: toastId })
          setSaving(false)
          return
        }
      }

      await api.post('transactions/medical-records/doctor', {
        queueId: queue.id,
        medicalRecordId: medicalRecord.id,
        subjective,
        objective,
        diagnosis,
        treatmentPlan,
        labNotes,
        labResults,
        notes,
        hasInformedConsent,
        services: [
          ...serviceItems.map(s => ({ 
            serviceId: s.serviceId, 
            name: s.name,
            code: s.code,
            quantity: parseInt(s.quantity as any) || 0, 
            price: parseFloat(s.price as any) || 0 
          })),
          ...labItems.map(l => ({
            serviceId: l.id,
            name: l.serviceName,
            code: l.serviceCode,
            quantity: 1,
            price: l.price || 0,
            isLab: true
          }))
        ],
        prescriptions: prescriptionItems.map(p => ({
          ...p,
          quantity: parseInt(p.quantity) || 0
        })),
        isFinal
      })
      
      toast.success(isFinal ? 'Pemeriksaan selesai!' : 'Draft disimpan!', { id: toastId })
      
      if (goToPrescription) {
        // Asumsi format route pasien: /doctor/patients/[id]?tab=prescriptions
        router.push(`/doctor/patients/${queue.patientId}?tab=prescriptions`)
      } else if (isFinal) {
        router.push('/doctor/queue')
      }
    } catch (e) {
      toast.error('Gagal menyimpan data', { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndPrintReferral = async () => {
    if (!medicalRecord || !queue) {
      toast.error('Gagal membuat rujukan: Rekam medis tidak ditemukan')
      return
    }

    if (referralType === 'INTERNAL' && (!referralToClinicId || !referralToDepartmentId)) {
      toast.error('Harap pilih Klinik dan Poli tujuan')
      return
    }
    if (referralType === 'EXTERNAL' && !referralToHospitalName) {
      toast.error('Harap isi nama RS tujuan')
      return
    }

    const toastId = toast.loading('Menyimpan surat rujukan...')
    try {
      const payload = {
        medicalRecordId: medicalRecord.id,
        type: referralType,
        toClinicId: referralType === 'INTERNAL' ? referralToClinicId : undefined,
        toDepartmentId: referralType === 'INTERNAL' ? referralToDepartmentId : undefined,
        toHospitalName: referralType === 'EXTERNAL' ? referralToHospitalName : undefined,
        notes: referralNotes
      }
      
      const res = await api.post('clinical/referrals', payload)
      
      toast.success('Rujukan berhasil disimpan', { id: toastId })
      
      // Update local referrals list
      setReferrals([res.data, ...referrals])
      
      // Set print data and trigger print
      setCurrentPrintReferral(res.data)
      setIsReferralPreviewOpen(true)
      
      // Reset form
      setReferralNotes('')
      setReferralToClinicId('')
      setReferralToDepartmentId('')
      setReferralToHospitalName('')
      
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal menyimpan rujukan', { id: toastId })
    }
  }

  const generateLabPDF = async (patientName: string) => {
    const printElement = document.getElementById('print-lab-template')
    if (!printElement) {
      setIsPrinting(false)
      return
    }
    
    try {
      const toastId = toast.loading('Memproses PDF Order Lab...')
      const canvas = await html2canvas(printElement, {
        scale: 2,
        useCORS: true,
        logging: false
      })
      
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = 210
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      
      const dateStr = new Date().toISOString().split('T')[0]
      pdf.save(`Order_Lab_${patientName.replace(/\s+/g, '_')}_${dateStr}.pdf`)
      toast.success('Order Lab berhasil diunduh', { id: toastId })
      
    } catch (e) {
      console.error('Error generating Lab PDF:', e)
      toast.error('Gagal menghasilkan file PDF Order Lab')
    } finally {
      setIsPrinting(false)
    }
  }

  const generateLabResultPDF = (order: any) => {
    if (!order || !queue) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // --- Header / Letterhead ---
    // Note: In doctor view, we might not have full clinic details in the order, 
    // but we can try to get them from activeClinic (though not stored here yet)
    // For now, use the order's clinic if available or fallback
    const clinic = order.medicalRecord?.clinic;
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
    doc.text(`No. Rekam Medis : ${queue.patient.medicalRecordNo}`, leftX, currentY);
    doc.text(`Nama Pasien      : ${queue.patient.name}`, leftX, currentY + 7);

    // Right Column
    doc.text(`No. Order        : ${order.orderNo}`, rightX, currentY);
    doc.text(`Tgl. Pemeriksaan : ${new Date(order.orderDate).toLocaleString('id-ID')}`, rightX, currentY + 7);

    currentY += 20;

    // --- Results Table ---
    const tableData = order.results.map((r: any) => [
      r.testMaster?.name || '-',
      r.resultValue,
      r.testMaster?.unit || '-',
      r.testMaster?.normalRangeText || '-',
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

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    const signY = finalY + 40;
    doc.text('Petugas Laboratorium,', pageWidth - 60, signY);
    doc.text('( ____________________ )', pageWidth - 60, signY + 25);

    doc.save(`Hasil_Lab_${order.orderNo}_${queue.patient.name}.pdf`);
  }

  const handlePrintLabOrder = () => {
    if (labItems.length === 0 && !labNotes) {
      toast.error('Harap pilih pemeriksaan atau isi catatan lab')
      return
    }
    setIsLabPreviewOpen(true)
  }

  const generatePDF = async (patientName: string) => {
    const printElement = document.getElementById('print-referral-template')
    if (!printElement) {
      setIsPrinting(false)
      return
    }
    
    try {
      const toastId = toast.loading('Memproses PDF...')
      // Capture the element
      const canvas = await html2canvas(printElement, {
        scale: 2, // High resolution
        useCORS: true,
        logging: false
      })
      
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      
      // A4 size: 210 x 297 mm
      const pdfWidth = 210
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      
      const dateStr = new Date().toISOString().split('T')[0]
      pdf.save(`Surat_Rujukan_${patientName.replace(/\s+/g, '_')}_${dateStr}.pdf`)
      toast.success('PDF berhasil diunduh', { id: toastId })
      
    } catch (e) {
      console.error('Error generating PDF:', e)
      toast.error('Gagal menghasilkan file PDF')
    } finally {
      setIsPrinting(false)
    }
  }

  const handleReprintReferral = (referral: any) => {
    setCurrentPrintReferral(referral)
    setIsReferralPreviewOpen(true)
  }

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !medicalRecord || !queue) return

    setIsUploadingAttachment(true)
    const toastId = toast.loading('Mengunggah file...')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('medicalRecordId', medicalRecord.id)

      const res = await api.post('clinical/attachments', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setAttachments([...attachments, res.data])
      toast.success('File berhasil diunggah', { id: toastId })
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal mengunggah file', { id: toastId })
    } finally {
      setIsUploadingAttachment(false)
      // reset file input
      e.target.value = ''
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus lampiran ini?')) return
    
    const toastId = toast.loading('Menghapus lampiran...')
    try {
      await api.delete(`clinical/attachments/${attachmentId}`)
      setAttachments(attachments.filter(a => a.id !== attachmentId))
      toast.success('Lampiran berhasil dihapus', { id: toastId })
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menghapus lampiran', { id: toastId })
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <FiRefreshCw className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Inisialisasi Konsultasi...</p>
        </div>
      </div>
    )
  }

  if (!queue) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-black text-gray-900 mb-2">Pasien Tidak Ditemukan</h2>
          <button onClick={() => router.back()} className="text-primary font-bold hover:underline">Kembali</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Professional Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200">
              <FiArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">{queue.patient.name}</h1>
                <span className="text-[10px] font-black px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 uppercase tracking-wider">{queue.patient.medicalRecordNo}</span>
                {queue.patient.gender && (
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border uppercase tracking-wider ${['L', 'M', 'Laki-laki'].includes(queue.patient.gender) ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    {['L', 'M', 'Laki-laki'].includes(queue.patient.gender) ? 'Laki-laki' : 'Perempuan'}
                  </span>
                )}
                <button 
                  onClick={() => setIsRMEInfoOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-400 text-white rounded-xl text-[9px] font-black hover:bg-amber-500 transition-all shadow-lg shadow-amber-200 animate-pulse"
                >
                  <FiInfo className="w-3 h-3" /> PANDUAN RME
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  {queue.department?.name || 'UMUM'} • No. Antrean: <span className="text-slate-900">{queue.queueNo}</span>
                </p>
                {queue.patient.allergies && (
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-200"
                  >
                    <FiAlertCircle className="w-3 h-3" /> ALERGI: {queue.patient.allergies}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isReadOnly ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-3 px-6 py-3 bg-slate-100 text-slate-500 rounded-xl border border-slate-200 cursor-default">
                   <FiLock className="w-4 h-4" />
                   <span className="text-[10px] font-black uppercase tracking-widest leading-none">REKAM MEDIS TERKUNCI</span>
                </div>
                {/* Buka Kembali hidden per request to maintain record integrity once locked */}
              </div>
            ) : (
              <>
                <button onClick={() => handleSaveConsultation(false)} disabled={saving} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm">
                  <span className="flex items-center gap-2"><FiSave /> SIMPAN DRAFT</span>
                </button>
                <button onClick={() => handleSaveConsultation(true)} disabled={saving} className="px-6 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20">
                  <span className="flex items-center gap-2"><FiCheckCircle /> SELESAI PEMERIKSAAN</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 grid grid-cols-12 gap-6 items-start">
        {/* Navigation Segments */}
        <div className="col-span-12 lg:col-span-3 space-y-6 lg:sticky lg:top-28">
          <div className="bg-white p-2 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {[
              { id: 'nurse', label: 'Nurse Handover', icon: <FiClipboard /> },
              { id: 'diag', label: 'SOAP & Diagnosa', icon: <FiActivity /> },
              { id: 'referral', label: 'Rujukan Medis', icon: <FiArrowLeft className="rotate-180" /> },
              { id: 'rx', label: 'Resep Obat (Rx)', icon: <FiPackage /> },
              { id: 'tindakan', label: 'Tindakan Medis', icon: <FiCheckCircle /> },
              { id: 'lab', label: 'Laboratorium', icon: <HiOutlineBeaker /> },
              { id: 'attachment', label: 'Lampiran / Media', icon: <FiPackage /> },
              { id: 'consent', label: 'Persetujuan (Consent)', icon: <FiLock /> },
              { id: 'history', label: 'Riwayat Pasien', icon: <FiRotateCcw /> },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSegment(s.id as any)}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black transition-all mb-1 ${
                  activeSegment === s.id 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">{s.icon}</span>
                <span className="uppercase tracking-widest">{s.label}</span>
              </button>
            ))}
          </div>

          {latestVitals && (
            <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-12 -mt-12 transition-all group-hover:scale-110" />
              <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-4 flex items-center gap-2 opacity-60">
                <FiActivity className="w-3 h-3" /> Tanda Vital Terakhir
              </h4>
              <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                <div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Tensi</p>
                  <p className="text-sm font-black text-slate-800">{latestVitals.bloodPressure || '-'} <span className="text-[9px] opacity-40 font-bold ml-0.5">mmHg</span></p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Suhu</p>
                  <p className="text-sm font-black text-slate-800">{latestVitals.temperature || '-'} <span className="text-[9px] opacity-40 font-bold ml-0.5">°C</span></p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">BB/TB</p>
                  <p className="text-sm font-black text-slate-800">{latestVitals.weight || '-'}/{latestVitals.height || '-'} <span className="text-[9px] opacity-40 font-bold ml-0.5">kg/cm</span></p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Napas</p>
                  <p className="text-sm font-black text-slate-800">{latestVitals.respiratoryRate || '-'} <span className="text-[9px] opacity-40 font-bold ml-0.5">x/m</span></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="col-span-12 lg:col-span-9">
          {isReadOnly && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-700">
               <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
               <p className="text-xs font-bold uppercase tracking-tight">Kunjungan ini Telah Selesai. Data rekam medis dalam mode baca-saja dan tidak dapat diubah lagi.</p>
            </div>
          )}
          <AnimatePresence mode="wait">
            {activeSegment === 'nurse' && (
              <motion.div key="nurse" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[400px]">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8 border-b border-slate-50 pb-6">Keluhan Utama (Handover Perawat)</h3>
                  <div className="p-10 bg-slate-50/50 rounded-3xl italic text-xl text-slate-600 font-medium leading-relaxed border border-slate-100">
                    "{medicalRecord?.chiefComplaint || 'Tidak ada catatan keluhan.'}"
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'diag' && (
              <motion.div key="diag" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[400px]">
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-50">
                     <div className="flex items-center gap-3">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Medical Documentation (S-O-A-P)</h3>
                     </div>
                     <div className="flex items-center gap-2">
                        {templates.length > 0 && (
                          <div className="relative group">
                            <button className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 text-primary text-[10px] font-black rounded-lg hover:bg-primary hover:text-white transition-all">
                              <FiPackage /> PILIH TEMPLATE
                            </button>
                            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl invisible group-hover:visible z-50 p-2 overflow-hidden">
                              <div className="p-3 border-b border-slate-50 mb-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Skenario Klinis</p>
                              </div>
                              {templates.filter(t => t.type === 'SOAP').map(t => (
                                <button key={t.id} onClick={() => {
                                  setSubjective(t.content.subjective || '');
                                  setObjective(t.content.objective || '');
                                  setDiagnosis(t.content.diagnosis || '');
                                  setTreatmentPlan(t.content.treatmentPlan || '');
                                }} className="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-[11px] font-bold text-slate-700 transition-colors">
                                  {t.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">Standardized Format</span>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* S Quadrant */}
                    <div className="space-y-3 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">S</div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-slate-900 transition-colors">Subjective (Anamnesa)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={subjective} onChange={(e) => setSubjective(e.target.value)} className={`w-full p-6 border border-slate-200 rounded-3xl min-h-[160px] text-sm font-bold focus:bg-white focus:border-slate-900 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-slate-50'}`} placeholder="Keluhan utama, riwayat penyakit..." />
                    </div>

                    {/* O Quadrant */}
                    <div className="space-y-3 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">O</div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-slate-900 transition-colors">Objective (Pemeriksaan)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={objective} onChange={(e) => setObjective(e.target.value)} className={`w-full p-6 border border-slate-200 rounded-3xl min-h-[160px] text-sm font-bold focus:bg-white focus:border-slate-900 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-slate-50'}`} placeholder="Pemeriksaan fisik, tanda klinis..." />
                    </div>

                    {/* A Quadrant */}
                    <div className="space-y-3 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black">A</div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-primary transition-colors">Assessment (Diagnosa)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={`w-full p-6 border border-slate-200 rounded-3xl min-h-[160px] text-sm font-bold focus:bg-white focus:border-primary outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-slate-50'}`} placeholder="Diagnosa medis, ICD-10..." />
                    </div>

                    {/* P Quadrant */}
                    <div className="space-y-3 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black">P</div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-emerald-500 transition-colors">Plan (Terapi/Rencana)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} className={`w-full p-6 border border-slate-200 rounded-3xl min-h-[160px] text-sm font-bold focus:bg-white focus:border-emerald-500 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-slate-50'}`} placeholder="Rencana pengobatan, edukasi..." />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'rx' && (
              <motion.div key="rx" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[500px]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-8 border-b border-slate-50">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Resep Obat (Rx)</h3>
                      <p className="text-[10px] font-bold text-slate-400">Daftar obat yang diberikan kepada pasien</p>
                    </div>
                    {!isReadOnly && (
                      <div className="flex gap-4">
                         <button 
                           onClick={() => {
                             setIsMedDialogOpen(true)
                             setSelectedMedicines([]) // Reset selection when opening
                             setSearchMed('') // Reset search
                           }} 
                           className="px-6 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2"
                         >
                           <FiPlus className="w-4 h-4" /> PILIH OBAT
                         </button>
                         <button 
                           onClick={() => handleSaveConsultation(false, true)} 
                           className="px-6 py-4 bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all flex items-center gap-2"
                         >
                           <FiSave className="w-4 h-4" /> SIMPAN & BUKA RESEP
                         </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {prescriptionItems.map((p, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }} 
                        key={idx} 
                        className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 hover:border-slate-300 transition-all"
                      >
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                          <div className="flex-1 min-w-[300px]">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
                                  <FiPackage />
                               </div>
                               <div>
                                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{p.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{p.dosage}</p>
                                    {p.unit && (
                                      <>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-[9px] font-black text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded">
                                          Satuan: {p.unit}
                                        </span>
                                      </>
                                    )}
                                  </div>
                               </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-4 flex-1">
                            <div className="flex-1 min-w-[120px]">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block flex items-center justify-between">
                                <span>Frekuensi</span>
                                {p.availableStock !== undefined && (
                                  <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black border ${p.availableStock > 10 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                    STOK: {p.availableStock}
                                  </span>
                                )}
                              </label>
                              <input disabled={isReadOnly} value={p.frequency} onChange={(e) => { const n = [...prescriptionItems]; n[idx].frequency = e.target.value; setPrescriptionItems(n); }} placeholder="e.g. 3x1" className={`w-full px-4 py-2 text-xs font-black border border-slate-200 rounded-xl focus:border-primary outline-none ${isReadOnly ? 'bg-slate-50' : 'bg-white'}`} />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Instruksi Khusus</label>
                              <select 
                                disabled={isReadOnly} 
                                value={['Sesudah makan', 'Sebelum makan'].includes(p.instructions) ? p.instructions : 'Lainnya'} 
                                onChange={(e) => { 
                                  const val = e.target.value;
                                  const n = [...prescriptionItems]; 
                                  if (val !== 'Lainnya') {
                                    n[idx].instructions = val; 
                                  } else {
                                    n[idx].instructions = '';
                                  }
                                  setPrescriptionItems(n); 
                                }} 
                                className={`w-full px-4 py-2 text-xs font-black border border-slate-200 rounded-xl focus:border-primary outline-none mb-2 ${isReadOnly ? 'bg-slate-50' : 'bg-white'}`}
                              >
                                <option value="Sesudah makan">Sesudah makan</option>
                                <option value="Sebelum makan">Sebelum makan</option>
                                <option value="Lainnya">Lainnya / Manual...</option>
                              </select>
                              {(!['Sesudah makan', 'Sebelum makan'].includes(p.instructions) || p.instructions === '') && (
                                <input 
                                  disabled={isReadOnly} 
                                  value={p.instructions} 
                                  onChange={(e) => { const n = [...prescriptionItems]; n[idx].instructions = e.target.value; setPrescriptionItems(n); }} 
                                  placeholder="Ketik instruksi manual..." 
                                  className={`w-full px-4 py-2 text-xs font-black border border-slate-200 rounded-xl focus:border-primary outline-none ${isReadOnly ? 'bg-slate-50' : 'bg-white'}`} 
                                />
                              )}
                            </div>
                            <div className="w-32">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                Qty {p.unit && <span className="text-primary">({p.unit})</span>}
                              </label>
                              <div className={`flex flex-col border border-slate-200 rounded-xl overflow-hidden ${isReadOnly ? 'bg-slate-50' : 'bg-white'} ${(p.availableStock !== undefined && (parseInt(p.quantity) || 0) > p.availableStock) ? 'border-rose-500 bg-rose-50' : ''}`}>
                                 <input 
                                    disabled={isReadOnly} 
                                    type="number" 
                                    value={p.quantity} 
                                    onChange={(e) => { 
                                      const val = parseInt(e.target.value) || 0;
                                      if (p.availableStock !== undefined && val > p.availableStock) {
                                        toast.error(`Stok tidak mencukupi (Tersedia: ${p.availableStock})`);
                                      }
                                      const n = [...prescriptionItems]; 
                                      n[idx].quantity = e.target.value; 
                                      setPrescriptionItems(n); 
                                    }} 
                                    className="w-full text-center py-2 text-xs font-black outline-none bg-transparent" 
                                 />
                              </div>
                              {p.availableStock !== undefined && (parseInt(p.quantity) || 0) > p.availableStock && (
                                <p className="text-[8px] font-black text-rose-500 uppercase mt-1 text-center animate-pulse">Melebihi Stok!</p>
                              )}
                            </div>
                            {!isReadOnly && (
                              <div className="flex items-end">
                                 <button onClick={() => setPrescriptionItems(prescriptionItems.filter((_, i) => i !== idx))} className="p-3 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                                    <FiTrash2 className="w-5 h-5" />
                                 </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {prescriptionItems.length === 0 && (
                      <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/20">
                        <FiPackage className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                        <p className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">Daftar Resep Masih Kosong</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'tindakan' && (
              <motion.div key="tindakan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[500px]">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-8 border-b border-slate-50">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Tindakan Medis</h3>
                      <p className="text-[10px] font-bold text-slate-400">Daftar layanan atau tindakan yang diberikan</p>
                    </div>
                    {!isReadOnly && (
                      <div className="relative w-full md:w-96 group" onClick={(e) => e.stopPropagation()}>
                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        <input 
                          value={searchService} 
                          onChange={(e) => setSearchService(e.target.value)} 
                          onFocus={() => setIsServiceDropdownOpen(true)}
                          placeholder="Cari tindakan atau kode layanan..." 
                          className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none focus:bg-white focus:border-emerald-500 shadow-sm group-focus-within:ring-4 group-focus-within:ring-emerald-500/5 transition-all" 
                        />
                        <button 
                          onClick={() => setIsServiceDropdownOpen(!isServiceDropdownOpen)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-emerald-500 transition-colors p-1"
                        >
                          <FiChevronDown className={`w-4 h-4 transition-transform ${isServiceDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <AnimatePresence>
                          {filteredServices.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full left-0 w-full bg-white border border-slate-100 rounded-3xl shadow-2xl mt-3 z-50 p-2">
                              {filteredServices.map(s => (
                                <button key={s.id} onClick={() => addServiceItem(s)} className="w-full p-4 hover:bg-slate-50 text-left rounded-2xl transition-all group flex items-center justify-between gap-4 border-b border-slate-50 last:border-0 mb-1">
                                  <div>
                                    <p className="text-xs font-black text-slate-800 group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{s.serviceName}</p>
                                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{s.serviceCode}</p>
                                  </div>
                                  <p className="text-xs font-black text-slate-600">
                                    Rp {new Intl.NumberFormat('id-ID').format(s.price)}
                                  </p>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {serviceItems.map((s, idx) => (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100 flex items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                              <FiCheckCircle />
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{s.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{s.code}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-8">
                           <div className="text-right">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Biaya</p>
                              <p className="text-sm font-black text-slate-800 tracking-tight">Rp {new Intl.NumberFormat('id-ID').format(s.price * s.quantity)}</p>
                           </div>
                           {!isReadOnly && (
                            <button onClick={() => setServiceItems(serviceItems.filter((_, i) => i !== idx))} className="p-3 text-emerald-300 hover:text-rose-500 hover:bg-white rounded-xl transition-all">
                                <FiTrash2 className="w-5 h-5" />
                            </button>
                           )}
                        </div>
                      </motion.div>
                    ))}
                    {serviceItems.length === 0 && (
                      <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/20">
                        <FiCheckCircle className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                        <p className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">Belum Ada Tindakan Medis</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'lab' && (
              <motion.div key='lab' initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className='space-y-6'>
                <div className='bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[600px] flex flex-col'>
                  <div className='flex items-center justify-between mb-8 pb-6 border-b border-slate-50'>
                     <div className='flex items-center gap-4'>
                        <div className='w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 shadow-sm border border-rose-100'>
                           <HiOutlineBeaker className='w-6 h-6' />
                        </div>
                        <div>
                           <h3 className='text-xs font-black text-slate-800 uppercase tracking-widest leading-none'>Laboratory Diagnostic Center</h3>
                           <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2'>Pilih pemeriksaan dan kelola hasil lab</p>
                        </div>
                     </div>
                     <div className='flex items-center gap-3'>
                        <button 
                           onClick={handlePrintLabOrder}
                           className='px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2'
                        >
                           <FiPrinter /> Cetak Order Lab
                        </button>
                         <button 
                            onClick={() => {
                               hasFetchedRef.current = null;
                               fetchData();
                            }}
                            className='px-6 py-3 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:shadow-xl hover:-translate-y-0.5 transition-all shadow-lg shadow-rose-200 flex items-center gap-2 animate-pulse hover:animate-none'
                         >
                            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Hasil
                         </button>
                     </div>
                  </div>

                  <div className='grid grid-cols-12 gap-10 flex-1'>
                     <div className='col-span-7 space-y-8'>
                        <div className='relative group' ref={labDropdownRef}>
                           <label className='text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 group-focus-within:text-rose-500 transition-colors'>Cari Pemeriksaan Lab</label>
                           <div className='mt-3 relative'>
                              <button 
                                 onClick={() => setIsLabDropdownOpen(!isLabDropdownOpen)}
                                 className='absolute inset-y-0 right-4 flex items-center z-10 text-slate-400 hover:text-rose-500 transition-colors'
                              >
                                 <FiChevronDown className={`w-5 h-5 transition-transform ${isLabDropdownOpen ? 'rotate-180' : ''}`} />
                              </button>
                              <div className='absolute inset-y-0 left-6 flex items-center pointer-events-none'>
                                 <FiSearch className='text-slate-400 group-focus-within:text-rose-500 transition-colors' />
                              </div>
                              <input 
                                 type='text' 
                                 value={searchLab}
                                 onChange={(e) => {
                                    setSearchLab(e.target.value);
                                    setIsLabDropdownOpen(true);
                                 }}
                                 onFocus={() => setIsLabDropdownOpen(true)}
                                 className='w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:bg-white focus:border-rose-500 outline-none transition-all'
                                 placeholder='Ketik nama pemeriksaan (ex: Darah Lengkap)...'
                              />
                              <AnimatePresence>
                                 {isLabDropdownOpen && (
                                    <motion.div 
                                       initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                       className='absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-[300px] overflow-y-auto'
                                    >
                                       {(() => {
                                          const labFiltered = labTestMasters.filter(s => {
                                             const search = searchLab.toLowerCase();
                                             const name = s.name.toLowerCase();
                                             const category = s.category?.toLowerCase() || '';
                                             
                                             if (!search) return true;
                                             return name.includes(search) || category.includes(search) || s.code.toLowerCase().includes(search);
                                          });

                                          return labFiltered.length > 0 ? (
                                             labFiltered.map(svc => (
                                                <button 
                                                   key={svc.id}
                                                   onClick={() => {
                                                      if (!labItems.find(i => i.id === svc.id)) {
                                                         setLabItems([...labItems, {
                                                           ...svc,
                                                           serviceName: svc.name,
                                                           serviceCode: svc.code,
                                                           serviceCategory: { categoryName: svc.category }
                                                         }]);
                                                      }
                                                      setSearchLab('');
                                                      setIsLabDropdownOpen(false);
                                                   }}
                                                   className='w-full px-6 py-4 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0'
                                                >
                                                   <div>
                                                      <p className='text-sm font-bold text-slate-800 uppercase tracking-tight'>{svc.name}</p>
                                                      <div className="flex items-center gap-2 mt-1">
                                                         <p className='text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded'>{svc.category || 'Lab Test'}</p>
                                                         {svc.unit && <span className="text-[9px] font-bold text-slate-400 italic">Unit: {svc.unit}</span>}
                                                      </div>
                                                   </div>
                                                   <div className="text-right">
                                                      <p className="text-xs font-black text-slate-700">Rp {Number(svc.price || 0).toLocaleString('id-ID')}</p>
                                                      <FiPlus className='text-rose-500 ml-auto mt-1' />
                                                   </div>
                                                </button>
                                             ))
                                          ) : (
                                             <div className='p-8 text-center text-slate-400 text-sm font-bold uppercase tracking-widest'>Pemeriksaan tidak ditemukan</div>
                                          );
                                       })()}
                                    </motion.div>
                                 )}
                              </AnimatePresence>
                           </div>
                        </div>
                        <div className='space-y-4'>
                           <label className='text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1'>Pemeriksaan yang Dipilih</label>
                           {labItems.length > 0 ? (
                              <div className='grid grid-cols-1 gap-3'>
                                 {labItems.map((item, idx) => (
                                    <motion.div 
                                       key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                       className='flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-rose-200 transition-all group'
                                    >
                                       <div className='flex items-center gap-4'>
                                          <div className='w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400'>
                                             {idx + 1}
                                          </div>
                                          <div>
                                             <p className='text-sm font-black text-slate-800 uppercase tracking-tight'>{item.serviceName}</p>
                                             <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest'>{item.serviceCategory?.categoryName || 'Diagnostic'}</p>
                                          </div>
                                       </div>
                                       <button 
                                          onClick={() => setLabItems(labItems.filter(i => i.id !== item.id))}
                                          className='p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100'
                                       >
                                          <FiTrash2 />
                                       </button>
                                    </motion.div>
                                 ))}
                              </div>
                           ) : (
                              <div className='p-12 border-2 border-dashed border-slate-100 rounded-[2rem] text-center'>
                                 <HiOutlineBeaker className='w-12 h-12 text-slate-200 mx-auto mb-4' />
                                 <p className='text-sm font-bold text-slate-300 uppercase tracking-widest leading-loose'>Belum ada pemeriksaan<br/>yang dipilih</p>
                              </div>
                           )}
                        </div>
                     </div>
                     <div className='col-span-5 space-y-8 border-l border-slate-100 pl-10'>
                        <div className='space-y-3'>
                           <label className='text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]'>Catatan Khusus Laborat</label>
                           <textarea 
                              disabled={isReadOnly}
                              value={labNotes} 
                              onChange={(e) => setLabNotes(e.target.value)}
                              className={`w-full p-6 bg-slate-50 border border-slate-200 rounded-2xl min-h-[120px] text-sm font-bold focus:bg-white focus:border-rose-500 outline-none transition-all shadow-inner ${isReadOnly ? 'opacity-60' : ''}`}
                              placeholder='Instruksi tambahan untuk tim lab...'
                           />
                        </div>
                        <div className='space-y-3'>
                           <label className='text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] flex items-center gap-2'>
                              <FiCheckCircle /> Ringkasan & Hasil Lab Terstruktur
                           </label>
                           <textarea 
                               disabled={isReadOnly}
                               value={labResults} 
                               onChange={(e) => setLabResults(e.target.value)}
                               className={`w-full p-6 bg-indigo-50/30 border border-slate-200 rounded-2xl min-h-[100px] text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner ${isReadOnly ? 'opacity-60' : ''}`}
                               placeholder='Kesimpulan hasil lab (jika sudah ada)...'
                           />
                        </div>

                        {/* Structured Lab Results */}
                        {(medicalRecord?.labOrders?.length || 0) > 0 && (
                           <div className='space-y-4 pt-4 border-t border-slate-100'>
                              <div className='space-y-4'>
                                 {medicalRecord.labOrders.map((order: any) => (
                                    <div key={order.id} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                       <div className="bg-slate-100/50 px-4 py-2 flex justify-between items-center border-b border-slate-100">
                                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{order.orderNo}</span>
                                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                             {order.status}
                                          </span>
                                           {order.status === 'completed' && (
                                              <button 
                                                 onClick={() => generateLabResultPDF(order)}
                                                 className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                                              >
                                                 <FiPrinter className="w-3 h-3" /> Hasil PDF
                                              </button>
                                           )}
                                       </div>
                                       {order.results?.length > 0 ? (
                                          <div className="p-4 space-y-2">
                                             {order.results.map((res: any) => (
                                                <div key={res.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                                                   <div className="flex-1">
                                                      <p className="text-[11px] font-bold text-slate-700 uppercase">{res.testMaster?.name}</p>
                                                   </div>
                                                   <div className="flex-1 text-center">
                                                      <p className={`text-[11px] font-black ${res.isCritical ? 'text-rose-500' : 'text-slate-900'}`}>
                                                        {res.resultValue} <span className="text-[9px] font-medium text-slate-400">{res.testMaster?.unit}</span>
                                                      </p>
                                                   </div>
                                                   <div className="flex-1 text-right">
                                                      <p className="text-[9px] font-medium text-slate-400 italic">Normal: {res.testMaster?.normalRangeText}</p>
                                                   </div>
                                                </div>
                                             ))}
                                          </div>
                                       ) : (
                                          <div className="p-4 text-center">
                                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum ada hasil diinput</p>
                                          </div>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}
                        <div className='p-6 bg-amber-50/50 rounded-2xl border border-amber-100'>
                           <p className='text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] mb-2 flex items-center gap-2'>
                              <FiInfo /> Prosedur Digital Lab
                           </p>
                           <p className='text-[9px] font-bold text-amber-600/70 leading-relaxed uppercase tracking-tight'>
                              Pastikan semua item pemeriksaan sudah benar sebelum mencetak Order Lab. Order akan masuk ke sistem antrian Laboratorium secara otomatis setelah pemeriksaan disimpan.
                           </p>
                        </div>
                     </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'referral' && (
              <motion.div key="referral" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[500px]">
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-50">
                     <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Digital Referral Management</h3>
                     <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-100">Care Coordination</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Buat Rujukan Baru</p>
                         <div className="space-y-4">
                             <div className="flex gap-2">
                                {['INTERNAL', 'EXTERNAL'].map(type => (
                                   <button 
                                     key={type} 
                                     onClick={() => setReferralType(type as any)} 
                                     className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${referralType === type ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                   >
                                      {type === 'INTERNAL' ? 'Klinik / Poli Internal' : 'Rumah Sakit Luar'}
                                   </button>
                                ))}
                             </div>

                             {referralType === 'INTERNAL' ? (
                               <div className="flex flex-col gap-3">
                                  <select value={referralToClinicId} onChange={e => setReferralToClinicId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[11px] font-bold bg-white focus:border-primary outline-none">
                                     <option value="">Pilih Klinik Tujuan...</option>
                                     {clinicsList.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                     ))}
                                  </select>
                                  <select value={referralToDepartmentId} onChange={e => setReferralToDepartmentId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[11px] font-bold bg-white focus:border-primary outline-none">
                                     <option value="">Pilih Poli/Unit Tujuan...</option>
                                     {departmentsList.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                     ))}
                                  </select>
                               </div>
                             ) : (
                               <input value={referralToHospitalName} onChange={e => setReferralToHospitalName(e.target.value)} placeholder="Ketik nama Rumah Sakit tujuan..." className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[11px] font-bold bg-white focus:border-primary outline-none" />
                             )}

                             <textarea value={referralNotes} onChange={e => setReferralNotes(e.target.value)} placeholder="Catatan medis tambahan atau rincian klinis untuk rujukan..." className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[11px] font-bold bg-white focus:border-primary outline-none min-h-[120px]" />
                             
                             <button disabled={isPrinting} onClick={handleSaveAndPrintReferral} className="w-full py-4 mt-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50">
                                {isPrinting ? 'Mencetak...' : 'Cetak & Simpan Rujukan'}
                             </button>
                          </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Riwayat Rujukan Kunjungan Ini</p>
                       {referrals.length === 0 ? (
                         <div className="py-20 text-center border border-dashed border-slate-100 rounded-3xl bg-slate-50/30">
                            <FiArrowLeft className="w-10 h-10 text-slate-100 mx-auto mb-2 rotate-180" />
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Belum Ada Rujukan</p>
                         </div>
                       ) : (
                         referrals.map(r => (
                           <div key={r.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
                              <div>
                                 <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Rujukan {r.type === 'INTERNAL' ? 'Klinik' : 'RS Luar'}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ke: <span className="text-slate-700">{r.type === 'INTERNAL' ? `${r.toClinic?.name || 'Klinik'} - ${r.toDepartment?.name || 'Poli'}` : r.toHospitalName}</span></p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Status: {r.status || 'Pending'}</p>
                              </div>
                              <button onClick={() => handleReprintReferral(r)} title="Print Ulang Rujukan" className="p-2 text-primary hover:bg-indigo-50 rounded-lg transition-all"><FiPrinter /></button>
                           </div>
                         ))
                       )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'attachment' && (
              <motion.div key="attachment" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[500px]">
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-50">
                     <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Medical Media & Attachments</h3>
                     <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Clinical Photography</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {!isReadOnly && (
                      <label className={`aspect-square border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary hover:bg-slate-50 transition-all group ${isUploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                         <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 group-hover:text-primary transition-all">
                            {isUploadingAttachment ? <FiRefreshCw className="w-8 h-8 animate-spin" /> : <FiPlus className="w-8 h-8" />}
                         </div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isUploadingAttachment ? 'Mengunggah...' : 'Unggah Foto / PDF'}</p>
                         <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleUploadAttachment} disabled={isUploadingAttachment} />
                      </label>
                    )}
                    
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="aspect-square border border-slate-200 rounded-[2.5rem] flex flex-col overflow-hidden group relative bg-slate-50">
                        {attachment.fileType.startsWith('image/') ? (
                          <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}${attachment.fileUrl}`} alt={attachment.fileName} className="w-full h-4/5 object-cover" />
                        ) : (
                          <div className="w-full h-4/5 flex items-center justify-center bg-indigo-50 text-indigo-300">
                            <FiClipboard className="w-16 h-16" />
                          </div>
                        )}
                        <div className="h-1/5 bg-white px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                          <p className="text-[10px] font-black text-slate-600 truncate mr-2" title={attachment.fileName}>{attachment.fileName}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a 
                              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}${attachment.fileUrl}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 text-primary hover:bg-indigo-50 rounded-lg transition-all"
                              title="Buka File"
                            >
                              <FiMonitor className="w-4 h-4" />
                            </a>
                            {!isReadOnly && (
                              <button 
                                onClick={() => handleDeleteAttachment(attachment.id)}
                                className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                                title="Hapus File"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {attachments.length === 0 && isReadOnly && (
                       <div className="aspect-square border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 bg-slate-50">
                          <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300">
                             <FiClipboard className="w-8 h-8" />
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tidak ada lampiran</p>
                       </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'consent' && (
              <motion.div key="consent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[500px]">
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-50">
                     <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Informed Consent & Verification</h3>
                     <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full border border-rose-100">Legal & Safety</span>
                  </div>
                  
                  <div className="max-w-xl mx-auto py-10">
                    <div className={`p-10 rounded-[2.5rem] border-2 transition-all ${hasInformedConsent ? 'bg-emerald-50 border-emerald-100 shadow-lg shadow-emerald-500/5' : 'bg-slate-50 border-slate-100'}`}>
                       <div className="flex items-center gap-6 mb-8">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl transition-all ${hasInformedConsent ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                             {hasInformedConsent ? <FiCheckCircle /> : <FiLock />}
                          </div>
                          <div>
                             <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Persetujuan Tindakan Medis</h4>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Self-Verified by Practitioner</p>
                          </div>
                       </div>
                       
                       <p className="text-[11px] font-medium text-slate-500 leading-relaxed mb-10">
                          Dengan mencentang opsi di bawah ini, saya selaku dokter pemeriksa mengonfirmasi bahwa pasien (atau wali yang sah) telah diberikan penjelasan yang cukup mengenai tindakan medis yang akan dilakukan, termasuk risiko, alternatif, dan konsekuensinya, serta telah memberikan persetujuannya secara lisan maupun tertulis.
                       </p>
                       
                       <button 
                        onClick={() => setHasInformedConsent(!hasInformedConsent)}
                        className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          hasInformedConsent 
                          ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' 
                          : 'bg-white border border-slate-200 text-slate-400 hover:border-primary hover:text-primary'
                        }`}>
                         {hasInformedConsent ? '✓ PERSETUJUAN TELAH DICATAT' : 'KLIK UNTUK KONFIRMASI PERSETUJUAN'}
                       </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[500px]">
                   <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 pb-6 border-b border-slate-50">Riwayat Kunjungan</h3>
                   <div className="space-y-8">
                     {history.map((h, idx) => (
                        <div key={idx} className="p-8 bg-slate-50/30 rounded-[2rem] border border-slate-100 relative group hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all">
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                              <div className="flex items-center gap-3">
                                 <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100">
                                    <FiCalendar className="w-6 h-6" />
                                 </div>
                                 <div>
                                    <p className="text-xs font-black text-slate-900">{new Date(h.recordDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h.doctor?.name}</p>
                                 </div>
                              </div>
                              <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl border border-emerald-100 uppercase tracking-widest self-start md:self-center">Kunjungan Selesai</span>
                           </div>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-0 md:pl-14">
                              <div className="space-y-2">
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Diagnosa</p>
                                 <p className="text-sm font-bold text-slate-800 leading-relaxed italic">"{h.diagnosis || '-'}"</p>
                              </div>
                              <div className="space-y-2">
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rencana Terapi</p>
                                 <p className="text-sm font-medium text-slate-500 leading-relaxed italic">"{h.treatmentPlan || '-'}"</p>
                              </div>
                           </div>
                        </div>
                     ))}
                     {history.length === 0 && (
                        <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem] text-slate-300">
                           <FiRotateCcw className="w-16 h-16 mx-auto mb-4 opacity-30" />
                           <p className="text-xs font-black uppercase tracking-[0.4em]">Tidak Ada Riwayat Medis Sebelumnya</p>
                        </div>
                     )}
                   </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Dialog Pilih Obat */}
      <AnimatePresence>
        {isMedDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <FiPackage className="text-primary" /> Pilih Obat
                </h3>
                <button onClick={() => setIsMedDialogOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                  <FiMinus className="w-5 h-5" /> 
                </button>
              </div>
              
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[400px]">
                {/* Kiri: Pencarian & Daftar Obat */}
                <div className="flex-1 flex flex-col border-r border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <div className="relative group">
                      <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                      <input 
                        value={searchMed} 
                        onChange={(e) => setSearchMed(e.target.value)} 
                        placeholder="Cari nama obat atau generic..." 
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:bg-white focus:border-primary shadow-sm transition-all" 
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {searchMedicines.map(m => {
                      const isSelected = selectedMedicines.some(sm => sm.id === m.id)
                      const stock = m.availableStock ?? m.stock
                      const isOutOfStock = stock <= 0
                      return (
                        <button 
                          key={m.id} 
                          onClick={() => {
                            if (isOutOfStock) {
                              toast.error('Obat ini sedang kosong (Stok 0)')
                              return
                            }
                            if (isSelected) {
                              setSelectedMedicines(selectedMedicines.filter(sm => sm.id !== m.id))
                            } else {
                              setSelectedMedicines([...selectedMedicines, m])
                            }
                          }} 
                          disabled={isOutOfStock}
                          className={`w-full p-4 text-left rounded-2xl transition-all group flex items-start gap-4 border ${isSelected ? 'border-primary bg-primary/5' : isOutOfStock ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed' : 'border-slate-100 hover:bg-slate-50'}`}
                        >
                          <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary text-white' : isOutOfStock ? 'border-slate-200 bg-slate-100' : 'border-slate-300'}`}>
                            {isSelected && <FiCheckCircle className="w-3 h-3" />}
                          </div>
                          <div className="flex-1">
                            <p className={`text-xs font-black uppercase tracking-tight transition-colors ${isSelected ? 'text-primary' : 'text-slate-800'}`}>{m.masterName}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase italic">{m.medicine?.genericName} • {m.medicine?.strength}</p>
                          </div>
                          <div className="text-right">
                            <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${isOutOfStock ? 'bg-slate-100 text-slate-400' : stock > 10 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {isOutOfStock ? 'STOK HABIS' : `Stok: ${stock} ${m.unit}`}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                    {searchMedicines.length === 0 && searchMed && (
                      <div className="text-center py-10 text-slate-400 text-xs font-bold">Obat tidak ditemukan</div>
                    )}
                    {searchMedicines.length === 0 && !searchMed && (
                      <div className="text-center py-10 text-slate-400 text-xs font-bold animate-pulse">Memuat daftar obat...</div>
                    )}
                  </div>
                </div>
                
                {/* Kanan: Obat Terpilih */}
                <div className="w-full md:w-1/3 flex flex-col bg-slate-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-100">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Obat Terpilih ({selectedMedicines.length})</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {selectedMedicines.map(m => (
                      <div key={m.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-sm">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-slate-800 uppercase truncate">{m.masterName}</p>
                        </div>
                        <button onClick={() => setSelectedMedicines(selectedMedicines.filter(sm => sm.id !== m.id))} className="text-rose-400 hover:text-rose-600 p-1">
                          <FiMinus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {selectedMedicines.length === 0 && (
                      <div className="text-center py-10 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Belum ada obat dipilih</div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
                <button onClick={() => setIsMedDialogOpen(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                  Batal
                </button>
                <button 
                  onClick={() => {
                    // Add all selected to prescriptionItems
                    const newItems = selectedMedicines.map(m => ({
                      medicineId: m.medicineId || m.id,
                      name: m.masterName,
                      quantity: 1,
                      availableStock: m.availableStock ?? m.stock,
                      dosage: m.medicine?.strength || '',
                      frequency: '3x1',
                      duration: '5 hari',
                      instructions: 'Sesudah makan',
                      unit: m.unit || 'unit'
                    }))
                    
                    setPrescriptionItems([...prescriptionItems, ...newItems])
                    setIsMedDialogOpen(false)
                  }} 
                  disabled={selectedMedicines.length === 0}
                  className="px-6 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  <FiCheckCircle /> Konfirmasi ({selectedMedicines.length})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Lab Order Preview Modal */}
      <AnimatePresence>
        {isLabPreviewOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 shadow-sm border border-rose-100">
                      <HiOutlineBeaker />
                   </div>
                   <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">Pratinjau Order Laboratorium</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Review pemeriksaan laboratorium sebelum dicetak</p>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => {
                      setIsPrinting(true);
                      setTimeout(() => {
                        generateLabPDF(queue?.patient?.name || 'Pasien');
                        setIsLabPreviewOpen(false);
                      }, 500);
                    }} 
                    className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
                   >
                      <FiSave /> UNDUH ORDER LAB
                   </button>
                   <button onClick={() => setIsLabPreviewOpen(false)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                      <FiMinus className="w-6 h-6" /> 
                   </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12 bg-slate-200/50 flex justify-center">
                 <div className="shadow-2xl scale-[0.85] origin-top transform-gpu">
                    <div className="w-[210mm] min-h-[297mm] bg-white text-slate-800 font-sans box-border relative overflow-hidden" style={{ padding: '20mm' }}>
                        <div className="absolute top-0 left-0 right-0 h-4 bg-rose-500"></div>
                        <div className="flex justify-between items-end border-b-2 border-rose-500 pb-6 mb-8 mt-4">
                          <div>
                             <div className="flex items-center gap-3 mb-2">
                               <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 font-black text-xl">
                                  <FiHeart />
                               </div>
                               <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900">{queue?.clinicId ? clinicsList.find(c => c.id === queue.clinicId)?.name || 'KLINIK' : 'KLINIK PUSAT'}</h1>
                             </div>
                             <p className="text-xs text-slate-500 uppercase tracking-widest">Diagnostic & Laboratory Service</p>
                          </div>
                          <div className="text-right">
                             <h2 className="text-4xl font-black uppercase tracking-tight text-rose-500">LAB ORDER</h2>
                             <p className="text-[10px] font-bold uppercase tracking-widest mt-2 bg-rose-50 text-rose-600 inline-block px-3 py-1 rounded-lg">ID: LAB-{new Date().getTime().toString().slice(-6)}</p>
                          </div>
                        </div>
                        
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
                           <table className="w-full text-sm">
                             <tbody>
                               <tr><td className="w-48 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Nama Pasien</td><td className="w-4 py-2 text-slate-400">:</td><td className="py-2 font-bold text-base text-slate-900">{queue?.patient.name}</td></tr>
                               <tr><td className="w-48 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">No. Rekam Medis</td><td className="w-4 py-2 text-slate-400">:</td><td className="py-2 text-slate-700">{queue?.patient.medicalRecordNo}</td></tr>
                               <tr><td className="w-48 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Dokter Pengirim</td><td className="w-4 py-2 text-slate-400">:</td><td className="py-2 text-slate-700">{queue?.doctor?.name || user?.name}</td></tr>
                             </tbody>
                           </table>
                        </div>

                        <div className="mb-8">
                           <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><HiOutlineBeaker className="text-rose-500" /> Daftar Pemeriksaan</h3>
                           <div className="grid grid-cols-1 gap-2">
                              {labItems.length > 0 ? labItems.map((item, i) => (
                                 <div key={item.id} className="flex items-center justify-between py-3 border-b border-slate-50">
                                    <div className="flex items-center gap-4">
                                       <span className="text-xs font-black text-slate-300">{i + 1}.</span>
                                       <span className="text-sm font-bold text-slate-700 uppercase">{item.serviceName}</span>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.serviceCategory?.categoryName || 'LAB'}</span>
                                 </div>
                              )) : (
                                 <p className="text-sm italic text-slate-400 py-4">Tidak ada item pemeriksaan khusus.</p>
                              )}
                           </div>
                        </div>

                        {labNotes && (
                           <div className="mb-12 bg-rose-50/30 border border-rose-100 rounded-2xl p-6">
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-3">Catatan / Instruksi Klinis</h3>
                              <p className="text-sm text-slate-700 leading-relaxed italic">{labNotes}</p>
                           </div>
                        )}
                        
                        <div className="flex justify-end mt-16">
                           <div className="text-center w-64">
                              <p className="text-sm text-slate-500 mb-20">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br/>Dokter Pengirim,</p>
                              <div className="border-b-2 border-slate-300 w-3/4 mx-auto mb-2"></div>
                              <p className="text-sm font-black uppercase text-slate-900">{queue?.doctor?.name || user?.name}</p>
                              <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">SIP: {queue?.doctor?.specialization || 'Umum'}</p>
                           </div>
                        </div>

                        <div className="absolute bottom-10 left-20 right-20 border-t border-slate-200 pt-6 text-center">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Dicetak melalui Sistem Management Laboratorium Terintegrasi</p>
                        </div>
                    </div>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Lab Print Template */}
      {isPrinting && (
        <div className="fixed -left-[9999px] top-0 pointer-events-none z-[-1]">
           <div id="print-lab-template" className="w-[210mm] min-h-[297mm] bg-white text-slate-800 font-sans box-border relative overflow-hidden" style={{ padding: '20mm' }}>
                <div className="absolute top-0 left-0 right-0 h-4 bg-rose-500"></div>
                <div className="flex justify-between items-end border-b-2 border-rose-500 pb-6 mb-8 mt-4">
                  <div>
                     <div className="flex items-center gap-3 mb-2">
                       <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 font-black text-xl">
                          <FiHeart />
                       </div>
                       <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900">{queue?.clinicId ? clinicsList.find(c => c.id === queue.clinicId)?.name || 'KLINIK' : 'KLINIK PUSAT'}</h1>
                     </div>
                     <p className="text-xs text-slate-500 uppercase tracking-widest">Diagnostic & Laboratory Service</p>
                  </div>
                  <div className="text-right">
                     <h2 className="text-4xl font-black uppercase tracking-tight text-rose-500">LAB ORDER</h2>
                     <p className="text-xs font-bold uppercase tracking-widest mt-2 bg-slate-100 text-slate-600 inline-block px-3 py-1 rounded-lg">ID: LAB-{new Date().getTime().toString().slice(-6)}</p>
                  </div>
                </div>
                
                <div className="mb-8">
                   <table className="w-full text-sm">
                     <tbody>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">Nama Pasien</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 font-black text-slate-900">{queue?.patient.name}</td></tr>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">No. Rekam Medis</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 text-slate-700">{queue?.patient.medicalRecordNo}</td></tr>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">Dokter Pengirim</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 text-slate-700">{queue?.doctor?.name || user?.name}</td></tr>
                     </tbody>
                   </table>
                </div>

                <div className="mb-8">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4 border-b border-slate-200 pb-2">Daftar Pemeriksaan</h3>
                   <div className="grid grid-cols-1 gap-1">
                      {labItems.length > 0 ? labItems.map((item, i) => (
                         <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                            <span className="text-sm font-bold text-slate-700">{i + 1}. {item.serviceName}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">{item.serviceCategory?.categoryName || 'LAB'}</span>
                         </div>
                      )) : (
                         <p className="text-sm italic text-slate-400 py-2">Tidak ada item pemeriksaan khusus.</p>
                      )}
                   </div>
                </div>

                {labNotes && (
                   <div className="mb-12 border border-slate-200 rounded-xl p-6 bg-slate-50">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Catatan / Instruksi Klinis</h3>
                      <p className="text-sm text-slate-700 leading-relaxed italic">{labNotes}</p>
                   </div>
                )}
                
                <div className="flex justify-end mt-16">
                   <div className="text-center w-64">
                      <p className="text-sm text-slate-500 mb-20">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br/>Dokter Pengirim,</p>
                      <p className="text-sm font-black uppercase underline">{queue?.doctor?.name || user?.name}</p>
                   </div>
                </div>

                <div className="absolute bottom-10 left-20 right-20 border-t border-slate-200 pt-6 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Dicetak melalui Sistem Management Laboratorium Terintegrasi pada {new Date().toLocaleString('id-ID')}</p>
                </div>
           </div>
        </div>
      )}

      {/* Referral Preview Modal */}
      <AnimatePresence>
        {isReferralPreviewOpen && currentPrintReferral && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border border-primary/10">
                      <FiPrinter />
                   </div>
                   <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">Pratinjau Surat Rujukan</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Review dokumen sebelum mengunduh PDF</p>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => {
                      setIsPrinting(true);
                      setTimeout(() => {
                        generatePDF(queue?.patient?.name || 'Pasien');
                        setIsReferralPreviewOpen(false);
                      }, 500);
                    }} 
                    className="px-6 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                   >
                      <FiSave /> UNDUH PDF RUJUKAN
                   </button>
                   <button onClick={() => setIsReferralPreviewOpen(false)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                      <FiMinus className="w-6 h-6" /> 
                   </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12 bg-slate-200/50 flex justify-center">
                 {/* This is the visual preview of the PDF */}
                 <div className="shadow-2xl scale-[0.85] origin-top transform-gpu">
                    {/* Reuse the design from the template but without fixed positioning */}
                    <div className="w-[210mm] min-h-[297mm] bg-white text-slate-800 font-sans box-border relative overflow-hidden shadow-sm" style={{ padding: '20mm' }}>
                        <div className="absolute top-0 left-0 right-0 h-4 bg-primary"></div>
                        <div className="flex justify-between items-end border-b-2 border-primary pb-4 mb-6 mt-4">
                          <div>
                             <div className="flex items-center gap-3 mb-2">
                               <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-lg">
                                  <FiHeart />
                               </div>
                               <h1 className="text-xl font-black uppercase tracking-widest text-slate-900">{queue?.clinicId ? clinicsList.find(c => c.id === queue.clinicId)?.name || 'KLINIK' : 'KLINIK PUSAT'}</h1>
                             </div>
                             <p className="text-[10px] text-slate-500 uppercase tracking-widest">Layanan Medis & Konsultasi Spesialis</p>
                          </div>
                          <div className="text-right">
                             <h2 className="text-2xl font-black uppercase tracking-tight text-primary">SURAT RUJUKAN</h2>
                          </div>
                        </div>
                        
                        <div className="mb-6">
                          <p className="text-xs mt-4 text-slate-600">Mohon pemeriksaan dan penanganan lebih lanjut terhadap pasien berikut:</p>
                        </div>
                        
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                          <table className="w-full text-xs">
                            <tbody>
                              <tr><td className="w-40 py-1 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Nama Pasien</td><td className="w-4 py-1 text-slate-400">:</td><td className="py-1 font-bold text-sm text-slate-900">{queue?.patient.name}</td></tr>
                              <tr><td className="w-40 py-1 font-bold text-slate-500 uppercase tracking-widest text-[9px]">No. Rekam Medis</td><td className="w-4 py-1 text-slate-400">:</td><td className="py-1 text-slate-700">{queue?.patient.medicalRecordNo}</td></tr>
                              <tr><td className="w-40 py-1 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Jenis Kelamin</td><td className="w-4 py-1 text-slate-400">:</td><td className="py-1 text-slate-700">{['L', 'M', 'Laki-laki'].includes(queue?.patient.gender || '') ? 'Laki-laki' : 'Perempuan'}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="mb-6 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
                           <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-400"></div>
                           <h3 className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-4 flex items-center gap-2"><FiActivity /> Informasi Klinis</h3>
                           <div className="grid grid-cols-2 gap-6 text-xs">
                              <div>
                                 <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Anamnesa (S)</p>
                                 <p className="whitespace-pre-wrap text-slate-700 mb-4 leading-relaxed">{subjective || '-'}</p>
                                 <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Pemeriksaan Fisik (O)</p>
                                 <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{objective || '-'}</p>
                              </div>
                              <div>
                                 <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Diagnosa Sementara (A)</p>
                                 <p className="whitespace-pre-wrap font-bold text-slate-900 mb-4 leading-relaxed">{diagnosis || '-'}</p>
                                 <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Terapi Diberikan (P)</p>
                                 <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{treatmentPlan || '-'}</p>
                              </div>
                           </div>
                        </div>
                        
                        <div className="mb-12 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                           <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary"></div>
                           <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Catatan Rujukan Khusus</h3>
                        </div>
                        
                        <div className="flex justify-end mt-16">
                           <div className="text-center w-64">
                              <p className="text-sm text-slate-500 mb-20">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br/>Dokter Perujuk,</p>
                              <div className="border-b-2 border-slate-300 w-3/4 mx-auto mb-2"></div>
                              <p className="text-sm font-black uppercase text-slate-900">{queue?.doctor?.name || user?.name}</p>
                              <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">SIP: {queue?.doctor?.specialization || 'Umum'}</p>
                           </div>
                        </div>
                        
                        <div className="absolute bottom-10 left-20 right-20 border-t border-slate-200 pt-6 text-center">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Pratinjau Dokumen Rekam Medis</p>
                        </div>
                    </div>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
{/* Hidden Print Template */}
      {isPrinting && currentPrintReferral && (
        <div className="fixed -left-[9999px] top-0 pointer-events-none z-[-1]">
          <div id="print-referral-template" className="w-[210mm] min-h-[297mm] bg-white text-slate-800 font-sans box-border relative overflow-hidden" style={{ padding: "20mm" }}>
            
            {/* Header Accent */}
            <div className="absolute top-0 left-0 right-0 h-4 bg-primary"></div>
            
            {/* Kop Surat */}
            <div className="flex justify-between items-end border-b-2 border-primary pb-4 mb-6 mt-4">
              <div>
                 <div className="flex items-center gap-3 mb-2">
                   <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-lg">
                      <FiHeart />
                   </div>
                   <h1 className="text-xl font-black uppercase tracking-widest text-slate-900">{queue?.clinicId ? clinicsList.find(c => c.id === queue.clinicId)?.name || "KLINIK" : "KLINIK PUSAT"}</h1>
                 </div>
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest">Layanan Medis & Konsultasi Spesialis</p>
              </div>
              <div className="text-right">
                 <h2 className="text-2xl font-black uppercase tracking-tight text-primary">SURAT RUJUKAN</h2>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-xs mt-4 text-slate-600">Mohon pemeriksaan dan penanganan lebih lanjut terhadap pasien berikut:</p>
            </div>
            
            {/* Patient Info Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="w-40 py-1 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Nama Pasien</td><td className="w-4 py-1 text-slate-400">:</td><td className="py-1 font-bold text-sm text-slate-900">{queue.patient.name}</td></tr>
                  <tr><td className="w-40 py-1 font-bold text-slate-500 uppercase tracking-widest text-[9px]">No. Rekam Medis</td><td className="w-4 py-1 text-slate-400">:</td><td className="py-1 text-slate-700">{queue.patient.medicalRecordNo}</td></tr>
                  <tr><td className="w-40 py-1 font-bold text-slate-500 uppercase tracking-widest text-[9px]">Jenis Kelamin</td><td className="w-4 py-1 text-slate-400">:</td><td className="py-1 text-slate-700">{["L", "M", "Laki-laki"].includes(queue.patient.gender) ? "Laki-laki" : "Perempuan"}</td></tr>
                </tbody>
              </table>
            </div>
            
            {/* Clinical Info Section */}
            <div className="mb-6 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
               <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-400"></div>
               <h3 className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-4 flex items-center gap-2"><FiActivity /> Informasi Klinis</h3>
               <div className="grid grid-cols-2 gap-6 text-xs">
                  <div>
                     <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Anamnesa (S)</p>
                     <p className="whitespace-pre-wrap text-slate-700 mb-4 leading-relaxed">{subjective || "-"}</p>
                     
                     <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Pemeriksaan Fisik (O)</p>
                     <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{objective || "-"}</p>
                  </div>
                  <div>
                     <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Diagnosa Sementara (A)</p>
                     <p className="whitespace-pre-wrap font-bold text-slate-900 mb-4 leading-relaxed">{diagnosis || "-"}</p>
                     
                     <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Terapi Diberikan (P)</p>
                     <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{treatmentPlan || "-"}</p>
                  </div>
               </div>
            </div>
            
            {/* Notes Section */}
            <div className="mb-12 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary"></div>
               <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Catatan Rujukan Khusus</h3>
            </div>
            
            <div className="flex justify-end mt-16">
               <div className="text-center w-64">
                  <p className="text-sm text-slate-500 mb-20">{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}<br/>Dokter Perujuk,</p>
                  <div className="border-b-2 border-slate-300 w-3/4 mx-auto mb-2"></div>
                  <p className="text-sm font-black uppercase text-slate-900">{queue.doctor?.name || user?.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">SIP: {queue.doctor?.specialization || "Umum"}</p>
               </div>
            </div>
            
            {/* Footer */}
            <div className="absolute bottom-10 left-20 right-20 border-t border-slate-200 pt-6 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Dicetak melalui Sistem Rekam Medis Elektronik pada {new Date().toLocaleString("id-ID")}</p>
            </div>
            
          </div>
        </div>
      )}
      {/* RME INFO MODAL (EDUCATIONAL) */}
      <AnimatePresence>
        {isRMEInfoOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsRMEInfoOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
            >
              {/* Left Side: Branding/Visual */}
              <div className="w-full md:w-80 bg-primary p-10 flex flex-col justify-between text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
                <div className="relative z-10">
                   <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                      <FiMonitor className="w-8 h-8 text-white" />
                   </div>
                   <h2 className="text-2xl font-black uppercase tracking-tighter leading-tight">Masa Depan <br/>Rekam Medis Indonesia</h2>
                   <div className="w-12 h-1 bg-white/40 mt-4 rounded-full" />
                </div>
                <div className="relative z-10 space-y-4">
                   <p className="text-xs font-medium text-white/70 italic leading-relaxed">"Sistem RME Yasfina dirancang untuk efisiensi tinggi, legalitas hukum, dan kemudahan bagi tenaga medis modern."</p>
                   <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-white px-4 py-2 rounded-xl">
                      <FiCheckCircle /> FUTURE READY: SATU SEHAT
                   </div>
                </div>
              </div>

              {/* Right Side: Content */}
              <div className="flex-1 p-8 md:p-12 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-start mb-10">
                   <div>
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Informasi Penting</h3>
                      <h4 className="text-2xl font-black text-slate-900 tracking-tight">Apa itu RME & Kenapa Wajib?</h4>
                   </div>
                   <button onClick={() => setIsRMEInfoOpen(false)} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-400 transition-all">✕</button>
                </div>

                <div className="space-y-10">
                   {/* Point 1: Regulasi */}
                   <div className="flex gap-6 group">
                      <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-primary flex-shrink-0 border border-indigo-100 group-hover:bg-primary group-hover:text-white transition-all">
                         <FiAlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                         <h5 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-2">Kewajiban Regulasi (PMK No. 24/2022)</h5>
                         <p className="text-sm text-slate-500 leading-relaxed font-medium">Kemenkes RI mewajibkan seluruh fasilitas kesehatan (Klinik & RS) beralih ke digital paling lambat **31 Desember 2023**. Secara hukum, catatan tulis tangan sudah harus ditinggalkan demi keakuratan data nasional.</p>
                      </div>
                   </div>

                   {/* Point 2: Standard RS Modern */}
                   <div className="flex gap-6 group">
                      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 flex-shrink-0 border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                         <FiActivity className="w-6 h-6" />
                      </div>
                      <div>
                         <h5 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-2">Standar Rumah Sakit Modern & Besar</h5>
                         <p className="text-sm text-slate-500 leading-relaxed font-medium">Di RS modern (Tipe A/B), dokter tidak lagi membawa map fisik. Semua input SOAP, diagnosa (ICD-10), dan e-resep dilakukan langsung melalui Komputer atau Tablet (COW) untuk menghindari kesalahan baca tulisan tangan.</p>
                      </div>
                   </div>

                   {/* Point 3: Integrasi SATUSEHAT */}
                   <div className="flex gap-6 group">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 flex-shrink-0 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                         <HiOutlineBeaker className="w-6 h-6" />
                      </div>
                      <div>
                         <h5 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-2">Konektivitas SATUSEHAT (Nasional)</h5>
                         <p className="text-sm text-slate-500 leading-relaxed font-medium">Sistem Yasfina dirancang untuk mendukung integrasi penuh dengan platform **SatuSehat** di masa mendatang. Dengan standarisasi data RME saat ini, klinik Anda akan jauh lebih siap ketika regulasi integrasi SatuSehat mulai diimplementasikan secara teknis.</p>
                      </div>
                   </div>

                   {/* Point 4: Solusi Manual ke Digital */}
                   <div className="flex gap-6 group">
                      <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 flex-shrink-0 border border-amber-100 group-hover:bg-amber-600 group-hover:text-white transition-all">
                         <FiEdit3 className="w-6 h-6" />
                      </div>
                      <div>
                         <h5 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-2">Tantangan Mengetik vs Menulis</h5>
                         <p className="text-sm text-slate-500 leading-relaxed font-medium">Kami memahami kebiasaan menulis tangan. Sistem Yasfina menyiasati ini dengan fitur **Template & Autofill**. Menginput diagnosa ICD-10 kini lebih cepat daripada menulisnya secara manual, sekaligus memastikan akurasi kode klaim.</p>
                      </div>
                   </div>
                </div>

                <div className="mt-12 p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-3">Kesimpulan Untuk Anda</p>
                   <p className="text-xs font-bold text-slate-600">Sistem yang Anda gunakan saat ini sudah mengikuti alur kerja dokter modern di Indonesia yang mengutamakan **Kecepatan, Akurasi, dan Legalitas.**</p>
                </div>

                <button 
                  onClick={() => setIsRMEInfoOpen(false)}
                  className="w-full mt-10 py-5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.4em] shadow-xl hover:bg-slate-800 transition-all"
                >
                  SAYA MENGERTI
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
