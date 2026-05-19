import { Request, Response } from 'express'
import { PrismaClient, Prisma } from '@prisma/client'

import { prisma } from '../lib/prisma'

/**
 * Step 1: Nurse saves Vital Signs and Chief Complaint
 * Updates queue status to 'ready' (for doctor)
 */
export const saveNurseVitals = async (req: Request, res: Response) => {
  try {
    const { 
        queueId, 
        patientId, 
        clinicId, 
        registrationId,
        doctorId, 
        chiefComplaint, 
        vitals 
    } = req.body

    if (!queueId || !patientId || !clinicId) {
      return res.status(400).json({ message: 'Data wajib (Queue, Patient, Clinic) tidak lengkap' })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Medical Record Number if doesn't exist for this registration
      let medicalRecord = await tx.medicalRecord.findFirst({
        where: { registrationId }
      })

      if (!medicalRecord) {
        const { getJakartaDateString } = require('../utils/date')
        const dateStr = getJakartaDateString().replace(/-/g, '')
        
        const jakartaTodayStr = getJakartaDateString()
        const today = new Date(`${jakartaTodayStr}T00:00:00+07:00`)
        const nextDay = new Date(today)
        nextDay.setDate(nextDay.getDate() + 1)

        const count = await tx.medicalRecord.count({
          where: { recordDate: { gte: today, lt: nextDay } }
        })

        let nextNum = count + 1
        let recordNo = ''
        let isUnique = false

        // Guaranteed Uniqueness Loop
        while (!isUnique) {
          recordNo = `MR-${dateStr}-${nextNum.toString().padStart(4, '0')}`
          const exists = await tx.medicalRecord.findUnique({
            where: { recordNo }
          })
          if (!exists) {
            isUnique = true
          } else {
            nextNum++
          }
        }

        medicalRecord = await tx.medicalRecord.create({
          data: {
            recordNo,
            patientId,
            clinicId,
            doctorId: doctorId || null,
            registrationId,
            chiefComplaint: chiefComplaint || '',
            recordDate: new Date(),
          }
        })
      } else {
        // Update existing draft
        medicalRecord = await tx.medicalRecord.update({
          where: { id: medicalRecord.id },
          data: { chiefComplaint }
        })
      }

      // 2. Save Vital Signs (Upsert the latest one)
      if (vitals) {
        const existingVital = await tx.vitalSign.findFirst({
          where: { medicalRecordId: medicalRecord.id },
          orderBy: { recordedAt: 'desc' }
        })

        const vitalData = {
          medicalRecordId: medicalRecord.id,
          temperature: vitals.temperature ? parseFloat(vitals.temperature) : null,
          bloodPressure: vitals.bloodPressure,
          heartRate: vitals.heartRate ? parseInt(vitals.heartRate) : null,
          respiratoryRate: vitals.respiratoryRate ? parseInt(vitals.respiratoryRate) : null,
          weight: vitals.weight ? parseFloat(vitals.weight) : null,
          height: vitals.height ? parseFloat(vitals.height) : null,
          bloodOxygen: vitals.bloodOxygen ? parseFloat(vitals.bloodOxygen) : null,
          notes: vitals.notes,
          recordedAt: new Date()
        }

        if (existingVital) {
          await tx.vitalSign.update({
            where: { id: existingVital.id },
            data: vitalData
          })
        } else {
          await tx.vitalSign.create({
            data: vitalData
          })
        }
      }

      // 3. Update Queue Status to 'ready' (Nurse check done)
      await tx.queueNumber.update({
        where: { id: queueId },
        data: { status: 'ready' }
      })

      return medicalRecord
    }, {
      maxWait: 10000,
      timeout: 30000,
    })

    res.status(200).json(result)
  } catch (e) {
    console.error('Save Nurse Vitals Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Helper to check if a date is Sunday or a public holiday (Tanggal Merah)
 * Now fetches values from SiteSettings for dynamic pricing
 */
const getConsultationPrice = async (tx: any, date: Date, visitType: string): Promise<number> => {
  const { getJakartaDayName } = require('../utils/date')
  const dayName = getJakartaDayName(date)
  const isSunday = dayName === 'Minggu';
  const isHoliday = isSunday; // Basic holiday check

  // Fetch settings from DB
  const settings = await tx.siteSetting.findMany({
    where: {
      key: { in: ['fee_doctor_regular', 'fee_doctor_holiday', 'fee_doctor_control'] }
    }
  })

  const getVal = (key: string, fallback: number) => {
    const s = settings.find((i: any) => i.key === key)
    return s ? parseFloat(s.value as string) : fallback
  }

  const priceRegular = getVal('fee_doctor_regular', 70000)
  const priceHoliday = getVal('fee_doctor_holiday', 80000)
  const priceControl = getVal('fee_doctor_control', 35000)

  if (visitType?.toUpperCase() === 'KONTROL') {
    return priceControl;
  }

  if (isHoliday) {
    return priceHoliday;
  }

  return priceRegular;
}

/**
 * Step 2: Doctor saves Diagnosis, Treatments, and Prescriptions
 */
export const saveDoctorConsultation = async (req: Request, res: Response) => {
  try {
        const { 
        queueId,
        medicalRecordId,
        subjective,
        objective,
        diagnosis,
        icd10Id,
        treatmentPlan,
        labNotes,
        labResults,
        notes,
        hasInformedConsent,
        services, // [{ serviceId, price, quantity }]
        prescriptions, // [{ medicineId, quantity, dosage, frequency, duration, instructions }]
        isFinal = true // Default to true for backward compatibility
    } = req.body

    const result = await prisma.$transaction(async (tx) => {
      let previousServiceIds: string[] = [];

      // 1. Update Medical Record with Doctor's findings
      const mr = await tx.medicalRecord.update({
        where: { id: medicalRecordId },
        data: {
          subjective,
          objective,
          diagnosis,
          icd10Id,
          treatmentPlan,
          labNotes,
          labResults,
          notes,
          hasInformedConsent: !!hasInformedConsent,
          consultationDraft: !isFinal ? { subjective, objective, diagnosis, icd10Id, treatmentPlan, services, prescriptions } : Prisma.DbNull,
          // Only update doctorId if we have a valid doctor account
          ...( (req as any).user.doctor?.id ? { doctorId: (req as any).user.doctor.id } : {} )
        },
        include: { patient: true, services: true, icd10: true }
      })

      // 1.1 Handle Clinical Services (Tindakan)
      if (services && Array.isArray(services)) {
        // Record them to MedicalRecord only if FINAL (for billing/history)
        if (isFinal) {
          // Track existing services before deletion so we can clean them up from invoice later
          const previousServices = await tx.medicalRecordService.findMany({
            where: { medicalRecordId: mr.id },
            select: { serviceId: true }
          })
          previousServiceIds = previousServices.map(s => s.serviceId)

          await tx.medicalRecordService.deleteMany({ where: { medicalRecordId: mr.id } })
          for (const s of services) {
            // Lab items are also recorded here now so they can be reloaded on reopen
            // but we still trigger LabOrder separately below

            const serviceExists = await tx.service.findUnique({ where: { id: s.serviceId } })
            if (serviceExists) {
              await tx.medicalRecordService.create({
                data: {
                  medicalRecordId: mr.id,
                  serviceId: s.serviceId,
                  quantity: s.quantity || 1,
                  price: s.price,
                  notes: s.notes || ''
                }
              })
            }
          }
        }

        // 1.2 Always check for Lab Services to trigger LabOrder (even for DRAFTS)
        // Check both isLab flag and service name as fallback
        const hasLab = services.some((s: any) => 
          s.isLab || 
          (s.name && s.name.toUpperCase().includes('LAB')) ||
          (s.serviceName && s.serviceName.toUpperCase().includes('LAB'))
        )

        if (hasLab) {
          const existingOrder = await tx.labOrder.findFirst({
            where: { medicalRecordId: mr.id }
          })
          
          if (!existingOrder) {
            const lCount = await tx.labOrder.count()
            const orderNo = `LAB-${Date.now().toString().slice(-6)}-${(lCount + 1).toString().padStart(3, '0')}`
            
            // Get doctorId from user profile, existing MR, or queue
            let finalDoctorId = (req as any).user.doctor?.id || mr.doctorId
            if (!finalDoctorId) {
                const q = await tx.queueNumber.findUnique({ where: { id: queueId } })
                finalDoctorId = q?.doctorId
            }

            if (finalDoctorId) {
              await tx.labOrder.create({
                data: {
                  orderNo,
                  medicalRecordId: mr.id,
                  patientId: mr.patientId,
                  doctorId: finalDoctorId,
                  status: 'pending',
                  orderDate: new Date()
                }
              })
            }
          }
        }
      }

      // If it's just a draft, we stop here. We don't close queue, don't bill, don't RX.
      if (!isFinal) {
        return mr
      }

      // 2. Handle Prescriptions (Only if Final)
      if (prescriptions && Array.isArray(prescriptions) && prescriptions.length > 0) {
        const validPrescriptions = prescriptions.filter((item: any) => item.medicineId || item.isRacikan)

        if (validPrescriptions.length > 0) {
          const medicineIds = [
            ...new Set(
              validPrescriptions
                .map((item: any) => {
                  if (item.isRacikan && Array.isArray(item.components)) {
                    return item.components.map((c: any) => c.medicineId)
                  }
                  return [item.medicineId]
                })
                .flat()
                .filter(Boolean)
            )
          ]
          const existingMedicines = await tx.medicine.findMany({
            where: { id: { in: medicineIds } },
            select: { id: true }
          })
          const validMedicineIds = new Set(existingMedicines.map((m: any) => m.id))
          const safePrescriptions = validPrescriptions.filter((item: any) => {
            if (item.isRacikan) {
              if (!Array.isArray(item.components) || item.components.length === 0) return false
              return item.components.every((c: any) => validMedicineIds.has(c.medicineId))
            }
            return validMedicineIds.has(item.medicineId)
          })

          // SERVER-SIDE STOCK VALIDATION: Read real-time stock from DB to prevent race conditions
          // Check current stock against prescriptions from the PRODUCT table (the actual stock)
          for (const item of safePrescriptions) {
            const isExternal = item.isExternal || 
                               item.instructions?.includes('(Apotek Luar)') || 
                               item.instructions?.includes('[Eksternal]') ||
                               item.instructions?.includes('Apotek Luar') ||
                               item.instructions?.includes('Eksternal');
            if (isExternal) continue;

            if (item.isRacikan) {
              for (const comp of item.components) {
                const product = await tx.product.findFirst({
                  where: {
                    clinicId: mr.clinicId,
                    masterProduct: { medicineId: comp.medicineId }
                  },
                  select: { id: true, quantity: true, productName: true }
                })
                if (product) {
                  const requiredQty = (parseFloat(comp.quantity) || 0) * (parseInt(item.quantity) || 0)
                  if (requiredQty > product.quantity) {
                    throw new Error(`Stok tidak mencukupi untuk bahan racikan ${product.productName}: dibutuhkan ${requiredQty}, tersedia ${product.quantity}`)
                  }
                }
              }
            } else {
              const product = await tx.product.findFirst({
                where: {
                  clinicId: mr.clinicId,
                  masterProduct: { medicineId: item.medicineId }
                },
                select: { id: true, quantity: true, productName: true }
              })
              if (product) {
                const requestedQty = parseInt(item.quantity) || 0
                if (requestedQty > product.quantity) {
                  throw new Error(`Stok tidak mencukupi untuk ${product.productName}: dibutuhkan ${requestedQty}, tersedia ${product.quantity}`)
                }
              }
            }
          }

          // Only create prescription if none exists yet for this medical record (prevent duplicate on reopen)
          const existingPrescription = await tx.prescription.findFirst({
            where: { medicalRecordId: mr.id }
          })

          if (!existingPrescription && safePrescriptions.length > 0) {
            const pCount = await tx.prescription.count()
            const pNo = `RX-${Date.now().toString().slice(-6)}-${(pCount + 1).toString().padStart(3, '0')}`

            await tx.prescription.create({
              data: {
                prescriptionNo: pNo,
                medicalRecordId: mr.id,
                patientId: mr.patientId,
                doctorId: mr.doctorId || (req as any).user.doctor?.id,
                prescriptionDate: new Date(),
                items: {
                  create: safePrescriptions.map((item: any) => ({
                    isRacikan: !!item.isRacikan,
                    racikanName: item.racikanName || null,
                    formulaId: item.formulaId || null,
                    medicineId: item.medicineId || null,
                    quantity: parseInt(item.quantity) || 0,
                    dosage: item.dosage,
                    frequency: item.frequency,
                    duration: item.duration,
                    instructions: item.instructions,
                    tuslahPrice: parseFloat(item.tuslahPrice) || 0,
                    components: item.isRacikan && Array.isArray(item.components) ? {
                      create: item.components.map((comp: any) => ({
                        medicineId: comp.medicineId,
                        quantity: parseFloat(comp.quantity) || 0,
                        unit: comp.unit || null
                      }))
                    } : undefined
                  }))
                }
              }
            })
          } else if (existingPrescription) {
            // Update existing prescription items (reopen case)
            await tx.prescriptionItem.deleteMany({ where: { prescriptionId: existingPrescription.id } })
            for (const item of safePrescriptions) {
              await tx.prescriptionItem.create({
                data: {
                  prescriptionId: existingPrescription.id,
                  isRacikan: !!item.isRacikan,
                  racikanName: item.racikanName || null,
                  formulaId: item.formulaId || null,
                  medicineId: item.medicineId || null,
                  quantity: parseInt(item.quantity) || 0,
                  dosage: item.dosage,
                  frequency: item.frequency,
                  duration: item.duration,
                  instructions: item.instructions,
                  tuslahPrice: parseFloat(item.tuslahPrice) || 0,
                  components: item.isRacikan && Array.isArray(item.components) ? {
                    create: item.components.map((comp: any) => ({
                      medicineId: comp.medicineId,
                      quantity: parseFloat(comp.quantity) || 0,
                      unit: comp.unit || null
                    }))
                  } : undefined
                }
              })
            }
          }
        }
      }

      // 3. Update Invoice with Services, Medicines & Lab (Only if Final)
      const invoice = await tx.invoice.findFirst({
        where: { patientId: mr.patientId, clinicId: mr.clinicId, status: { in: ['unpaid', 'draft'] } },
        orderBy: { createdAt: 'desc' }
      })

      if (invoice) {
        // Fetch Registration to check visitType for pricing
        const registration = await tx.registration.findUnique({
          where: { id: mr.registrationId || undefined }
        })
        const visitType = registration?.visitType || 'BARU'
        const consultPrice = await getConsultationPrice(tx, new Date(), visitType)

        // PREVENT DUPLICATE ITEMS ON REOPEN: Remove existing items added by this medical record
        // We do this by checking if invoice items already exist for this mr's services
        // Strategy: delete all existing items from this invoice that were generated from doctor consultation
        // then re-insert fresh. This handles the reopen case cleanly.
        const existingMrItems = await tx.invoiceItem.findFirst({
          where: { invoiceId: invoice.id }
        })
        
        // Only clear & re-add if invoice already has items (reopen scenario)
        // For fresh saves, items will be empty
        if (existingMrItems) {
          // Remove items that were previously added from doctor consultation
          // Use the previousServiceIds we collected at the start of the transaction
          // (They are available here because we are still in the same transaction)
          const serviceIdsToRemove = [
            ...(previousServiceIds || []),
            ...(services?.map((s: any) => s.serviceId) || []),
          ]
          
          if (serviceIdsToRemove.length > 0) {
            await tx.invoiceItem.deleteMany({
              where: {
                invoiceId: invoice.id,
                serviceId: { in: [...new Set(serviceIdsToRemove)] }
              }
            })
          }
          // Also remove medicine items (grouped under obat/medicine services)
          // We search by both code and name to be thorough
          const medicineServices = await tx.service.findMany({
            where: {
              OR: [
                { serviceCode: 'MED-GEN' },
                { serviceName: { contains: 'Obat', mode: 'insensitive' } }
              ],
              AND: {
                OR: [{ clinicId: mr.clinicId }, { clinic: { isMain: true } }]
              }
            }
          })
          if (medicineServices.length > 0) {
            await tx.invoiceItem.deleteMany({
              where: { 
                invoiceId: invoice.id, 
                serviceId: { in: medicineServices.map(s => s.id) } 
              }
            })
          }

          // Also remove lab service items
          const labServicesToClean = await tx.service.findMany({
            where: {
              OR: [
                { serviceCode: 'LAB-GEN' },
                { serviceName: { contains: 'Laboratorium', mode: 'insensitive' } },
                { serviceName: { contains: 'Pemeriksaan', mode: 'insensitive' } }
              ],
              AND: {
                OR: [{ clinicId: mr.clinicId }, { clinic: { isMain: true } }]
              }
            }
          })
          if (labServicesToClean.length > 0) {
            await tx.invoiceItem.deleteMany({
              where: { 
                invoiceId: invoice.id, 
                serviceId: { in: labServicesToClean.map(s => s.id) } 
              }
            })
          }
          // Also remove existing Doctor Consultation fee to recalculate
          const consultService = await tx.service.findFirst({
            where: {
              OR: [
                { serviceCode: 'CONS-DOC' },
                { serviceName: { contains: 'Konsultasi Dokter', mode: 'insensitive' } }
              ],
              AND: {
                OR: [{ clinicId: mr.clinicId }, { clinic: { isMain: true } }]
              }
            }
          })
          if (consultService) {
            await tx.invoiceItem.deleteMany({
              where: { invoiceId: invoice.id, serviceId: consultService.id }
            })
          }
        }

        let additionalTotal = 0

        // 3.0 Resolve doctorId and clinicId safely to prevent Prisma validation or constraint errors
        let commissionDoctorId = mr.doctorId || (req as any).user?.doctor?.id
        if (!commissionDoctorId && queueId) {
          const q = await tx.queueNumber.findUnique({ where: { id: queueId } })
          commissionDoctorId = q?.doctorId || null
        }

        let finalClinicId = mr.clinicId || (req as any).clinicId
        if (!finalClinicId && queueId) {
          const q = await tx.queueNumber.findUnique({ where: { id: queueId } })
          finalClinicId = q?.clinicId || null
        }

        // 3.1 Record Internal Commission for Doctor (only if doctor and clinic are resolved)
        if (commissionDoctorId && finalClinicId) {
          await tx.doctorCommission.create({
            data: {
              doctorId: commissionDoctorId,
              clinicId: finalClinicId,
              date: new Date(),
              description: `Jasa Konsultasi Dokter - Pasien: ${mr.patient.name} (${visitType})`,
              amount: consultPrice,
              type: 'AUTO_CONSULTATION',
              status: 'unpaid',
              invoiceId: invoice.id,
              sourceId: mr.id
            }
          })
        } else {
          console.warn(`[Warning] Skipping auto-commission creation because doctorId (${commissionDoctorId}) or clinicId (${finalClinicId}) could not be resolved for MedicalRecord ${mr.id}`)
        }

        // 3.2 Add to Invoice as "Jasa Pemeriksaan"
        let consultService = await tx.service.findFirst({
          where: {
            OR: [
              { serviceCode: 'CONS-DOC' },
              { serviceName: { contains: 'Konsultasi Dokter', mode: 'insensitive' } },
              { serviceName: { contains: 'Jasa Pemeriksaan', mode: 'insensitive' } }
            ],
            AND: {
              OR: [{ clinicId: mr.clinicId }, { clinic: { isMain: true } }]
            }
          }
        })

        if (!consultService) {
          consultService = await tx.service.create({
            data: {
              serviceCode: 'CONS-DOC',
              serviceName: 'Jasa Pemeriksaan',
              price: 70000,
              doctorFee: 70000,
              isActive: true,
              clinicId: mr.clinicId
            }
          })
        }

        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            serviceId: consultService.id,
            description: `Jasa Pemeriksaan (${visitType})`,
            quantity: 1,
            price: consultPrice,
            subtotal: consultPrice
          }
        })
        additionalTotal += consultPrice

        // Add Services (non-lab)
        if (services && Array.isArray(services)) {
          for (const s of services) {
            if (s.isLab) continue // Lab handled separately below
            const serviceData = await tx.service.findUnique({ where: { id: s.serviceId } })
            if (serviceData) {
              const itemPrice = parseFloat(s.price) || serviceData.price
              const quantity = parseInt(s.quantity) || 1
              const subtotal = itemPrice * quantity
              await tx.invoiceItem.create({
                data: {
                  invoiceId: invoice.id,
                  serviceId: s.serviceId,
                  description: serviceData.serviceName,
                  quantity: quantity,
                  price: itemPrice,
                  subtotal
                }
              })
              additionalTotal += subtotal
            }
          }
        }

        // 3.1 Pre-fetch/Create generic Lab Service for invoice line item
        const labServices = (services || []).filter((s: any) => s.isLab)
        if (labServices.length > 0) {
          let labService = await tx.service.findFirst({
            where: {
              OR: [
                { serviceCode: 'LAB-GEN' },
                { serviceName: { contains: 'Pemeriksaan Laboratorium', mode: 'insensitive' } }
              ],
              AND: {
                OR: [{ clinicId: mr.clinicId }, { clinic: { isMain: true } }]
              }
            }
          })
          if (!labService) {
            labService = await tx.service.create({
              data: {
                serviceCode: 'LAB-GEN',
                serviceName: 'Pemeriksaan Laboratorium',
                price: 0,
                isActive: true,
                clinicId: mr.clinicId
              }
            })
          }
          // Add each lab test as a separate invoice line
          for (const lab of labServices) {
            const labPrice = parseFloat(lab.price) || 0
            const subtotal = labPrice * 1
            await tx.invoiceItem.create({
              data: {
                invoiceId: invoice.id,
                serviceId: labService.id,
                description: lab.name || lab.serviceName || 'Pemeriksaan Laboratorium',
                quantity: 1,
                price: labPrice,
                subtotal
              }
            })
            additionalTotal += subtotal
          }
        }

        // 3.2 Pre-fetch Service for Medicine (One time only)
        // Consistent lookup: Code first, then Name fallback
        let obatService = await tx.service.findFirst({
          where: { 
            OR: [
              { serviceCode: 'MED-GEN' },
              { serviceName: { contains: 'Obat', mode: 'insensitive' } }
            ],
            AND: {
              OR: [ { clinicId: mr.clinicId }, { clinic: { isMain: true } } ]
            }
          }
        })
        
        if (!obatService) {
          obatService = await tx.service.create({
            data: {
              serviceCode: 'MED-GEN',
              serviceName: 'Obat-obatan',
              price: 0,
              isActive: true,
              clinicId: mr.clinicId
            }
          })
        }

        // Add Medicines
        if (prescriptions && Array.isArray(prescriptions)) {
          for (const p of prescriptions) {
            const isExternal = p.isExternal || 
                               p.instructions?.includes('(Apotek Luar)') || 
                               p.instructions?.includes('[Eksternal]') ||
                               p.instructions?.includes('Apotek Luar') ||
                               p.instructions?.includes('Eksternal');
            if (isExternal) continue;

            if (p.isRacikan) {
              let itemPrice = 0
              if (Array.isArray(p.components)) {
                for (const comp of p.components) {
                  const compProd = await tx.product.findFirst({
                    where: {
                      clinicId: mr.clinicId,
                      masterProduct: { medicineId: comp.medicineId }
                    }
                  })
                  if (compProd) {
                    itemPrice += (compProd.sellingPrice || 0) * (parseFloat(comp.quantity) || 0)
                  }
                }
              }
              
              let tuslah = parseFloat(p.tuslahPrice) || 0
              if (tuslah === 0 && p.formulaId) {
                const formula = await tx.compoundFormula.findUnique({
                  where: { id: p.formulaId },
                  select: { tuslahPrice: true }
                })
                if (formula) {
                  tuslah = formula.tuslahPrice || 0
                }
              }

              const quantity = parseInt(p.quantity) || 0
              const medicineSubtotal = itemPrice * quantity
              
              // 1. Create Invoice Item for the Puyer itself (ONLY raw price, NO tuslah!)
              await tx.invoiceItem.create({
                data: {
                  invoiceId: invoice.id,
                  serviceId: obatService.id,
                  description: `${p.racikanName || 'Obat Racikan'} (${p.dosageForm || 'Racikan'})`,
                  quantity: quantity,
                  price: itemPrice,
                  subtotal: medicineSubtotal
                }
              })
              additionalTotal += medicineSubtotal

              // 2. Create Invoice Item for the Tuslah Fee separately!
              if (tuslah > 0) {
                let tuslahService = await tx.service.findFirst({
                  where: {
                    OR: [
                      { serviceCode: 'TUSLAH-GEN' },
                      { serviceName: { contains: 'Tuslah', mode: 'insensitive' } },
                      { serviceName: { contains: 'Jasa Racik', mode: 'insensitive' } }
                    ],
                    AND: {
                      OR: [ { clinicId: mr.clinicId }, { clinic: { isMain: true } } ]
                    }
                  }
                })

                if (!tuslahService) {
                  tuslahService = await tx.service.create({
                    data: {
                      serviceCode: 'TUSLAH-GEN',
                      serviceName: 'Biaya Racik Obat (Tuslah)',
                      price: 0,
                      isActive: true,
                      clinicId: mr.clinicId
                    }
                  })
                }

                await tx.invoiceItem.create({
                  data: {
                    invoiceId: invoice.id,
                    serviceId: tuslahService.id,
                    description: `Biaya Racik Obat (Tuslah) - ${p.racikanName || 'Obat Racikan'}`,
                    quantity: 1,
                    price: tuslah,
                    subtotal: tuslah
                  }
                })
                additionalTotal += tuslah
              }
            } else {
              const product = await tx.product.findFirst({
                where: {
                  clinicId: mr.clinicId,
                  masterProduct: {
                    medicineId: p.medicineId
                  }
                }
              })

              if (product) {
                const itemPrice = product.sellingPrice || 0
                const quantity = parseInt(p.quantity) || 0
                const subtotal = itemPrice * quantity
                
                await tx.invoiceItem.create({
                  data: {
                    invoiceId: invoice.id,
                    serviceId: obatService.id,
                    description: `${product.productName} (${p.dosage})`,
                    quantity: quantity,
                    price: itemPrice,
                    subtotal
                  }
                })
                additionalTotal += subtotal
              }
            }
          }
        }

        // Recalculate full invoice total from all items (more accurate than increment)
        const allItems = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id } })
        const newSubtotal = allItems.reduce((sum, item) => sum + (item.subtotal || 0), 0)
        
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            subtotal: newSubtotal,
            total: newSubtotal
          }
        })
      }

      // 4. Update Queue Status to 'completed' (Only if Final)
      if (isFinal) {
        await tx.queueNumber.update({
          where: { id: queueId },
          data: { status: 'completed' }
        })
      }

      return mr
    }, {
      maxWait: 10000,
      timeout: 30000,
    })

    // REAL-TIME: Notify clinic listeners of queue changes (saves draft or finalizes)
    const io = req.app.get('io')
    if (io && result.clinicId) {
      io.to(`clinic:${result.clinicId}`).emit('queue-updated', {
        type: 'STATUS_CHANGED',
        queueId: queueId,
        status: isFinal ? 'completed' : 'ongoing'
      })
      console.log(`[Socket] Emit queue-updated (draft/save) to clinic:${result.clinicId}`)
    }

    res.status(200).json(result)
  } catch (e) {
    const error = e as Error
    console.error('Save Doctor Consultation Error:', error)
    res.status(500).json({ message: error.message })
  }
}

