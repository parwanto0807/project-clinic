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
import { useUIStore } from '@/lib/store/useUIStore'
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
  patient: { name: string; medicalRecordNo: string; gender: string; allergies?: string; dateOfBirth?: string; address?: string }
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
  const { isDoctorSidebarCollapsed } = useUIStore()
  
  const patientHeaderRef = useRef<HTMLDivElement>(null)
  const [headerHeight, setHeaderHeight] = useState(80)
  const [isRxPreviewOpen, setIsRxPreviewOpen] = useState(false)
  const [rxPrintMode, setRxPrintMode] = useState<'internal' | 'external' | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

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
  const [icd10Id, setIcd10Id] = useState<string | null>(null)
  const [selectedIcd10, setSelectedIcd10] = useState<any>(null)
  const [searchIcd, setSearchIcd] = useState('')
  const [icdResults, setIcdResults] = useState<any[]>([])
  const [isSearchingIcd, setIsSearchingIcd] = useState(false)
  const [isIcdDropdownOpen, setIsIcdDropdownOpen] = useState(false)
  const [highlightedIcdIndex, setHighlightedIcdIndex] = useState(-1)
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [labNotes, setLabNotes] = useState('')
  const [labResults, setLabResults] = useState('')
  const [notes, setNotes] = useState('')
  const [hasInformedConsent, setHasInformedConsent] = useState(false)
  
  const [prescriptionItems, setPrescriptionItems] = useState<any[]>([])

  const isStockInsufficient = (p: any) => {
    if (p.isExternal) return false
    if (p.isRacikan) {
      if (!p.components) return false
      return p.components.some((c: any) => {
        const needed = (parseFloat(c.quantity) || 0) * (parseInt(p.quantity) || 0)
        return c.availableStock !== undefined && needed > c.availableStock
      })
    }
    return p.availableStock !== undefined && (parseInt(p.quantity) || 0) > p.availableStock
  }

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

  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false)
  const [selectedServices, setSelectedServices] = useState<Service[]>([])
  const [searchServiceDialog, setSearchServiceDialog] = useState('')
  
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
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [finalChecklist, setFinalChecklist] = useState({
    soap: false,
    diagnosis: false,
    services: false,
    prescription: false,
    laboratory: false,
    consent: false
  })
  const [isPrescriptionRedirect, setIsPrescriptionRedirect] = useState(false)
  const [isSearchingMed, setIsSearchingMed] = useState(false)
  const [editingReferralId, setEditingReferralId] = useState<string | null>(null)
  const hasFetchedRef = useRef<string | null>(null)
  const labDropdownRef = useRef<HTMLDivElement>(null)
  const icdContainerRef = useRef<HTMLDivElement>(null)
  const icdItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Racikan (Compound Prescription) States
  const [isRacikanDialogOpen, setIsRacikanDialogOpen] = useState(false)
  const [compoundFormulas, setCompoundFormulas] = useState<any[]>([])
  const [selectedFormula, setSelectedFormula] = useState<any | null>(null)
  const [racikanName, setRacikanName] = useState('')
  const [racikanQty, setRacikanQty] = useState('10')
  const [racikanDosageForm, setRacikanDosageForm] = useState('Puyer')
  const [racikanDosage, setRacikanDosage] = useState('')
  const [racikanFrequency, setRacikanFrequency] = useState('3x1')
  const [racikanDuration, setRacikanDuration] = useState('3 hari')
  const [racikanInstructions, setRacikanInstructions] = useState('Sesudah makan')
  const [racikanTuslah, setRacikanTuslah] = useState('10000')
  const [racikanComponents, setRacikanComponents] = useState<any[]>([])
  const [searchComponentMed, setSearchComponentMed] = useState('')
  const [searchComponentResults, setSearchComponentResults] = useState<any[]>([])
  const [isSearchingComponentMed, setIsSearchingComponentMed] = useState(false)
  const [isEditingRacikanIdx, setIsEditingRacikanIdx] = useState<number | null>(null)

  // Fetch Compound Formulas on load
  useEffect(() => {
    const fetchFormulas = async () => {
      try {
        const res = await api.get('pharmacy/compound-formulas', {
          params: { isActive: true, clinicId: queue?.clinicId || activeClinicId }
        })
        setCompoundFormulas(res.data)
      } catch (err) {
        console.error('Failed to fetch compound formulas:', err)
      }
    }
    if (queue?.clinicId || activeClinicId) {
      fetchFormulas()
    }
  }, [queue?.clinicId, activeClinicId])

  // Search Raw Components for Custom Racikan
  useEffect(() => {
    if (!searchComponentMed) {
      setSearchComponentResults([])
      return
    }
    const controller = new AbortController()
    const delayDebounceFn = setTimeout(async () => {
      try {
        setIsSearchingComponentMed(true)
        const medRes = await api.get('master/products', {
          headers: queue?.clinicId ? { 'x-clinic-id': queue.clinicId } : undefined,
          params: {
            isActive: true,
            search: searchComponentMed,
            limit: 50,
            clinicId: queue?.clinicId || activeClinicId
          },
          signal: controller.signal
        })
        const list = medRes.data.data || medRes.data
        setSearchComponentResults(Array.isArray(list) ? list : [])
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return
        console.error('Failed to search components:', err)
      } finally {
        setIsSearchingComponentMed(false)
      }
    }, 300)
    return () => {
      clearTimeout(delayDebounceFn)
      controller.abort()
    }
  }, [searchComponentMed, queue?.clinicId, activeClinicId])

  // Handle Formula Selection and apply from server
  const handleSelectFormula = async (formulaId: string) => {
    if (!formulaId) return
    try {
      const res = await api.post(`pharmacy/compound-formulas/${formulaId}/apply`, {
        clinicId: queue?.clinicId || activeClinicId,
        quantity: parseInt(racikanQty) || 10
      })
      const { prescriptionItemData, formula } = res.data
      setRacikanName(prescriptionItemData.racikanName || '')
      setRacikanDosageForm(prescriptionItemData.components?.[0]?.medicine?.dosageForm || 'Puyer')
      setRacikanDosage(prescriptionItemData.dosage || '')
      setRacikanFrequency(prescriptionItemData.frequency || '3x1')
      setRacikanDuration(prescriptionItemData.duration || '3 hari')
      setRacikanInstructions(prescriptionItemData.instructions || 'Sesudah makan')
      setRacikanTuslah(String(formula?.tuslahPrice || 0))
      setRacikanComponents(prescriptionItemData.components.map((c: any) => ({
        medicineId: c.medicineId,
        medicineName: c.medicine?.medicineName || 'Bahan',
        quantity: c.quantity, // qty per 1 unit racikan
        unit: c.unit || c.medicine?.unit || 'tablet',
        availableStock: c.availableStock ?? 0
      })))
    } catch (err) {
      toast.error('Gagal memuat formula racikan')
    }
  }

  // Handle Saving Racikan Prescription Item
  const handleSaveRacikan = () => {
    if (!racikanName.trim()) {
      toast.error('Nama racikan wajib diisi')
      return
    }
    const qty = parseInt(racikanQty) || 0
    if (qty <= 0) {
      toast.error('Jumlah racikan harus lebih dari 0')
      return
    }
    if (racikanComponents.length === 0) {
      toast.error('Bahan racikan minimal 1 obat')
      return
    }

    const newRacikanItem = {
      isRacikan: true,
      name: racikanName,
      racikanName: racikanName,
      quantity: qty,
      dosage: racikanComponents.map(c => `${c.medicineName}: ${c.quantity} ${c.unit}`).join(', '),
      frequency: racikanFrequency,
      duration: racikanDuration,
      instructions: racikanInstructions,
      unit: racikanDosageForm || 'Puyer',
      formulaId: selectedFormula?.id || null,
      tuslahPrice: parseFloat(racikanTuslah) || 0,
      components: racikanComponents.map(c => ({
        medicineId: c.medicineId,
        medicine: { medicineName: c.medicineName },
        quantity: parseFloat(c.quantity) || 0,
        unit: c.unit || 'unit',
        availableStock: c.availableStock ?? 99999
      })),
      isExternal: false,
      availableStock: 99999 // skip frontend check
    }

    if (isEditingRacikanIdx !== null) {
      const updated = [...prescriptionItems]
      updated[isEditingRacikanIdx] = newRacikanItem
      setPrescriptionItems(updated)
    } else {
      setPrescriptionItems([...prescriptionItems, newRacikanItem])
    }

    setIsRacikanDialogOpen(false)
    resetRacikanForm()
  }

  // Reset Racikan Form States
  const resetRacikanForm = () => {
    setSelectedFormula(null)
    setRacikanName('')
    setRacikanQty('10')
    setRacikanDosageForm('Puyer')
    setRacikanDosage('')
    setRacikanFrequency('3x1')
    setRacikanDuration('3 hari')
    setRacikanInstructions('Sesudah makan')
    setRacikanTuslah('10000')
    setRacikanComponents([])
    setSearchComponentMed('')
    setSearchComponentResults([])
    setIsEditingRacikanIdx(null)
  }

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
        api.get('/lab/test-masters', { params: { isActive: true } }),
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
          setIcd10Id(data.icd10Id || null)
          setSelectedIcd10(data.icd10 || null)
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
                name: item.isRacikan ? (item.racikanName || 'Obat Racikan') : (item.medicine?.medicineName || 'Obat'),
                racikanName: item.racikanName,
                quantity: item.quantity,
                dosage: item.isRacikan && item.components
                  ? item.components.map((c: any) => `${c.medicine?.medicineName || 'Bahan'}: ${c.quantity} ${c.unit || 'unit'}`).join(', ')
                  : item.dosage,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions || '',
                unit: item.unit || item.medicine?.unit || (item.isRacikan ? 'porsi' : 'unit'),
                availableStock: item.isRacikan ? 99999 : (item.medicine?.stock ?? 0),
                alreadySavedInDB: true, // Flag: already persisted, skip frontend stock check
                isExternal: item.instructions?.includes('(Apotek Luar)') || 
                            item.instructions?.includes('[Eksternal]') ||
                            item.instructions?.includes('Apotek Luar') ||
                            item.instructions?.includes('Eksternal'),
                isRacikan: !!item.isRacikan,
                formulaId: item.formulaId,
                tuslahPrice: item.tuslahPrice || 0,
                components: item.components?.map((c: any) => ({
                  medicineId: c.medicineId,
                  medicineName: c.medicine?.medicineName || 'Bahan',
                  quantity: c.quantity,
                  unit: c.unit || 'unit',
                  availableStock: c.medicine?.stock ?? 0
                })) || []
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
                 alreadySavedInDB: false,
                 isExternal: dp.isExternal || 
                             dp.instructions?.includes('(Apotek Luar)') || 
                             dp.instructions?.includes('[Eksternal]') ||
                             dp.instructions?.includes('Apotek Luar') ||
                             dp.instructions?.includes('Eksternal')
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

  // Measure patient header height for content offset
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (patientHeaderRef.current) {
        setHeaderHeight(patientHeaderRef.current.offsetHeight)
      }
    }
    updateHeaderHeight()
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [queue])

  
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
        setIsSearchingMed(false)
        return
      }
      try {
        setIsSearchingMed(true)
        console.log(`[Debug] Fetching medicines for clinic: ${queue?.clinicId || 'global'}`)
        const medRes = await api.get('master/products', { 
          headers: queue?.clinicId ? { 'x-clinic-id': queue.clinicId } : undefined,
          params: { 
            isActive: true, 
            search: searchMed || undefined, 
            limit: 1000,
            clinicId: queue?.clinicId || activeClinicId // Gunakan activeClinicId sebagai fallback
          },
          signal: controller.signal
        })
        
        console.log('[Debug] Medicine response:', medRes.data)
        const list = medRes.data.data || medRes.data
        
        const processedList = Array.isArray(list) 
          ? list
              .sort((a: any, b: any) => {
                const stockA = a.availableStock ?? a.stock ?? 0
                const stockB = b.availableStock ?? b.stock ?? 0
                if (stockB !== stockA) {
                  return stockB - stockA
                }
                // Jika stok sama, urutkan secara alfabetis berdasarkan nama master
                return a.masterName.localeCompare(b.masterName)
              })
          : []
        
        console.log('[Debug] Processed medicines:', processedList.length)
        setSearchMedicines(processedList)
      } catch (e: any) {
        if (e.name === 'CanceledError' || e.name === 'AbortError') return
        console.error('Medicine search failed:', e)
      } finally {
        setIsSearchingMed(false)
      }
    }, 300)

    return () => {
      clearTimeout(searchTimeout)
      controller.abort()
    }
  }, [searchMed, isMedDropdownOpen, isMedDialogOpen, isReadOnly, queue?.clinicId])

  // ICD-10 Search Logic
  useEffect(() => {
    if (isReadOnly || !isIcdDropdownOpen) return
    const controller = new AbortController()
    
    const searchTimeout = setTimeout(async () => {
      try {
        setIsSearchingIcd(true)
        const res = await api.get('master/icd10', {
          params: { search: searchIcd, limit: 10 },
          signal: controller.signal
        })
        setIcdResults(res.data.data || [])
        // Auto-highlight first result for better UX
        setHighlightedIcdIndex(res.data.data?.length > 0 ? 0 : -1)
      } catch (e: any) {
        if (e.name === 'CanceledError' || e.name === 'AbortError') return
        console.error('ICD10 search failed:', e)
      } finally {
        setIsSearchingIcd(false)
      }
    }, 300)

    return () => {
      clearTimeout(searchTimeout)
      controller.abort()
    }
  }, [searchIcd, isIcdDropdownOpen, isReadOnly])

  // Auto-scroll highlighted ICD item into view
  useEffect(() => {
    if (highlightedIcdIndex >= 0 && icdItemRefs.current[highlightedIcdIndex]) {
      icdItemRefs.current[highlightedIcdIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [highlightedIcdIndex])

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
    const stock = m.availableStock ?? m.stock ?? 0;
    setPrescriptionItems([...prescriptionItems, {
      medicineId: m.medicineId || m.id, // Use product id if medicineId is null (for compound formulas)
      name: m.masterName,
      quantity: 1,
      availableStock: stock,
      dosage: m.medicine?.strength || '',
      frequency: '3x1',
      duration: '5 hari',
      instructions: 'Sesudah makan',
      unit: m.unit || 'unit', // Tambahkan satuan
      isExternal: stock <= 0 // Default to external if out of stock!
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
      setIsPrescriptionRedirect(goToPrescription)
      setShowFinalConfirm(true)
      return
    }

    await executeSave(false, goToPrescription)
  }

  const executeSave = async (isFinal: boolean, goToPrescription: boolean) => {
    setSaving(true)
    const toastId = toast.loading(isFinal ? 'Menyimpan hasil konsultasi...' : 'Menyimpan draft...')
    try {
      // Validate prescription quantities against stock
      for (const p of prescriptionItems) {
        if (p.isExternal) continue // Skip stock validation for external medicines!
        if (isStockInsufficient(p)) {
          if (p.isRacikan) {
            toast.error(`Stok bahan racikan untuk ${p.name} tidak mencukupi`, { id: toastId })
          } else {
            toast.error(`Stok tidak mencukupi untuk ${p.name} (Tersedia: ${p.availableStock})`, { id: toastId })
          }
          setSaving(false)
          return
        }
      }

      await api.post('transactions/medical-records/doctor', {
        queueId: queue!.id,
        medicalRecordId: medicalRecord.id,
        subjective,
        objective,
        diagnosis,
        icd10Id,
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
          quantity: parseInt(p.quantity) || 0,
          instructions: p.isExternal && !p.instructions?.includes('(Apotek Luar)')
            ? `${p.instructions || ''} (Apotek Luar)`.trim()
            : p.instructions,
          isExternal: !!p.isExternal
        })),
        isFinal
      })
      
      toast.success(isFinal ? 'Pemeriksaan selesai!' : 'Draft disimpan!', { id: toastId })
      
      if (goToPrescription) {
        setIsRxPreviewOpen(true)
      } else if (isFinal) {
        router.push('/doctor/queue')
      }
    } catch (e) {
      toast.error('Gagal menyimpan data', { id: toastId })
    } finally {
      setSaving(false)
      setShowFinalConfirm(false)
    }
  }

  const handlePrintPrescription = async (mode: 'internal' | 'external') => {
    if (!queue || !medicalRecord || isReadOnly) return
    if (prescriptionItems.length === 0) {
      toast.error('Belum ada obat yang ditambahkan ke resep')
      return
    }
    // Simpan draft dulu, lalu buka modal
    const toastId = toast.loading('Menyimpan draft resep...')
    setSaving(true)
    try {
      await api.post('transactions/medical-records/doctor', {
        queueId: queue.id,
        medicalRecordId: medicalRecord.id,
        subjective,
        objective,
        diagnosis,
        icd10Id,
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
          quantity: parseInt(p.quantity) || 0,
          instructions: p.isExternal && !p.instructions?.includes('(Apotek Luar)')
            ? `${p.instructions || ''} (Apotek Luar)`.trim()
            : p.instructions,
          isExternal: !!p.isExternal
        })),
        isFinal: false
      })
      toast.success('Draft tersimpan', { id: toastId })
      setRxPrintMode(mode)
      const url = generateRxPDF(mode, 'bloburl') as string
      setPdfUrl(url)
      setIsRxPreviewOpen(true)
    } catch (e) {
      toast.error('Gagal menyimpan draft', { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  const generateRxPDF = (mode: 'internal' | 'external', action: 'save' | 'bloburl' | 'print' = 'save') => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const clinicName = queue?.clinicId
      ? clinicsList.find(c => c.id === queue.clinicId)?.name || 'KLINIK'
      : 'KLINIK PUSAT'
    const doctorName = queue?.doctor?.name || user?.name || 'Dokter'
    const patientName = queue?.patient.name || ''
    const patientRm = queue?.patient.medicalRecordNo || ''
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

    // Header bar
    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, 210, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(clinicName.toUpperCase(), 15, 9)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Layanan Kesehatan Terintegrasi', 15, 15)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(mode === 'external' ? 'RESEP EKSTERNAL' : 'RESEP', 210 - 15, 11, { align: 'right' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(today, 210 - 15, 17, { align: 'right' })

    // Patient info box
    doc.setTextColor(30, 30, 30)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(15, 28, 180, 24, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('PASIEN', 22, 35)
    doc.text('NO. RM', 85, 35)
    doc.text('DOKTER', 145, 35)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(patientName, 22, 42)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(patientRm, 85, 42)
    doc.text(doctorName, 145, 42)

    // Diagnosis
    let y = 60
    if (diagnosis || selectedIcd10) {
      doc.setFillColor(237, 233, 254)
      doc.roundedRect(15, y, 180, 12, 2, 2, 'F')
      doc.setTextColor(109, 40, 217)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('DIAGNOSA:', 22, y + 7)
      doc.setFont('helvetica', 'normal')
      const dxText = selectedIcd10
        ? `[${selectedIcd10.code}] ${selectedIcd10.nameId || selectedIcd10.nameEn}${diagnosis ? ' — ' + diagnosis : ''}`
        : diagnosis
      doc.text(dxText.substring(0, 95), 50, y + 7)
      y += 18
    } else {
      y += 8
    }

    // Medicine list header
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('DAFTAR OBAT', 15, y)
    y += 5

    // Medicine items
    const itemsToPrint = prescriptionItems.filter(p => mode === 'external' ? p.isExternal : !p.isExternal)
    itemsToPrint.forEach((p, idx) => {
      if (y > 240) { doc.addPage(); y = 25 }
      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255)
      doc.roundedRect(15, y, 180, 18, 2, 2, 'F')
      
      // Number badge
      doc.setFillColor(79, 70, 229)
      doc.circle(23, y + 9, 5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text(String(idx + 1), 23, y + 11.5, { align: 'center' })
      
      // Medicine name
      doc.setTextColor(15, 23, 42)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(p.name.toUpperCase().substring(0, 65), 32, y + 7)
      
      // Details
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      const details = [p.dosage, p.frequency, p.duration ? `selama ${p.duration}` : '', p.instructions].filter(Boolean).join('  ·  ')
      doc.text(details.substring(0, 95), 32, y + 13)
      
      // Quantity
      doc.setTextColor(79, 70, 229)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`${p.quantity}`, 180, y + 8, { align: 'right' })
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text(p.unit || 'unit', 180, y + 14, { align: 'right' })
      y += 21
    })

    // External note
    if (mode === 'external') {
      y += 5
      doc.setFillColor(255, 251, 235)
      doc.roundedRect(15, y, 180, 14, 2, 2, 'F')
      doc.setTextColor(180, 83, 9)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('⚠ RESEP UNTUK APOTEK LUAR', 22, y + 5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.text('Obat tidak tersedia di apotek klinik. Harap tebus di apotek terdekat.', 22, y + 10)
      y += 18
    }

    // Notes
    if (notes) {
      doc.setFillColor(255, 251, 235)
      doc.roundedRect(15, y, 180, 12, 2, 2, 'F')
      doc.setTextColor(180, 83, 9)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.text('CATATAN:', 22, y + 5)
      doc.setFont('helvetica', 'normal')
      doc.text(notes.substring(0, 110), 45, y + 5)
      y += 16
    }

    // Signature
    const sigY = Math.max(y + 12, 245)
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(today, 195, sigY, { align: 'right' })
    doc.line(145, sigY + 22, 195, sigY + 22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(doctorName.toUpperCase(), 170, sigY + 27, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7)
    doc.text(queue?.doctor?.specialization || 'Dokter Umum', 170, sigY + 31, { align: 'center' })

    // Footer
    doc.setFillColor(248, 250, 252)
    doc.rect(0, 285, 210, 12, 'F')
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(6.5)
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')} · Sistem Klinik Yasfina`, 105, 292, { align: 'center' })

    const filename = `Resep-${mode === 'external' ? 'Eksternal-' : ''}${patientName.replace(/\s+/g, '-')}-${Date.now()}.pdf`
    if (action === 'save') {
      doc.save(filename)
    } else if (action === 'bloburl') {
      const blob = doc.output('blob')
      return URL.createObjectURL(blob)
    } else if (action === 'print') {
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const w = window.open(url)
      if (w) w.focus()
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
      
      const res = editingReferralId 
        ? await api.put(`clinical/referrals/${editingReferralId}`, payload)
        : await api.post('clinical/referrals', payload)
      
      if (editingReferralId) {
        toast.success('Rujukan berhasil diperbarui', { id: toastId })
        setReferrals(referrals.map(r => r.id === editingReferralId ? res.data : r))
      } else {
        toast.success('Rujukan berhasil disimpan', { id: toastId })
        setReferrals([res.data, ...referrals])
      }
      
      // Set print data and trigger print
      setCurrentPrintReferral(res.data)
      setIsReferralPreviewOpen(true)
      
      // Reset form
      setEditingReferralId(null)
      setReferralNotes('')
      setReferralToClinicId('')
      setReferralToDepartmentId('')
      setReferralToHospitalName('')
      
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal memproses rujukan', { id: toastId })
    }
  }

  const handleDeleteReferral = async (referralId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus rujukan ini?')) return
    
    const toastId = toast.loading('Menghapus rujukan...')
    try {
      await api.delete(`clinical/referrals/${referralId}`)
      setReferrals(referrals.filter(r => r.id !== referralId))
      toast.success('Rujukan berhasil dihapus', { id: toastId })
      
      // Reset form if we were editing the deleted referral
      if (editingReferralId === referralId) {
        setEditingReferralId(null)
        setReferralNotes('')
        setReferralToClinicId('')
        setReferralToDepartmentId('')
        setReferralToHospitalName('')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menghapus rujukan', { id: toastId })
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
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- Colors (Yasfina Green) ---
    const primaryGreen: [number, number, number] = [21, 128, 61]; 

    // --- Header ---
    try {
      doc.addImage('/logo-yasfina.png', 'PNG', 15, 8, 30, 25);
    } catch (e) {
      doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.setLineWidth(1);
      doc.rect(15, 8, 30, 25); 
      doc.setFontSize(8);
      doc.text('LOGO', 23, 22);
    }

    doc.setFontSize(18);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('LABORATORIUM KLINIK PRATAMA YASFINA', 50, 20);
    
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');
    doc.text('Villa Bogor Indah Blok BB 2 No. 1 Kedung Halang - Bogor', 50, 26);
    doc.text('Telp. : 0251-8666169', 50, 31);

    // --- Patient & Doctor Info Box ---
    let currentY = 40;
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.rect(15, currentY, pageWidth - 30, 25); // Main Box
    doc.line(pageWidth / 2, currentY, pageWidth / 2, currentY + 25); // Vertical Divider

    doc.setFontSize(9);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setFont('helvetica', 'bold');

    const leftX = 20;
    const rightX = pageWidth / 2 + 5;

    // Info Labels
    doc.text('Nama Pasien :', leftX, currentY + 7);
    doc.text('Umur :', leftX, currentY + 14);
    doc.text('Alamat :', leftX, currentY + 21);

    doc.text('Dokter :', rightX, currentY + 7);
    doc.text('No. Order :', rightX, currentY + 14);
    doc.text('Tanggal :', rightX, currentY + 21);

    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    // Calculate Age
    const birthDate = queue.patient.dateOfBirth ? new Date(queue.patient.dateOfBirth) : null;
    const age = birthDate ? new Date().getFullYear() - birthDate.getFullYear() : '-';
    const gender = queue.patient.gender === 'M' || queue.patient.gender === 'L' ? 'L' : 'P';

    doc.text(queue.patient.name.toUpperCase(), leftX + 25, currentY + 7);
    doc.text(`${age} Thn (${gender})`, leftX + 25, currentY + 14);
    doc.text(queue.patient.address || '-', leftX + 25, currentY + 21, { maxWidth: pageWidth / 2 - 35 });

    doc.text(order.doctor?.name || 'PASIEN MANDIRI', rightX + 25, currentY + 7);
    doc.text(order.orderNo, rightX + 25, currentY + 14);
    doc.text(new Date(order.orderDate).toLocaleDateString('id-ID'), rightX + 25, currentY + 21);

    currentY += 35;

    // --- Results Table grouped by Category ---
    const results = order.results || [];
    const groupedResults = results.reduce((acc: any, curr: any) => {
      const cat = curr.testMaster?.category || 'Umum'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(curr)
      return acc
    }, {});

    const tableData: any[] = []
    Object.entries(groupedResults).forEach(([category, items]: [string, any]) => {
      // Add category row
      tableData.push([
        { content: category.toUpperCase(), colSpan: 5, styles: { fillColor: primaryGreen, textColor: 255, fontStyle: 'bold', halign: 'left' } }
      ])
      // Add items
      items.forEach((r: any) => {
        const isParent = !!(r.testMaster?.children && r.testMaster.children.length > 0);
        if (isParent) {
          tableData.push([
            { content: r.testMaster?.name, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] } }
          ])
        } else {
          tableData.push([
            r.testMaster?.parentId ? `   ${r.testMaster?.name}` : r.testMaster?.name,
            r.resultValue,
            r.testMaster?.unit || '',
            r.testMaster?.normalRangeText || '',
            r.isCritical ? '*' : ''
          ])
        }
      })
    })

    autoTable(doc, {
      startY: currentY,
      head: [['Parameter Pemeriksaan', 'Hasil', 'Satuan', 'Nilai Rujukan', 'Keterangan']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: primaryGreen, textColor: 255, fontSize: 9, halign: 'center', fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 40, halign: 'center' },
        4: { halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 1 || data.column.index === 4)) {
          const rowData = data.row.raw as any[];
          if (rowData && rowData[4] === '*') {
            data.cell.styles.textColor = [225, 29, 72];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    // --- Footer ---
    const finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    if (order.clinicalNotes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Catatan / Kesimpulan:', 15, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text(order.clinicalNotes, 15, finalY + 5, { maxWidth: pageWidth - 30 });
    }

    const footerY = Math.max(finalY + 25, pageHeight - 40);
    doc.text(`Bogor, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - 70, footerY);
    doc.text('Petugas Laboratorium,', pageWidth - 70, footerY + 5);
    doc.text('( ____________________ )', pageWidth - 70, footerY + 25);

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
    <div className="-mt-[20px] lg:-mt-[30px] flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 pt-0">
      {/* Top Professional Header - Fixed below Navbar, respects sidebar */}
      <div 
        ref={patientHeaderRef}
        className={`fixed top-[72px] right-0 z-30 backdrop-blur-xl bg-white/95 border-b border-slate-200/80 shadow-sm p-3 md:py-3.5 md:px-6 transition-all duration-300 ${isDoctorSidebarCollapsed ? 'left-0 lg:left-20' : 'left-0 lg:left-64'}`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200">
              <FiArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">{queue.patient.name}</h1>
                <span className="text-[9px] md:text-[10px] font-black px-2 md:px-2.5 py-0.5 md:py-1 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl border border-indigo-100 uppercase tracking-wider">{queue.patient.medicalRecordNo}</span>
                {queue.patient.gender && (
                  <span className={`text-[9px] md:text-[10px] font-black px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg md:rounded-xl border uppercase tracking-wider ${['L', 'M', 'Laki-laki'].includes(queue.patient.gender) ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    {['L', 'M', 'Laki-laki'].includes(queue.patient.gender) ? 'Laki-laki' : 'Perempuan'}
                  </span>
                )}
                <button 
                  onClick={() => setIsRMEInfoOpen(true)}
                  className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 bg-amber-400 text-white rounded-lg md:rounded-xl text-[9px] font-black hover:bg-amber-500 transition-all shadow-lg shadow-amber-200 animate-pulse"
                >
                  <FiInfo className="w-3 h-3" /> PANDUAN RME
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-1">
                <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  {queue.department?.name || 'UMUM'} • No. Antrean: <span className="text-slate-900">{queue.queueNo}</span>
                </p>
                {queue.patient.allergies && (
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="flex items-center gap-1 md:gap-1.5 px-2 py-0.5 bg-rose-500 text-white rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-200"
                  >
                    <FiAlertCircle className="w-3 h-3" /> ALERGI: {queue.patient.allergies}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
            {isReadOnly ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-xl border border-slate-200 shadow-inner">
                 <FiLock className="w-3.5 h-3.5" />
                 <span className="text-[9px] font-black uppercase tracking-widest leading-none">TERKUNCI</span>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => handleSaveConsultation(false)} 
                  disabled={saving} 
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-all shadow-sm"
                >
                  <FiSave className="w-3.5 h-3.5" /> 
                  <span>SIMPAN DRAFT</span>
                </button>
                <button 
                  onClick={() => handleSaveConsultation(true)} 
                  disabled={saving} 
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:shadow-[0_8px_20px_rgba(79,70,229,0.3)] hover:-translate-y-0.5 disabled:opacity-50 transition-all shadow-md shadow-primary/20 relative overflow-hidden group"
                >
                  <FiCheckCircle className="w-3.5 h-3.5" /> 
                  <span>SELESAI PEMERIKSAAN</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 md:p-4 grid grid-cols-12 gap-4 items-start pb-6" style={{ paddingTop: `${headerHeight + 16}px` }}>
        {/* Navigation Segments */}
        <div className="col-span-12 lg:col-span-3 space-y-3 lg:sticky lg:top-[160px]">
          <div className="bg-white/60 backdrop-blur-xl p-1.5 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden flex lg:flex-col overflow-x-auto lg:overflow-visible snap-x hidden-scrollbar">
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
                className={`flex-shrink-0 lg:w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[9px] font-black transition-all duration-300 mr-2 lg:mr-0 lg:mb-1 relative overflow-hidden group snap-center ${
                  activeSegment === s.id 
                  ? 'text-white shadow-lg shadow-indigo-500/20 lg:translate-x-1' 
                  : 'text-slate-500 hover:bg-white/80 hover:shadow-sm lg:hover:translate-x-1'
                }`}
              >
                {activeSegment === s.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-indigo-500 opacity-100 transition-opacity" />
                )}
                <span className="text-base lg:text-lg relative z-10 lg:group-hover:scale-110 transition-transform">{s.icon}</span>
                <span className="uppercase tracking-widest relative z-10">{s.label}</span>
              </button>
            ))}
          </div>

          {latestVitals && (
            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:scale-110" />
              <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-2 flex items-center gap-2 opacity-60">
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
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {isReadOnly && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-700">
               <div className="flex items-center gap-3">
                  <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-tight">Kunjungan ini Telah Selesai. Data rekam medis dalam mode baca-saja dan tidak dapat diubah lagi.</p>
               </div>
               <button
                  onClick={async () => {
                     if (!confirm("Buka kembali konsultasi ini? Dokter akan dapat mengedit resep dan rekam medis kembali.")) return;
                     try {
                        toast.loading("Membuka rekam medis...", { id: "reopen" });
                        const res = await api.post(`/transactions/queues/${id}/reopen`);
                        toast.success(res.data.message || "Konsultasi berhasil dibuka!", { id: "reopen" });
                        window.location.reload();
                     } catch (err: any) {
                        toast.error(err.response?.data?.message || "Gagal membuka konsultasi", { id: "reopen" });
                     }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-amber-600/10 active:scale-95 transition-all self-start sm:self-auto"
               >
                  <FiUnlock className="w-4 h-4" /> Buka Kunci Konsultasi
               </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            {activeSegment === 'nurse' && (
              <motion.div key="nurse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-3 lg:mb-4 border-b border-slate-50 pb-2 lg:pb-3">Keluhan Utama (Handover Perawat)</h3>
                  <div className="p-6 lg:p-10 bg-slate-50/50 rounded-2xl lg:rounded-3xl italic text-lg lg:text-xl text-slate-600 font-medium leading-relaxed border border-slate-100">
                    "{medicalRecord?.chiefComplaint || 'Tidak ada catatan keluhan.'}"
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'diag' && (
              <motion.div key="diag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 lg:mb-4 pb-3 border-b border-slate-50">
                     <div className="flex items-center gap-2">
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* S Quadrant */}
                    <div className="space-y-1.5 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-[10px] font-black shadow-md shadow-indigo-500/20 transform group-hover:rotate-6 transition-transform">S</div>
                        <label className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] group-focus-within:text-indigo-600 transition-colors">Subjective (Anamnesa)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={subjective} onChange={(e) => setSubjective(e.target.value)} className={`w-full p-3 border-2 border-indigo-50/80 rounded-xl min-h-[90px] lg:min-h-[110px] text-xs font-medium leading-relaxed focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-indigo-50/30 hover:bg-indigo-50/50'}`} placeholder="Keluhan utama, riwayat penyakit..." />
                    </div>

                    {/* O Quadrant */}
                    <div className="space-y-1.5 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center text-[10px] font-black shadow-md shadow-emerald-500/20 transform group-hover:-rotate-6 transition-transform">O</div>
                        <label className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] group-focus-within:text-emerald-600 transition-colors">Objective (Pemeriksaan)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={objective} onChange={(e) => setObjective(e.target.value)} className={`w-full p-3 border-2 border-emerald-50/80 rounded-xl min-h-[90px] lg:min-h-[110px] text-xs font-medium leading-relaxed focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-emerald-50/30 hover:bg-emerald-50/50'}`} placeholder="Pemeriksaan fisik, tanda klinis..." />
                    </div>

                    {/* A Quadrant */}
                    <div className="space-y-1.5 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center text-[10px] font-black shadow-md shadow-violet-500/20 transform group-hover:rotate-6 transition-transform">A</div>
                        <label className="text-[9px] font-black text-violet-400 uppercase tracking-[0.2em] group-focus-within:text-violet-600 transition-colors">Assessment (Diagnosa ICD-10)</label>
                      </div>
                      
                      {/* ICD-10 Search */}
                      {!isReadOnly && (
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <div className="relative group">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                            <input 
                              value={searchIcd}
                              onChange={(e) => {
                                setSearchIcd(e.target.value)
                                if (!isIcdDropdownOpen) setIsIcdDropdownOpen(true)
                              }}
                              onFocus={() => setIsIcdDropdownOpen(true)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  if (!isIcdDropdownOpen) setIsIcdDropdownOpen(true)
                                  setHighlightedIcdIndex(prev => {
                                    const next = prev + 1
                                    return next < icdResults.length ? next : prev
                                  })
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  setHighlightedIcdIndex(prev => (prev > -1 ? prev - 1 : -1))
                                } else if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const indexToSelect = highlightedIcdIndex >= 0 ? highlightedIcdIndex : (icdResults.length > 0 ? 0 : -1)
                                  
                                  if (indexToSelect >= 0 && icdResults[indexToSelect]) {
                                    const item = icdResults[indexToSelect]
                                    setIcd10Id(item.id)
                                    setSelectedIcd10(item)
                                    if (!diagnosis) setDiagnosis(item.nameId || item.nameEn)
                                    setIsIcdDropdownOpen(false)
                                    setSearchIcd('')
                                    setHighlightedIcdIndex(-1)
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsIcdDropdownOpen(false)
                                  setHighlightedIcdIndex(-1)
                                }
                              }}
                              placeholder="Cari kode atau nama penyakit ICD-10..."
                              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:bg-white focus:border-primary shadow-inner transition-all"
                            />
                            {isSearchingIcd && <FiRefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 text-primary animate-spin" />}
                          </div>
                          
                          <AnimatePresence>
                            {isIcdDropdownOpen && icdResults.length > 0 && (
                              <motion.div 
                                ref={icdContainerRef}
                                initial={{ opacity: 0, y: 5 }} 
                                animate={{ opacity: 1, y: 0 }} 
                                exit={{ opacity: 0 }} 
                                className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[300px] overflow-y-auto p-2"
                              >
                                {icdResults.map((item, idx) => (
                                  <button 
                                    key={item.id} 
                                    ref={el => { icdItemRefs.current[idx] = el }}
                                    onMouseEnter={() => setHighlightedIcdIndex(idx)}
                                    onClick={() => {
                                      setIcd10Id(item.id)
                                      setSelectedIcd10(item)
                                      if (!diagnosis) setDiagnosis(item.nameId || item.nameEn)
                                      setIsIcdDropdownOpen(false)
                                      setSearchIcd('')
                                      setHighlightedIcdIndex(-1)
                                    }}
                                    className={`w-full p-4 text-left rounded-xl transition-all border-b border-slate-50 last:border-0 ${highlightedIcdIndex === idx ? 'bg-primary/10' : 'hover:bg-slate-50'}`}
                                  >
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded border border-primary/10">{item.code}</span>
                                        </div>
                                        <p className="text-xs font-bold text-slate-700">{item.nameId || item.nameEn}</p>
                                        {item.description && (
                                          <p className="text-[10px] text-slate-400 mt-1 italic leading-relaxed line-clamp-2">{item.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Selected ICD-10 Display */}
                      {selectedIcd10 && (
                        <div className="p-2.5 bg-primary/5 border border-primary/10 rounded-xl flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-primary shadow-sm border border-primary/5 shrink-0">
                               <FiCheckCircle />
                            </div>
                            <div>
                               <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-black bg-primary text-white px-2 py-0.5 rounded">{selectedIcd10.code}</span>
                                  <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{selectedIcd10.nameId || selectedIcd10.nameEn}</span>
                               </div>
                               {selectedIcd10.description && (
                                  <p className="text-[10px] font-medium text-slate-500 italic leading-relaxed">{selectedIcd10.description}</p>
                               )}
                            </div>
                          </div>
                          {!isReadOnly && (
                            <button onClick={() => { setIcd10Id(null); setSelectedIcd10(null); }} className="text-rose-400 hover:text-rose-600 p-1 transition-colors">
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      )}

                      <textarea disabled={isReadOnly} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={`w-full p-3 border-2 border-violet-50/80 rounded-xl min-h-[90px] lg:min-h-[110px] text-xs font-medium leading-relaxed focus:bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-violet-50/30 hover:bg-violet-50/50'}`} placeholder="Diagnosa spesifik atau catatan tambahan..." />
                    </div>

                    {/* P Quadrant */}
                    <div className="space-y-1.5 group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-[10px] font-black shadow-md shadow-amber-500/20 transform group-hover:-rotate-6 transition-transform">P</div>
                        <label className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] group-focus-within:text-amber-600 transition-colors">Plan (Terapi/Rencana)</label>
                      </div>
                      <textarea disabled={isReadOnly} value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} className={`w-full p-3 border-2 border-amber-50/80 rounded-xl min-h-[90px] lg:min-h-[110px] text-xs font-medium leading-relaxed focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-inner ${isReadOnly ? 'bg-slate-50 opacity-60' : 'bg-amber-50/30 hover:bg-amber-50/50'}`} placeholder="Rencana pengobatan, edukasi..." />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'rx' && (
              <motion.div key="rx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3 lg:mb-4 pb-3 border-b border-slate-50">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Resep Obat (Rx)</h3>
                      <p className="text-[10px] font-bold text-slate-400">Daftar obat yang diberikan kepada pasien</p>
                    </div>
                    {!isReadOnly && (
                      <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
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
                           onClick={() => {
                             resetRacikanForm()
                             setIsRacikanDialogOpen(true)
                           }} 
                           className="px-6 py-4 bg-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-violet-500/20 hover:bg-violet-700 transition-all flex items-center gap-2"
                         >
                           <HiOutlineBeaker className="w-4 h-4" /> BUAT RACIKAN
                         </button>
                         <button 
                           onClick={() => handlePrintPrescription('internal')}
                           disabled={saving || prescriptionItems.filter(p => !p.isExternal).length === 0}
                           className="px-5 py-4 bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                         >
                           <FiPrinter className="w-4 h-4 text-emerald-300 animate-pulse" /> CETAK RESEP INTERNAL ({prescriptionItems.filter(p => !p.isExternal).length})
                         </button>
                         <button 
                           onClick={() => handlePrintPrescription('external')}
                           disabled={saving || prescriptionItems.filter(p => p.isExternal).length === 0}
                           className="px-5 py-4 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                         >
                           <FiPrinter className="w-4 h-4 text-rose-200" /> CETAK RESEP EKSTERNAL ({prescriptionItems.filter(p => p.isExternal).length})
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
                        className={`p-3 lg:p-4 rounded-xl border transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)] ${
                          isStockInsufficient(p) 
                            ? 'bg-rose-50/20 border-rose-200 hover:border-rose-300 hover:bg-rose-50' 
                            : 'bg-slate-50/30 border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-[220px_110px_90px_1fr_70px_60px] gap-3 lg:gap-4 items-start">
                          {/* Col 1: Info Obat */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border shrink-0 ${p.isRacikan ? 'bg-violet-50 text-violet-600 border-violet-100' : 'bg-white text-primary border-slate-100'}`}>
                                  {p.isRacikan ? <HiOutlineBeaker className="w-5 h-5 animate-pulse" /> : <FiPackage />}
                               </div>
                               <div className="min-w-0 flex-1">
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5 truncate">
                                    {p.isRacikan ? (p.racikanName || 'Obat Racikan') : p.name}
                                    {p.isExternal && (
                                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white uppercase tracking-widest shrink-0 shadow-sm shadow-rose-500/10">
                                        Luar
                                      </span>
                                    )}
                                  </p>
                                  <div className="flex flex-col mt-0.5">
                                    {p.isRacikan ? (
                                      <div className="flex flex-wrap gap-1 mt-1 max-w-xs">
                                        {p.components?.map((c: any, cidx: number) => (
                                          <span key={cidx} className="inline-block text-[8px] font-bold text-violet-750 bg-violet-50 border border-violet-100/50 px-1.5 py-0.5 rounded">
                                            {c.medicineName || c.medicine?.medicineName || 'Bahan'} ({c.quantity} {c.unit || 'unit'})
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{p.dosage}</p>
                                        {p.unit && (
                                          <>
                                            <span className="text-slate-300">•</span>
                                            <span className="text-[8px] font-black text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded truncate">
                                              {p.unit}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                               </div>
                            </div>
                          </div>
                          
                          {/* Col 2: Sumber Obat */}
                          <div className="w-full">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Sumber Obat</label>
                            <div className="flex bg-slate-200/50 p-0.5 rounded-xl border border-slate-200">
                              <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => {
                                  const n = [...prescriptionItems];
                                  n[idx].isExternal = false;
                                  setPrescriptionItems(n);
                                }}
                                className={`flex-1 text-[9px] font-black py-1.5 px-2 rounded-lg transition-all uppercase tracking-wider ${
                                  !p.isExternal
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-700'
                                }`}
                              >
                                Internal
                              </button>
                              <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => {
                                  const n = [...prescriptionItems];
                                  n[idx].isExternal = true;
                                  setPrescriptionItems(n);
                                }}
                                className={`flex-1 text-[9px] font-black py-1.5 px-2 rounded-lg transition-all uppercase tracking-wider ${
                                  p.isExternal
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-700'
                                }`}
                              >
                                Luar
                              </button>
                            </div>
                          </div>
                          
                          {/* Col 3: Frekuensi */}
                          <div className="w-full">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block flex items-center justify-between">
                              <span>Frekuensi</span>
                              {p.availableStock !== undefined && (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${p.isExternal ? 'bg-amber-50 text-amber-600 border-amber-100' : p.availableStock > 10 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                  {p.availableStock}
                                </span>
                              )}
                            </label>
                            <input disabled={isReadOnly} value={p.frequency} onChange={(e) => { const n = [...prescriptionItems]; n[idx].frequency = e.target.value; setPrescriptionItems(n); }} placeholder="e.g. 3x1" className={`w-full px-3 py-2 text-xs font-black border border-slate-200 rounded-xl focus:border-primary outline-none ${isReadOnly ? 'bg-slate-50' : 'bg-white'}`} />
                          </div>
                          
                          {/* Col 4: Instruksi Khusus */}
                          <div className="w-full">
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
                              className={`w-full px-3 py-2 text-xs font-black border border-slate-200 rounded-xl focus:border-primary outline-none ${(!['Sesudah makan', 'Sebelum makan'].includes(p.instructions) || p.instructions === '') ? 'mb-2' : ''} ${isReadOnly ? 'bg-slate-50' : 'bg-white'}`}
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
                                className={`w-full px-3 py-2 text-xs font-black border border-slate-200 rounded-xl focus:border-primary outline-none ${isReadOnly ? 'bg-slate-50' : 'bg-white'}`} 
                              />
                            )}
                          </div>
                          
                          {/* Col 5: Qty */}
                          <div className="w-full">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                              Qty
                            </label>
                            <div className={`flex flex-col border rounded-xl overflow-hidden ${isReadOnly ? 'bg-slate-50' : 'bg-white'} ${isStockInsufficient(p) ? 'border-rose-500 bg-rose-50' : 'border-slate-200'}`}>
                               <input 
                                  disabled={isReadOnly} 
                                  type="number" 
                                  value={p.quantity} 
                                  onChange={(e) => { 
                                    const val = parseInt(e.target.value) || 0;
                                    if (!p.isExternal && p.availableStock !== undefined && val > p.availableStock) {
                                      toast.error(`Stok tidak mencukupi (Tersedia: ${p.availableStock})`);
                                    }
                                    const n = [...prescriptionItems]; 
                                    n[idx].quantity = e.target.value; 
                                    setPrescriptionItems(n); 
                                  }} 
                                  className="w-full text-center py-2 text-xs font-black outline-none bg-transparent" 
                                />
                            </div>
                            {isStockInsufficient(p) && (
                              <p className="text-[8px] font-black text-rose-500 uppercase mt-1 text-center animate-pulse">
                                {p.isRacikan ? 'Bahan Melebihi Stok!' : 'Melebihi Stok!'}
                              </p>
                            )}
                          </div>
                          
                          {/* Col 6: Aksi */}
                          <div className="w-full flex flex-col items-center">
                             <label className="text-[9px] font-black text-transparent select-none mb-1.5 block">Aksi</label>
                             {!isReadOnly && (
                               <div className="flex items-center gap-1.5">
                                 {p.isRacikan && (
                                   <button 
                                     onClick={() => {
                                       setIsEditingRacikanIdx(idx)
                                       setRacikanName(p.racikanName || p.name)
                                       setRacikanQty(String(p.quantity))
                                       setRacikanDosageForm(p.unit || 'Puyer')
                                       setRacikanDosage(p.dosage || '')
                                       setRacikanFrequency(p.frequency || '3x1')
                                       setRacikanDuration(p.duration || '3 hari')
                                       setRacikanInstructions(p.instructions || 'Sesudah makan')
                                       setRacikanTuslah(String(p.tuslahPrice || 0))
                                       setRacikanComponents(p.components?.map((c: any) => ({
                                         medicineId: c.medicineId,
                                         medicineName: c.medicineName || c.medicine?.medicineName || 'Bahan',
                                         quantity: c.quantity,
                                         unit: c.unit || 'unit',
                                         availableStock: c.availableStock ?? 99999
                                       })) || [])
                                       if (p.formulaId) {
                                         const f = compoundFormulas.find((cf: any) => cf.id === p.formulaId)
                                         setSelectedFormula(f || null)
                                       } else {
                                         setSelectedFormula(null)
                                       }
                                       setIsRacikanDialogOpen(true)
                                     }}
                                     className="p-2 text-violet-500 hover:text-violet-600 hover:bg-violet-50 border border-slate-100 hover:border-violet-100 rounded-xl transition-all flex items-center justify-center animate-none"
                                   >
                                      <FiEdit3 className="w-4 h-4" />
                                   </button>
                                 )}
                                 <button 
                                   onClick={() => setPrescriptionItems(prescriptionItems.filter((_, i) => i !== idx))} 
                                   className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-100 hover:border-rose-100 rounded-xl transition-all flex items-center justify-center animate-none"
                                 >
                                    <FiTrash2 className="w-4 h-4" />
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
              <motion.div key="tindakan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 lg:mb-4 pb-3 border-b border-slate-50">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Tindakan Medis</h3>
                      <p className="text-[10px] font-bold text-slate-400">Daftar layanan atau tindakan yang diberikan</p>
                    </div>
                    {!isReadOnly && (
                      <button 
                        onClick={() => {
                          const initialSelected = allServices.filter(s => serviceItems.some(item => item.serviceId === s.id))
                          setSelectedServices(initialSelected)
                          setSearchServiceDialog('')
                          setIsServiceDialogOpen(true)
                        }}
                        className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:shadow-xl hover:-translate-y-0.5 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
                      >
                        <FiPlus /> Pilih Tindakan Medis
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {serviceItems.map((s, idx) => (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-emerald-50/30 p-4 lg:p-6 rounded-2xl lg:rounded-3xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 lg:gap-6">
                        <div className="flex items-center gap-3 lg:gap-4">
                           <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100 shrink-0">
                              <FiCheckCircle />
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{s.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{s.code}</p>
                           </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4 lg:gap-8 w-full sm:w-auto mt-2 sm:mt-0 pl-14 sm:pl-0">
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
              <motion.div key='lab' initial={{ opacity: 0 }} animate={{ opacity: 1 }} className='space-y-4'>
                <div className='bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px] flex flex-col'>
                  <div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3 lg:mb-4 pb-3 border-b border-slate-50'>
                     <div className='flex items-center gap-4'>
                        <div className='w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-500/20 shrink-0'>
                           <HiOutlineBeaker className='w-5 h-5' />
                        </div>
                        <div>
                           <h3 className='text-xs font-black text-slate-800 uppercase tracking-widest leading-none'>Laboratory Diagnostic</h3>
                           <p className='text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1.5'>Pilih pemeriksaan & kelola hasil</p>
                        </div>
                     </div>
                     <div className='flex flex-col sm:flex-row gap-2 lg:gap-3 w-full md:w-auto'>
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

                  <div className='grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 flex-1'>
                     <div className='lg:col-span-7 space-y-4'>
                        <div className='relative group' ref={labDropdownRef}>
                           <label className='text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 group-focus-within:text-rose-500 transition-colors'>Cari Pemeriksaan Lab</label>
                           <div className='mt-1.5 relative'>
                              <button 
                                 onClick={() => setIsLabDropdownOpen(!isLabDropdownOpen)}
                                 className='absolute inset-y-0 right-4 flex items-center z-10 text-slate-400 hover:text-rose-500 transition-colors'
                              >
                                 <FiChevronDown className={`w-4 h-4 transition-transform ${isLabDropdownOpen ? 'rotate-180' : ''}`} />
                              </button>
                              <div className='absolute inset-y-0 left-4 flex items-center pointer-events-none'>
                                 <FiSearch className='w-4 h-4 text-slate-400 group-focus-within:text-rose-500 transition-colors' />
                              </div>
                              <input 
                                 type='text' 
                                 value={searchLab}
                                 onChange={(e) => {
                                    setSearchLab(e.target.value);
                                    setIsLabDropdownOpen(true);
                                 }}
                                 onFocus={() => setIsLabDropdownOpen(true)}
                                 className='w-full pl-10 pr-6 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all'
                                 placeholder='Cari panel pemeriksaan (ex: Darah Lengkap)...'
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
                                                   className='w-full px-4 py-2.5 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors'
                                                >
                                                   <div>
                                                      <p className='text-xs font-bold text-slate-800 uppercase tracking-tight'>{svc.name}</p>
                                                      <div className="flex items-center gap-2 mt-0.5">
                                                         <p className='text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded'>{svc.category || 'Lab Test'}</p>
                                                         {svc.unit && <span className="text-[8px] font-medium text-slate-400 italic">Unit: {svc.unit}</span>}
                                                      </div>
                                                   </div>
                                                   <div className="text-right">
                                                      <p className="text-[10px] font-black text-slate-700">Rp {Number(svc.price || 0).toLocaleString('id-ID')}</p>
                                                      <FiPlus className='text-rose-500 ml-auto mt-0.5 w-3 h-3' />
                                                   </div>
                                                </button>
                                             ))
                                          ) : (
                                             <div className='p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-widest'>Pemeriksaan tidak ditemukan</div>
                                          );
                                       })()}
                                    </motion.div>
                                 )}
                              </AnimatePresence>
                           </div>
                        </div>
                        <div className='space-y-2'>
                           <label className='text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1'>Pemeriksaan yang Dipilih</label>
                           {labItems.length > 0 ? (
                              <div className='flex flex-wrap gap-2 p-3 bg-slate-50/50 border border-slate-100 rounded-2xl'>
                                 {labItems.map((item, idx) => (
                                    <motion.span 
                                       key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                       className='inline-flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm text-[10px] font-black text-slate-800 uppercase tracking-tight'
                                    >
                                       <span className="w-4 h-4 rounded bg-rose-50 text-rose-600 flex items-center justify-center text-[8px] font-bold shrink-0">{idx + 1}</span>
                                       <span>{item.serviceName}</span>
                                       <button 
                                          onClick={() => setLabItems(labItems.filter(i => i.id !== item.id))}
                                          className='p-0.5 text-slate-300 hover:text-rose-500 rounded transition-colors ml-1'
                                       >
                                          ✕
                                       </button>
                                    </motion.span>
                                 ))}
                              </div>
                           ) : (
                              <div className='py-10 border border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/20'>
                                 <HiOutlineBeaker className='w-8 h-8 text-slate-200 mx-auto mb-2' />
                                 <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest'>Belum ada pemeriksaan dipilih</p>
                              </div>
                           )}
                        </div>
                     </div>
                     <div className='lg:col-span-5 space-y-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6'>
                        <div className='space-y-1.5'>
                           <label className='text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]'>Catatan Khusus Laborat</label>
                           <textarea 
                              disabled={isReadOnly}
                              value={labNotes} 
                              onChange={(e) => setLabNotes(e.target.value)}
                              className={`w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl min-h-[60px] max-h-[120px] text-xs font-medium leading-relaxed focus:bg-white focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all shadow-inner ${isReadOnly ? 'opacity-60' : ''}`}
                              placeholder='Instruksi tambahan untuk tim lab...'
                           />
                        </div>
                        <div className='space-y-1.5'>
                           <label className='text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-1.5'>
                              <FiCheckCircle /> Hasil Lab Terstruktur
                           </label>
                           <textarea 
                               disabled={isReadOnly}
                               value={labResults} 
                               onChange={(e) => setLabResults(e.target.value)}
                               className={`w-full p-3 bg-indigo-50/30 border border-indigo-100/50 rounded-xl min-h-[60px] max-h-[120px] text-xs font-medium leading-relaxed focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-inner ${isReadOnly ? 'opacity-60' : ''}`}
                               placeholder='Kesimpulan hasil lab (jika sudah ada)...'
                           />
                        </div>

                        {/* Structured Lab Results */}
                        {(medicalRecord?.labOrders?.length || 0) > 0 && (
                           <div className='space-y-3 pt-3 border-t border-slate-100'>
                              <div className='space-y-2.5'>
                                 {medicalRecord.labOrders.map((order: any) => (
                                    <div key={order.id} className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                                       <div className="bg-slate-100/50 px-3 py-1.5 flex justify-between items-center border-b border-slate-100">
                                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{order.orderNo}</span>
                                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                             {order.status}
                                          </span>
                                           {order.status === 'completed' && (
                                              <button 
                                                 onClick={() => generateLabResultPDF(order)}
                                                 className="text-[8px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded transition-colors"
                                              >
                                                 <FiPrinter className="w-2.5 h-2.5" /> PDF
                                              </button>
                                           )}
                                       </div>
                                       {order.results?.length > 0 ? (
                                           <div className="p-2 space-y-0.5 bg-white">
                                              {order.results.map((res: any) => (
                                                 <div key={res.id} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 px-1.5 rounded transition-colors">
                                                    <div className="flex-1">
                                                       <p className="text-[9px] font-bold text-slate-700 uppercase">{res.testMaster?.name}</p>
                                                    </div>
                                                    <div className="flex-1 text-center">
                                                       <p className={`text-[10px] font-black ${res.isCritical ? 'text-rose-500 bg-rose-50 py-0.5 px-1.5 rounded-full inline-block' : 'text-slate-900'}`}>
                                                         {res.resultValue} <span className="text-[8px] font-medium text-slate-400 ml-0.5">{res.testMaster?.unit}</span>
                                                       </p>
                                                    </div>
                                                    <div className="flex-1 text-right">
                                                       <p className="text-[8px] font-medium text-slate-400 italic bg-slate-50 py-0.5 px-1.5 rounded inline-block">Ref: {res.testMaster?.normalRangeText}</p>
                                                    </div>
                                                 </div>
                                              ))}
                                           </div>
                                       ) : (
                                          <div className="p-3 text-center">
                                             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Belum ada hasil</p>
                                          </div>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}
                        <div className='p-3 bg-amber-50/40 rounded-xl border border-amber-100/50'>
                           <p className='text-[8px] font-black text-amber-600 uppercase tracking-[0.2em] mb-1 flex items-center gap-1'>
                              <FiInfo /> Prosedur Digital Lab
                           </p>
                           <p className='text-[8px] font-bold text-amber-600/70 leading-normal uppercase tracking-tight'>
                              Pastikan pemeriksaan sudah benar sebelum mencetak. Order masuk ke antrian Laboratorium otomatis setelah disimpan.
                           </p>
                        </div>
                     </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'referral' && (
              <motion.div key="referral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 lg:mb-4 pb-3 border-b border-slate-50">
                     <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Digital Referral Management</h3>
                     <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-100 hidden sm:inline-block">Care Coordination</span>
                  </div>
                               <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
                     <div className="lg:col-span-6 space-y-4">
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-3">
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{editingReferralId ? 'Edit Rujukan Terpilih' : 'Buat Rujukan Baru'}</p>
                             {editingReferralId && (
                                <button 
                                  onClick={() => {
                                    setEditingReferralId(null)
                                    setReferralNotes('')
                                    setReferralToClinicId('')
                                    setReferralToDepartmentId('')
                                    setReferralToHospitalName('')
                                  }}
                                  className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline"
                                >
                                  Batal Edit
                                </button>
                             )}
                          </div>
                          <div className="space-y-3">
                              <div className="flex gap-2">
                                 {['INTERNAL', 'EXTERNAL'].map(type => (
                                    <button 
                                      key={type} 
                                      onClick={() => setReferralType(type as any)} 
                                      className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${referralType === type ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                    >
                                       {type === 'INTERNAL' ? 'Poli Internal' : 'RS Luar'}
                                    </button>
                                 ))}
                              </div>

                              {referralType === 'INTERNAL' ? (
                                <div className="flex flex-col gap-2">
                                   <select value={referralToClinicId} onChange={e => setReferralToClinicId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] font-bold bg-white focus:border-primary outline-none">
                                      <option value="">Pilih Klinik Tujuan...</option>
                                      {clinicsList.map(c => (
                                         <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                   </select>
                                   <select value={referralToDepartmentId} onChange={e => setReferralToDepartmentId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] font-bold bg-white focus:border-primary outline-none">
                                      <option value="">Pilih Poli/Unit Tujuan...</option>
                                      {departmentsList.map(d => (
                                         <option key={d.id} value={d.id}>{d.name}</option>
                                      ))}
                                   </select>
                                </div>
                              ) : (
                                <input value={referralToHospitalName} onChange={e => setReferralToHospitalName(e.target.value)} placeholder="Ketik nama Rumah Sakit tujuan..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] font-bold bg-white focus:border-primary outline-none" />
                              )}

                              <textarea value={referralNotes} onChange={e => setReferralNotes(e.target.value)} placeholder="Catatan medis tambahan atau rincian klinis untuk rujukan..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] font-bold bg-white focus:border-primary outline-none min-h-[70px] max-h-[140px]" />
                              
                              <button disabled={isPrinting} onClick={handleSaveAndPrintReferral} className={`w-full py-2.5 mt-1 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 ${editingReferralId ? 'bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600' : 'bg-primary text-white shadow-primary/20 hover:bg-primary/90'}`}>
                                 {isPrinting ? 'Memproses...' : editingReferralId ? 'Perbarui & Cetak Rujukan' : 'Cetak & Simpan Rujukan'}
                              </button>
                          </div>
                       </div>
                     </div>
                     
                     <div className="lg:col-span-6 space-y-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1.5">Riwayat Rujukan Kunjungan Ini</p>
                        {referrals.length === 0 ? (
                          <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/20">
                             <FiArrowLeft className="w-6 h-6 text-slate-200 mx-auto mb-1.5 rotate-180" />
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum Ada Rujukan</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                             {referrals.map(r => (
                               <div key={r.id} className="p-2.5 px-3 bg-white border border-slate-100 rounded-xl flex items-center justify-between shadow-sm hover:border-indigo-100 transition-colors">
                                  <div>
                                     <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">Rujukan {r.type === 'INTERNAL' ? 'Internal' : 'RS Luar'}</p>
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Ke: <span className="text-slate-700">{r.type === 'INTERNAL' ? `${r.toClinic?.name || 'Klinik'} - ${r.toDepartment?.name || 'Poli'}` : r.toHospitalName}</span></p>
                                     <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-1">Status: {r.status || 'Pending'}</p>
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                      <button 
                                        onClick={() => {
                                          setEditingReferralId(r.id)
                                          setReferralType(r.type)
                                          setReferralNotes(r.notes || '')
                                          if (r.type === 'INTERNAL') {
                                            setReferralToClinicId(r.toClinicId || '')
                                            setReferralToDepartmentId(r.toDepartmentId || '')
                                          } else {
                                            setReferralToHospitalName(r.toHospitalName || '')
                                          }
                                        }} 
                                        title="Edit Rujukan" 
                                        className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition-all"
                                      >
                                        <FiEdit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => handleReprintReferral(r)} title="Print Ulang Rujukan" className="p-1.5 text-primary hover:bg-indigo-50 rounded-lg transition-all"><FiPrinter className="w-3.5 h-3.5" /></button>
                                      {!isReadOnly && (
                                        <button 
                                          onClick={() => handleDeleteReferral(r.id)} 
                                          title="Hapus Rujukan" 
                                          className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-all"
                                        >
                                          <FiTrash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                   </div>
                               </div>
                             ))}
                          </div>
                        )}
                     </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSegment === 'attachment' && (
              <motion.div key="attachment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 lg:mb-4 pb-3 border-b border-slate-50">
                     <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Medical Media & Attachments</h3>
                     <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 hidden sm:inline-block">Clinical Photography</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {!isReadOnly && (
                      <label className={`aspect-square border-2 border-dashed border-slate-200 rounded-3xl lg:rounded-[2.5rem] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary hover:bg-slate-50 transition-all group ${isUploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                         <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 group-hover:text-primary transition-all">
                            {isUploadingAttachment ? <FiRefreshCw className="w-8 h-8 animate-spin" /> : <FiPlus className="w-8 h-8" />}
                         </div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isUploadingAttachment ? 'Mengunggah...' : 'Unggah Foto / PDF'}</p>
                         <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleUploadAttachment} disabled={isUploadingAttachment} />
                      </label>
                    )}
                    
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="aspect-square border border-slate-200 rounded-3xl lg:rounded-[2.5rem] flex flex-col overflow-hidden group relative bg-slate-50">
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
                       <div className="aspect-square border-2 border-dashed border-slate-200 rounded-3xl lg:rounded-[2.5rem] flex flex-col items-center justify-center gap-4 bg-slate-50">
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
              <motion.div key="consent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 lg:mb-4 pb-3 border-b border-slate-50">
                     <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Informed Consent & Verification</h3>
                     <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full border border-rose-100 hidden sm:inline-block">Legal & Safety</span>
                  </div>
                  
                  <div className="max-w-xl mx-auto py-6 lg:py-10">
                    <div className={`p-6 lg:p-10 rounded-3xl lg:rounded-[2.5rem] border-2 transition-all ${hasInformedConsent ? 'bg-emerald-50 border-emerald-100 shadow-lg shadow-emerald-500/5' : 'bg-slate-50 border-slate-100'}`}>
                       <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 mb-6 lg:mb-8">
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
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[300px]">
                   <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-3 lg:mb-4 pb-3 border-b border-slate-50">Riwayat Kunjungan</h3>
                   <div className="space-y-6 lg:space-y-8">
                     {history.map((h, idx) => (
                        <div key={idx} className="p-6 lg:p-8 bg-slate-50/30 rounded-3xl lg:rounded-[2rem] border border-slate-100 relative group hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all">
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
                                 <div className="flex flex-col gap-1">
                                   {h.icd10 && (
                                     <div className="flex items-center gap-2">
                                       <span className="text-[8px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{h.icd10.code}</span>
                                       <span className="text-[10px] font-bold text-slate-700">{h.icd10.nameId || h.icd10.nameEn}</span>
                                     </div>
                                   )}
                                   <p className="text-sm font-bold text-slate-800 leading-relaxed italic">"{h.diagnosis || '-'}"</p>
                                 </div>
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

      {/* Dialog Pilih Tindakan Medis */}
      <AnimatePresence>
        {isServiceDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                    <FiActivity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                      Pilih Tindakan Medis
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                      Daftar layanan medis klinik yang tersedia untuk pasien
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative w-80 group">
                    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      value={searchServiceDialog} 
                      onChange={(e) => setSearchServiceDialog(e.target.value)} 
                      placeholder="Cari tindakan medis..." 
                      className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:bg-white focus:border-emerald-500 shadow-sm transition-all" 
                    />
                    {searchServiceDialog && (
                      <button onClick={() => setSearchServiceDialog('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 hover:text-slate-600">✕</button>
                    )}
                  </div>
                  <button onClick={() => setIsServiceDialogOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                    <FiMinus className="w-5 h-5" /> 
                  </button>
                </div>
              </div>
              
              {/* Content Grid */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left Side: 4-Column Grid of Services */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6">
                    {(() => {
                      const searchLower = searchServiceDialog.toLowerCase();
                      const filtered = allServices.filter(s => {
                        const categoryName = s.serviceCategory?.categoryName?.toLowerCase() || '';
                        const serviceName = s.serviceName.toLowerCase();
                        
                        const isLab = categoryName.includes('laboratorium') || 
                                      categoryName.includes('lab') || 
                                      serviceName.includes('lab');
                        
                        if (isLab) return false;
                        
                        return !searchServiceDialog || 
                          serviceName.includes(searchLower) ||
                          s.serviceCode.toLowerCase().includes(searchLower);
                      });

                      return filtered.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filtered.map(s => {
                            const isSelected = selectedServices.some(item => item.id === s.id);
                            return (
                              <button 
                                key={s.id} 
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedServices(selectedServices.filter(item => item.id !== s.id))
                                  } else {
                                    setSelectedServices([...selectedServices, s])
                                  }
                                }} 
                                className={`p-3 text-left rounded-xl transition-all duration-300 group flex flex-col justify-between border-2 relative overflow-hidden ${
                                  isSelected 
                                    ? 'border-emerald-500 bg-emerald-50/80 shadow-md shadow-emerald-500/5 scale-[1.01]' 
                                    : 'border-slate-200 bg-white shadow-sm hover:border-emerald-400 hover:shadow-md'
                                }`}
                              >
                                <div className="flex items-start justify-between w-full gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1.5 transition-all ${
                                      isSelected 
                                        ? 'bg-emerald-500 text-white' 
                                        : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600'
                                    }`}>
                                      {s.serviceCode}
                                    </span>
                                    <p className={`text-[11px] font-black uppercase tracking-tight leading-tight line-clamp-2 transition-colors ${
                                      isSelected ? 'text-emerald-950 font-extrabold' : 'text-slate-800 group-hover:text-emerald-700'
                                    }`}>
                                      {s.serviceName}
                                    </p>
                                  </div>
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                    isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white group-hover:border-emerald-400'
                                  }`}>
                                    {isSelected && <FiCheckCircle className="w-2.5 h-2.5" />}
                                  </div>
                                </div>
                                <div className="mt-2 pt-1.5 border-t border-slate-100/50 flex items-center justify-between w-full">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Biaya</span>
                                  <p className={`text-[10px] font-black tracking-tight ${isSelected ? 'text-emerald-800' : 'text-slate-900 group-hover:text-emerald-600'}`}>
                                    Rp {new Intl.NumberFormat('id-ID').format(s.price)}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-20 text-slate-300">
                          <FiActivity className="w-16 h-16 mx-auto mb-4 opacity-30" />
                          <p className="text-xs font-black uppercase tracking-widest">Tindakan tidak ditemukan</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                
                {/* Right Side: Sidebar of Selected Items */}
                <div className="w-full md:w-80 flex flex-col bg-slate-50 border-l border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-100/30 flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tindakan Terpilih ({selectedServices.length})</p>
                    {selectedServices.length > 0 && (
                      <button onClick={() => setSelectedServices([])} className="text-[8px] font-black text-rose-500 uppercase hover:underline">Hapus Semua</button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {selectedServices.map(s => (
                      <div key={s.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 shadow-sm">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-slate-800 uppercase truncate">{s.serviceName}</p>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{s.serviceCode}</p>
                        </div>
                        <button onClick={() => setSelectedServices(selectedServices.filter(item => item.id !== s.id))} className="text-rose-400 hover:text-rose-600 shrink-0 p-1">
                          <FiMinus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {selectedServices.length === 0 && (
                      <div className="text-center py-20 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Belum ada tindakan dipilih</div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
                <button onClick={() => setIsServiceDialogOpen(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                  Batal
                </button>
                <button 
                  onClick={() => {
                    const newServiceItems = selectedServices.map(s => {
                      const existing = serviceItems.find(item => item.serviceId === s.id)
                      return {
                        serviceId: s.id,
                        name: s.serviceName,
                        code: s.serviceCode,
                        price: s.price,
                        quantity: existing ? existing.quantity : 1
                      }
                    })
                    setServiceItems(newServiceItems)
                    setIsServiceDialogOpen(false)
                  }} 
                  className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
                >
                  <FiCheckCircle /> Terapkan ({selectedServices.length} Tindakan)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                        placeholder="Cari nama obat..." 
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:bg-white focus:border-primary shadow-sm transition-all" 
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {searchMedicines.map(m => {
                      const isSelected = selectedMedicines.some(sm => sm.id === m.id)
                      const stock = m.availableStock ?? m.stock
                      return (
                        <button 
                          key={m.id} 
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMedicines(selectedMedicines.filter(sm => sm.id !== m.id))
                            } else {
                              setSelectedMedicines([...selectedMedicines, m])
                            }
                          }} 
                          className={`w-full p-4 text-left rounded-2xl transition-all group flex items-start gap-4 border ${isSelected ? 'border-primary bg-primary/5' : 'border-slate-100 hover:bg-slate-50'}`}
                        >
                          <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>
                            {isSelected && <FiCheckCircle className="w-3 h-3" />}
                          </div>
                          <div className="flex-1">
                            <p className={`text-xs font-black uppercase tracking-tight transition-colors ${isSelected ? 'text-primary' : 'text-slate-800'}`}>{m.masterName}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase italic">{m.medicine?.genericName} • {m.medicine?.strength}</p>
                          </div>
                          <div className="text-right">
                            <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${stock > 10 ? 'bg-emerald-50 text-emerald-600' : stock > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                              {stock > 0 ? `Stok: ${stock} ${m.unit}` : 'Habis (Apotek Luar)'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                    {searchMedicines.length === 0 && searchMed && !isSearchingMed && (
                      <div className="text-center py-10 text-slate-400 text-xs font-bold">Obat tidak ditemukan</div>
                    )}
                    {isSearchingMed && (
                      <div className="text-center py-10 text-slate-400 text-xs font-bold animate-pulse">Mencari obat...</div>
                    )}
                    {searchMedicines.length === 0 && !searchMed && !isSearchingMed && (
                      <div className="text-center py-10 text-slate-400 text-xs font-bold">Tidak ada daftar obat ditemukan.</div>
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

      {/* Dialog Racikan (Puyer / Custom) */}
      <AnimatePresence>
        {isRacikanDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-violet-50/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 shadow-sm border border-violet-100">
                    <HiOutlineBeaker className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                      {isEditingRacikanIdx !== null ? 'Edit Resep Racikan' : 'Buat Resep Racikan (Puyer/Kapsul)'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                      Kelola resep racikan kustom atau pakai template formula standar
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsRacikanDialogOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                  <FiMinus className="w-5 h-5" /> 
                </button>
              </div>
              
              {/* Scrollable Content */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[450px]">
                {/* Kiri: Detail Racikan & Bahan Baku */}
                <div className="flex-1 flex flex-col border-r border-slate-100 overflow-y-auto p-6 space-y-4">
                  
                  {/* Pilihan Template Formula */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Template Formula Standar (BoM)</label>
                    <select 
                      value={selectedFormula?.id || ''} 
                      onChange={(e) => {
                        const fid = e.target.value
                        if (fid) {
                          const f = compoundFormulas.find(cf => cf.id === fid)
                          setSelectedFormula(f)
                          handleSelectFormula(fid)
                        } else {
                          setSelectedFormula(null)
                          resetRacikanForm()
                        }
                      }}
                      className="w-full px-4 py-2.5 text-xs font-black bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all"
                    >
                      <option value="">-- Buat Racikan Kustom (Tanpa Template) --</option>
                      {compoundFormulas.map(cf => (
                        <option key={cf.id} value={cf.id}>
                          {cf.formulaName} [{cf.formulaCode}] - Kategori: {cf.category || '-'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Form Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Nama Racikan</label>
                      <input 
                        type="text" 
                        value={racikanName} 
                        onChange={(e) => setRacikanName(e.target.value)} 
                        placeholder="Contoh: Puyer Demam & Batuk Anak" 
                        className="w-full px-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Bentuk Sediaan</label>
                      <select 
                        value={racikanDosageForm} 
                        onChange={(e) => setRacikanDosageForm(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                      >
                        <option value="Puyer">Puyer</option>
                        <option value="Kapsul">Kapsul</option>
                        <option value="Sirup">Sirup</option>
                        <option value="Salep">Salep</option>
                        <option value="Tablet">Tablet</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                    <div className="space-y-1.5">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Jumlah Racikan</label>
                      <input 
                        type="number" 
                        value={racikanQty} 
                        onChange={(e) => setRacikanQty(e.target.value)} 
                        placeholder="Contoh: 10" 
                        className="w-full px-4 py-2.5 text-xs font-black text-center bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Frekuensi</label>
                      <input 
                        type="text" 
                        value={racikanFrequency} 
                        onChange={(e) => setRacikanFrequency(e.target.value)} 
                        placeholder="3x1" 
                        className="w-full px-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Durasi</label>
                      <input 
                        type="text" 
                        value={racikanDuration} 
                        onChange={(e) => setRacikanDuration(e.target.value)} 
                        placeholder="3 hari" 
                        className="w-full px-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Instruksi Khusus</label>
                      <input 
                        type="text" 
                        value={racikanInstructions} 
                        onChange={(e) => setRacikanInstructions(e.target.value)} 
                        placeholder="Sesudah makan" 
                        className="w-full px-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-end min-h-[28px] pb-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1 leading-tight">Jasa Racik (Tuslah)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">Rp</span>
                        <input 
                          type="number" 
                          value={racikanTuslah} 
                          onChange={(e) => setRacikanTuslah(e.target.value)} 
                          placeholder="0" 
                          className="w-full pl-8 pr-3 py-2.5 text-xs font-black bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-violet-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pencarian Bahan Baku */}
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <FiPlus className="text-violet-500" /> Tambah Bahan Baku (Komponen)
                      </h4>
                    </div>

                    <div className="relative group">
                      <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                      <input 
                        value={searchComponentMed} 
                        onChange={(e) => setSearchComponentMed(e.target.value)} 
                        placeholder="Cari obat bahan baku..." 
                        className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-violet-500 shadow-sm transition-all" 
                      />
                      
                      <AnimatePresence>
                        {searchComponentMed && searchComponentResults.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0 }} 
                            className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-[200px] overflow-y-auto p-2"
                          >
                            {searchComponentResults.map(m => {
                              const stock = m.availableStock ?? m.stock ?? 0
                              const alreadyAdded = racikanComponents.some(rc => rc.medicineId === m.medicineId || rc.medicineId === m.id)
                              return (
                                <button 
                                  key={m.id} 
                                  disabled={alreadyAdded}
                                  onClick={() => {
                                    setRacikanComponents([...racikanComponents, {
                                      medicineId: m.medicineId || m.id,
                                      medicineName: m.masterName,
                                      quantity: 1,
                                      unit: m.unit || m.medicine?.dosageForm || 'tablet',
                                      availableStock: stock
                                    }])
                                    setSearchComponentMed('')
                                  }}
                                  className="w-full p-2.5 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between transition-colors disabled:opacity-50"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-slate-700">{m.masterName}</p>
                                    <p className="text-[9px] text-slate-400 font-medium">Stok: {stock} {m.unit}</p>
                                  </div>
                                  <span className="text-[9px] font-black text-violet-600 bg-violet-50 px-2 py-1 rounded-md uppercase tracking-wider">
                                    {alreadyAdded ? 'Sudah Ada' : 'Tambah'}
                                  </span>
                                </button>
                              )
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Kanan: Ringkasan Komponen Racikan */}
                <div className="w-full md:w-96 flex flex-col bg-slate-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-100/50 flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Bahan Baku Terpilih ({racikanComponents.length})
                    </p>
                    {racikanComponents.length > 0 && (
                      <button 
                        onClick={() => setRacikanComponents([])} 
                        className="text-[8px] font-black text-rose-500 uppercase hover:underline"
                      >
                        Hapus Semua
                      </button>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {racikanComponents.map((c, cidx) => {
                      const totalNeeded = (parseFloat(c.quantity) || 0) * (parseInt(racikanQty) || 0)
                      const insufficient = totalNeeded > c.availableStock
                      return (
                        <div key={cidx} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">
                                {c.medicineName}
                              </p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                Stok: {c.availableStock} {c.unit}
                              </p>
                            </div>
                            <button 
                              onClick={() => setRacikanComponents(racikanComponents.filter((_, i) => i !== cidx))} 
                              className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div className="flex items-center gap-3 pt-1.5 border-t border-slate-50">
                            <div className="flex-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                                Qty per unit
                              </label>
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden h-8">
                                <input 
                                  type="number" 
                                  step="0.1"
                                  value={c.quantity} 
                                  onChange={(e) => {
                                    const val = e.target.value
                                    const n = [...racikanComponents]
                                    n[cidx].quantity = val
                                    setRacikanComponents(n)
                                  }}
                                  className="w-full text-center py-1 text-xs font-black outline-none bg-transparent"
                                />
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                                Total Kebutuhan
                              </label>
                              <p className={`text-xs font-black ${insufficient ? 'text-rose-600 animate-pulse' : 'text-slate-700'}`}>
                                {totalNeeded.toFixed(1)} {c.unit}
                              </p>
                            </div>
                          </div>
                          {insufficient && (
                            <p className="text-[8px] font-black text-rose-500 uppercase tracking-wider text-right animate-pulse">
                              ⚠️ Stok tidak cukup!
                            </p>
                          )}
                        </div>
                      )
                    })}
                    {racikanComponents.length === 0 && (
                      <div className="text-center py-20 text-slate-400 text-[10px] font-bold uppercase tracking-widest space-y-2">
                        <FiPackage className="w-8 h-8 mx-auto opacity-30 text-slate-500" />
                        <p>Belum ada bahan baku ditambahkan</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Estimasi Biaya */}
                  {racikanComponents.length > 0 && (
                    <div className="bg-slate-100 p-4 border-t border-slate-200 space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                        <span>Tuslah Racik (Jasa)</span>
                        <span>Rp {Number(selectedFormula?.tuslahPrice || 0).toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-xs font-black text-slate-800 uppercase pt-1 border-t border-slate-200">
                        <span>Estimasi Total</span>
                        <span>
                          Rp {Number(
                            (racikanComponents.reduce((sum, c) => sum + 500 * (parseFloat(c.quantity) || 0) * (parseInt(racikanQty) || 0), 0)) + 
                            (selectedFormula?.tuslahPrice || 0)
                          ).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
                <button 
                  onClick={() => setIsRacikanDialogOpen(false)} 
                  className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSaveRacikan}
                  disabled={racikanComponents.length === 0 || racikanComponents.some(c => (parseFloat(c.quantity) || 0) * (parseInt(racikanQty) || 0) > c.availableStock)}
                  className="px-6 py-3 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50 transition-all shadow-lg shadow-violet-200 flex items-center gap-2"
                >
                  <FiCheckCircle /> {isEditingRacikanIdx !== null ? 'Simpan Perubahan' : 'Tambahkan Racikan'}
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

      {/* Hidden Lab Result Print Template */}
      {isPrinting && currentPrintLab && (
        <div className="fixed -left-[9999px] top-0 pointer-events-none z-[-1]">
          <div id="print-lab-result-template" className="w-[210mm] min-h-[297mm] bg-white text-slate-800 font-sans box-border relative overflow-hidden" style={{ padding: '20mm' }}>
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
                     <h2 className="text-3xl font-black uppercase tracking-tight text-rose-500">HASIL LABORATORIUM</h2>
                     <p className="text-xs font-bold uppercase tracking-widest mt-2 bg-slate-100 text-slate-600 inline-block px-3 py-1 rounded-lg">No. Order: {currentPrintLab.orderNo}</p>
                  </div>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
                   <table className="w-full text-sm">
                     <tbody>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">Nama Pasien</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 font-black text-slate-900">{queue?.patient.name}</td></tr>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">No. Rekam Medis</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 text-slate-700">{queue?.patient.medicalRecordNo}</td></tr>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">Dokter Pengirim</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 text-slate-700">{currentPrintLab.doctor?.name || queue?.doctor?.name || user?.name}</td></tr>
                       <tr><td className="w-48 py-2 font-bold text-slate-400 uppercase tracking-widest text-[10px]">Tgl. Periksa</td><td className="w-4 py-2 text-slate-300">:</td><td className="py-2 text-slate-700">{new Date(currentPrintLab.orderDate).toLocaleString('id-ID')}</td></tr>
                     </tbody>
                   </table>
                </div>

                <div className="mb-8">
                   <table className="w-full text-sm border-collapse">
                      <thead>
                         <tr className="bg-rose-500 text-white">
                            <th className="px-4 py-3 text-left font-black uppercase tracking-widest text-[10px] rounded-tl-xl">Parameter Pemeriksaan</th>
                            <th className="px-4 py-3 text-center font-black uppercase tracking-widest text-[10px]">Hasil</th>
                            <th className="px-4 py-3 text-center font-black uppercase tracking-widest text-[10px]">Satuan</th>
                            <th className="px-4 py-3 text-center font-black uppercase tracking-widest text-[10px]">Nilai Rujukan</th>
                            <th className="px-4 py-3 text-right font-black uppercase tracking-widest text-[10px] rounded-tr-xl">Status</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 border-x border-b border-slate-100">
                         {currentPrintLab.results?.map((res: any, i: number) => (
                            <tr key={res.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                               <td className="px-4 py-4 font-bold text-slate-700">{res.testMaster?.name}</td>
                               <td className={`px-4 py-4 text-center font-black text-base ${res.isCritical ? 'text-rose-600 animate-pulse' : 'text-slate-900'}`}>{res.resultValue}</td>
                               <td className="px-4 py-4 text-center text-slate-500 font-medium">{res.testMaster?.unit || '-'}</td>
                               <td className="px-4 py-4 text-center text-slate-500 font-medium italic">{res.testMaster?.normalRangeText || '-'}</td>
                               <td className="px-4 py-4 text-right">
                                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${res.isCritical ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                     {res.isCritical ? 'KRITIS' : 'NORMAL'}
                                  </span>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="flex justify-between mt-20">
                   <div className="text-center w-64">
                      <p className="text-xs text-slate-400 mb-20 uppercase tracking-widest font-black">Dicetak Oleh,</p>
                      <div className="border-b border-slate-200 w-full mb-2"></div>
                      <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Sistem RME Yasfina</p>
                   </div>
                   <div className="text-center w-64">
                      <p className="text-xs text-slate-500 mb-20 uppercase tracking-widest font-black">Petugas Laboratorium,</p>
                      <div className="border-b-2 border-slate-300 w-full mb-2"></div>
                      <p className="text-sm font-black uppercase text-slate-900">( .............................. )</p>
                   </div>
                </div>

                <div className="absolute bottom-10 left-20 right-20 border-t border-slate-200 pt-6 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Hasil ini dihasilkan secara otomatis dan sah melalui Sistem Informasi Laboratorium Klinik</p>
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
                        
                        {/* Destination Info */}
                        <div className="mb-6">
                           <p className="text-xs text-slate-700 font-bold uppercase tracking-widest mb-2">Tujuan Rujukan:</p>
                           <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                              <p className="text-sm font-black text-primary uppercase">
                                 {currentPrintReferral.type === 'INTERNAL' 
                                    ? `${currentPrintReferral.toClinic?.name || 'Klinik'} - ${currentPrintReferral.toDepartment?.name || 'Poli'}` 
                                    : currentPrintReferral.toHospitalName}
                              </p>
                           </div>
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
                                 <p className="whitespace-pre-wrap font-bold text-slate-900 mb-4 leading-relaxed">
                                   {selectedIcd10 ? `[${selectedIcd10.code}] ${selectedIcd10.nameId || selectedIcd10.nameEn}` : ''}
                                   {selectedIcd10 && diagnosis ? ' - ' : ''}
                                   {diagnosis || (!selectedIcd10 ? '-' : '')}
                                 </p>
                                 <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Terapi Diberikan (P)</p>
                                 <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{treatmentPlan || '-'}</p>
                              </div>
                           </div>
                        </div>
                        
                        <div className="mb-12 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                           <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary"></div>
                           <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Catatan Rujukan Khusus</h3>
                           <p className="text-xs text-slate-700 leading-relaxed italic">{currentPrintReferral.notes || '-'}</p>
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
            
            {/* Destination Info */}
            <div className="mb-6">
               <p className="text-xs text-slate-700 font-bold uppercase tracking-widest mb-2">Tujuan Rujukan:</p>
               <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <p className="text-sm font-black text-primary uppercase">
                     {currentPrintReferral.type === 'INTERNAL' 
                        ? `${currentPrintReferral.toClinic?.name || 'Klinik'} - ${currentPrintReferral.toDepartment?.name || 'Poli'}` 
                        : currentPrintReferral.toHospitalName}
                  </p>
               </div>
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
                     <p className="whitespace-pre-wrap font-bold text-slate-900 mb-4 leading-relaxed">
                        {selectedIcd10 ? `[${selectedIcd10.code}] ${selectedIcd10.nameId || selectedIcd10.nameEn}` : ''}
                        {selectedIcd10 && diagnosis ? ' - ' : ''}
                        {diagnosis || (!selectedIcd10 ? '-' : '')}
                     </p>
                     
                     <p className="font-bold text-slate-400 uppercase tracking-widest text-[8px] mb-1">Terapi Diberikan (P)</p>
                     <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{treatmentPlan || "-"}</p>
                  </div>
               </div>
            </div>
            
            {/* Notes Section */}
            <div className="mb-12 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary"></div>
               <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Catatan Rujukan Khusus</h3>
               <p className="text-xs text-slate-700 leading-relaxed italic">{currentPrintReferral.notes || "-"}</p>
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
      
      {/* Premium Final Confirmation Modal */}
      <AnimatePresence>
        {showFinalConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFinalConfirm(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                      <FiCheckCircle className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Verifikasi & Kunci Data</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Data akan dikunci permanen untuk arsip medis.</p>
                   </div>
                </div>
                
                <div className="space-y-2 mb-8">
                   {[
                     { 
                       id: 'soap', 
                       label: 'SOAP (Anamnesa & Fisik)', 
                       icon: <FiActivity />, 
                       isFilled: !!(subjective.trim() || objective.trim()) 
                     },
                     { 
                       id: 'diagnosis', 
                       label: 'Diagnosa & Kode ICD-10', 
                       icon: <FiAlertCircle />, 
                       isFilled: !!(diagnosis.trim() || selectedIcd10) 
                     },
                     { 
                       id: 'services', 
                       label: 'Tindakan Medis (Opsional)', 
                       icon: <FiPlus />, 
                       isFilled: serviceItems.length > 0 
                     },
                     { 
                       id: 'prescription', 
                       label: 'Resep Obat & Aturan Pakai', 
                       icon: <FiPackage />, 
                       isFilled: prescriptionItems.length > 0 
                     },
                     { 
                       id: 'laboratory', 
                       label: 'Order Lab (Opsional)', 
                       icon: <HiOutlineBeaker />, 
                       isFilled: labItems.length > 0 
                     },
                     { 
                       id: 'consent', 
                       label: 'Persetujuan Tindakan', 
                       icon: <FiCheckCircle />, 
                       isFilled: hasInformedConsent,
                       action: () => setHasInformedConsent(!hasInformedConsent)
                     },
                   ].map((item) => {
                     const Content = (
                       <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                            item.isFilled ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                          }`}>
                             {item.icon}
                          </div>
                          <div className="text-left">
                             <div className="flex items-center gap-2">
                                <p className="text-[10px] font-black uppercase tracking-tight">{item.label}</p>
                                {item.action && !item.isFilled && (
                                  <span className="text-[7px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-md animate-pulse">KLIK DISINI</span>
                                )}
                             </div>
                             <p className="text-[8px] font-bold uppercase tracking-widest opacity-70">
                               {item.isFilled ? '✓ Data Sudah Lengkap' : item.action ? 'KLIK UNTUK VERIFIKASI LANGSUNG' : '! Data Belum Diisi'}
                             </p>
                          </div>
                       </div>
                     );

                     const StatusIcon = (
                       <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                         item.isFilled ? 'text-emerald-500' : 'text-amber-500'
                       }`}>
                          {item.isFilled ? <FiCheckCircle className="w-5 h-5" /> : <FiAlertCircle className="w-5 h-5" />}
                       </div>
                     );

                     if (item.action) {
                       return (
                         <button
                           key={item.id}
                           onClick={item.action}
                           className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all hover:scale-[1.02] active:scale-95 ${
                             item.isFilled 
                               ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' 
                               : 'bg-amber-50/50 border-amber-100 text-amber-700 shadow-lg shadow-amber-500/10'
                           }`}
                         >
                           {Content}
                           {StatusIcon}
                         </button>
                       );
                     }

                     return (
                       <div
                         key={item.id}
                         className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                           item.isFilled 
                             ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' 
                             : 'bg-amber-50/50 border-amber-100 text-amber-700'
                         }`}
                       >
                         {Content}
                         {StatusIcon}
                       </div>
                     );
                   })}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setShowFinalConfirm(false)}
                    className="py-4 px-6 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-slate-200 transition-all"
                  >
                    Tinjau Kembali
                  </button>
                  <button 
                    onClick={() => executeSave(true, isPrescriptionRedirect)}
                    disabled={saving}
                    className="py-4 px-6 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2"
                  >
                    {saving ? 'MEMPROSES...' : 'YA, SELESAIKAN & KUNCI'}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border-t border-slate-100 p-4 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                   <FiLock /> PERMANENT LOCKING SYSTEM
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Prescription Preview Modal */}
      <AnimatePresence>
        {isRxPreviewOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-slate-100"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 border border-indigo-100">
                    <FiPackage className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">Pratinjau Resep Obat</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Draft tersimpan · Review sebelum dicetak</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rxPrintMode && (
                    <button
                      onClick={() => {
                        generateRxPDF(rxPrintMode, 'print')
                      }}
                      className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                    >
                      <FiPrinter className="w-3.5 h-3.5" /> CETAK RESEP
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsRxPreviewOpen(false);
                      setRxPrintMode(null);
                      if (pdfUrl) {
                        URL.revokeObjectURL(pdfUrl);
                        setPdfUrl(null);
                      }
                    }}
                    className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <FiMinus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Pilihan Tujuan Resep */}
              {!rxPrintMode && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
                  <div className="text-center mb-2">
                    <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Resep ini untuk?</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">Pilih tujuan pengambilan obat</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                    <button 
                      onClick={() => {
                        setRxPrintMode('internal');
                        const url = generateRxPDF('internal', 'bloburl') as string;
                        setPdfUrl(url);
                      }} 
                      className="group p-6 rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left"
                    >
                      <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/20">
                        <FiHome className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Farmasi Klinik</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Obat tersedia di apotek klinik. Resep dicetak untuk diserahkan ke farmasi internal.</p>
                      <div className="mt-3 flex items-center gap-1.5 text-indigo-600">
                        <FiCheckCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Stok Klinik</span>
                      </div>
                    </button>
                    <button 
                      onClick={() => {
                        setRxPrintMode('external');
                        const url = generateRxPDF('external', 'bloburl') as string;
                        setPdfUrl(url);
                      }} 
                      className="group p-6 rounded-2xl border-2 border-amber-100 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50 transition-all text-left"
                    >
                      <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                        <FiPackage className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Apotek Luar</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">Obat tidak tersedia di klinik. Pasien membeli sendiri di apotek luar dengan resep ini.</p>
                      <div className="mt-3 flex items-center gap-1.5 text-amber-600">
                        <FiAlertCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Stok Tidak Dikurangi</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Dokumen setelah mode dipilih */}
              {rxPrintMode && (
                <>
                  <div className={`px-5 py-2.5 border-b flex items-center justify-between shrink-0 ${rxPrintMode === 'external' ? 'bg-amber-50 border-amber-100' : 'bg-indigo-50 border-indigo-100'}`}>
                    <div className="flex items-center gap-2">
                      {rxPrintMode === 'external'
                        ? <><FiAlertCircle className="w-3.5 h-3.5 text-amber-500" /><span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Resep Eksternal · Stok tidak dikurangi</span></>
                        : <><FiCheckCircle className="w-3.5 h-3.5 text-indigo-500" /><span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Farmasi Klinik · Obat diambil dari stok</span></>
                      }
                    </div>
                    <button 
                      onClick={() => {
                        setRxPrintMode(null);
                        if (pdfUrl) {
                          URL.revokeObjectURL(pdfUrl);
                          setPdfUrl(null);
                        }
                      }} 
                      className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest underline"
                    >
                      Ganti
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 bg-slate-100/50 flex flex-col justify-stretch items-stretch min-h-[50vh]">
                    {pdfUrl ? (
                      <iframe 
                        src={pdfUrl} 
                        className="w-full flex-1 rounded-2xl border border-slate-200 shadow-inner bg-white" 
                        title="Pratinjau PDF Resep"
                      />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                        <FiPackage className="w-10 h-10 animate-bounce text-indigo-400" />
                        <p className="text-xs font-black uppercase tracking-wider">Membuat pratinjau resep...</p>
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FiLock className="w-3 h-3" /> Draft · Nomor RX dibuat saat Selesai Pemeriksaan
                    </p>
                    <button
                      onClick={() => generateRxPDF(rxPrintMode, 'save')}
                      className={`px-5 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 ${rxPrintMode === 'external' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20'}`}
                    >
                      <FiPrinter className="w-3.5 h-3.5" />
                      {rxPrintMode === 'external' ? 'Unduh Resep Eksternal' : 'Unduh Resep Farmasi'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