/**
 * Get Medical Record by Registration ID (to load draft for Nurse/Doctor)
 */
export const getMedicalRecordByRegistration = async (req: Request, res: Response) => {
    const startedAt = Date.now()
    try {
        const { id } = req.params
        const isAdminView = (req as any).isAdminView
        const user = (req as any).user
        
        console.log(`[DEBUG] Fetching Medical Record for Registration: ${id}`)
        
        const mr = await prisma.medicalRecord.findUnique({
            where: { registrationId: id },
            include: {
                vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
                prescriptions: { include: { items: { include: { medicine: true, components: { include: { medicine: true } } } } } },
                services: { include: { service: true } },
                referrals: { include: { toClinic: true, toDepartment: true } },
                labOrders: { 
                    include: { 
                        results: { 
                            include: { testMaster: true } 
                        } 
                    },
                    orderBy: { orderDate: 'desc' }
                },
                attachments: true,
                patient: true,
                doctor: true
            }
        })
        
        if (!mr) {
            console.warn(`[DEBUG] No Medical Record found for Registration ID: ${id}`)
            return res.json(null)
        }

        // Populate clinic-specific medicine stock for prescription items and components
        if (mr.prescriptions && mr.prescriptions.length > 0) {
            for (const rx of mr.prescriptions) {
                if (rx.items && rx.items.length > 0) {
                    for (const item of rx.items) {
                        if (item.medicineId) {
                            const product = await prisma.product.findFirst({
                                where: {
                                    clinicId: mr.clinicId,
                                    masterProduct: { medicineId: item.medicineId }
                                },
                                select: { quantity: true }
                            })
                            if (item.medicine) {
                                (item.medicine as any).stock = product ? product.quantity : 0
                            }
                        }

                        if (item.isRacikan && item.components && item.components.length > 0) {
                            for (const comp of item.components) {
                                if (comp.medicineId) {
                                    const product = await prisma.product.findFirst({
                                        where: {
                                            clinicId: mr.clinicId,
                                            masterProduct: { medicineId: comp.medicineId }
                                        },
                                        select: { quantity: true }
                                    })
                                    if (comp.medicine) {
                                        (comp.medicine as any).stock = product ? product.quantity : 0
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Access Control: If user is a DOCTOR and NOT in admin view, check if they are the assigned doctor
        if (user.role === 'DOCTOR' && !isAdminView) {
            if (mr.doctorId && mr.doctorId !== user.doctor?.id) {
                return res.status(403).json({ message: 'Akses ditolak: Anda bukan dokter yang ditugaskan untuk rekam medis ini' })
            }
        }
        
        console.log(`[DEBUG] Medical Record found: ${mr.id}, Vitals count: ${mr.vitals?.length || 0}`)
        console.log(`[Perf] getMedicalRecordByRegistration took ${Date.now() - startedAt}ms`)
        res.json(mr)
    } catch (e) {
        res.status(500).json({ message: (e as Error).message })
    }
}
/**
 * Get all Medical Records for a specific patient (Medical History)
 */
export const getMedicalRecordsByPatient = async (req: Request, res: Response) => {
    const startedAt = Date.now()
    try {
        const { id } = req.params // patientId
        
        const history = await prisma.medicalRecord.findMany({
            where: { patientId: id },
            include: {
                vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
                prescriptions: { 
                  include: { 
                    items: { 
                      include: { medicine: true, components: { include: { medicine: true } } } 
                    } 
                  } 
                },
                services: { 
                  include: { service: true } 
                },
                doctor: {
                  select: {
                    id: true,
                    name: true
                  }
                },
                icd10: true
            },
            orderBy: { recordDate: 'desc' }
        })
        
        res.json(history)
        console.log(`[Perf] getMedicalRecordsByPatient took ${Date.now() - startedAt}ms`)
    } catch (e) {
        res.status(500).json({ message: (e as Error).message })
    }
}
