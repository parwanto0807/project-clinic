import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

// ==================== TREATMENT PLAN ====================

/**
 * GET /api/treatment-plans
 * List all treatment plans with filters (patient, status, search)
 */
export const getTreatmentPlans = async (req: Request, res: Response) => {
  try {
    const clinicId = (req as any).clinicId
    const { search, status, patientId, page = '1', limit = '10' } = req.query

    const pageNum = parseInt(page as string) || 1
    const limitNum = parseInt(limit as string) || 10
    const skip = (pageNum - 1) * limitNum

    const where: any = {
      ...(patientId ? { patientId: String(patientId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(search ? {
        OR: [
          { description: { contains: String(search), mode: 'insensitive' } },
          { patient: { name: { contains: String(search), mode: 'insensitive' } } },
          { patient: { medicalRecordNo: { contains: String(search), mode: 'insensitive' } } },
        ]
      } : {}),
      // Filter by clinic through invoice or directly through patient's registrations
      ...(clinicId ? {
        patient: {
          ...(search ? { OR: undefined } : {}), // Don't override patient search
          registrations: { some: { clinicId } }
        }
      } : {})
    }

    // Simplify: just filter by status, search, patientId without complex clinic filter
    const simpleWhere: any = {
      ...(patientId ? { patientId: String(patientId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(search ? {
        OR: [
          { description: { contains: String(search), mode: 'insensitive' } },
          { patient: { name: { contains: String(search), mode: 'insensitive' } } },
          { patient: { medicalRecordNo: { contains: String(search), mode: 'insensitive' } } },
        ]
      } : {}),
    }

    const [total, plans] = await Promise.all([
      prisma.treatmentPlan.count({ where: simpleWhere }),
      prisma.treatmentPlan.findMany({
        where: simpleWhere,
        skip,
        take: limitNum,
        include: {
          patient: {
            select: { id: true, name: true, medicalRecordNo: true, phone: true, gender: true }
          },
          visits: {
            orderBy: { visitNumber: 'asc' }
          },
          invoices: {
            include: {
              items: true,
              payments: { orderBy: { paymentDate: 'desc' } }
            },
            orderBy: { createdAt: 'desc' }
          },
          items: true
        },
        orderBy: { createdAt: 'desc' }
      })
    ])

    res.json({
      data: plans,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    })
  } catch (e) {
    console.error('[getTreatmentPlans] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * GET /api/treatment-plans/:id
 * Get a single treatment plan with full details
 */
export const getTreatmentPlanById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const plan = await prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, name: true, medicalRecordNo: true, phone: true, gender: true, dateOfBirth: true, address: true }
        },
        visits: {
          orderBy: { visitNumber: 'asc' }
        },
        invoices: {
          include: {
            items: {
              include: {
                service: { select: { id: true, serviceCode: true, serviceName: true } }
              }
            },
            payments: { orderBy: { paymentDate: 'desc' } }
          },
          orderBy: { createdAt: 'desc' }
        },
        items: true
      }
    })

    if (!plan) {
      return res.status(404).json({ message: 'Treatment Plan tidak ditemukan' })
    }

    res.json(plan)
  } catch (e) {
    console.error('[getTreatmentPlanById] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * POST /api/treatment-plans
 * Create a new treatment plan with invoice and optional items
 */
export const createTreatmentPlan = async (req: Request, res: Response) => {
  try {
    const { patientId, description, items } = req.body
    const clinicId = (req as any).clinicId

    if (!patientId || !description) {
      return res.status(400).json({ message: 'Patient ID dan deskripsi perawatan wajib diisi' })
    }

    // Validate patient exists
    const patient = await prisma.patient.findUnique({ where: { id: patientId } })
    if (!patient) {
      return res.status(404).json({ message: 'Pasien tidak ditemukan' })
    }

    const { getJakartaDateString } = require('../utils/date')
    const dateStr = getJakartaDateString().replace(/-/g, '')

    const result = await prisma.$transaction(async (tx) => {
      // Hitung totalAmount dari items
      const itemsList = Array.isArray(items) ? items : []
      const totalAmount = itemsList.reduce((sum: number, item: any) => {
        return sum + ((Number(item.quantity) || 1) * (Number(item.price) || 0))
      }, 0)

      // 1. Create Treatment Plan
      const plan = await tx.treatmentPlan.create({
        data: {
          patientId,
          description,
          totalAmount,
          items: {
            create: itemsList.map((item: any) => ({
              description: item.description,
              quantity: Number(item.quantity) || 1,
              price: Number(item.price) || 0,
              subtotal: (Number(item.quantity) || 1) * (Number(item.price) || 0)
            }))
          }
        },
        include: {
          items: true
        }
      })

      return { plan }
    }, { timeout: 15000 })

    res.status(201).json(result)
  } catch (e) {
    console.error('[createTreatmentPlan] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * PUT /api/treatment-plans/:id
 * Update treatment plan (only description allowed)
 */
export const updateTreatmentPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { description } = req.body

    const plan = await prisma.treatmentPlan.findUnique({ where: { id } })
    if (!plan) return res.status(404).json({ message: 'Treatment Plan tidak ditemukan' })

    const updated = await prisma.treatmentPlan.update({
      where: { id },
      data: { description }
    })

    res.json(updated)
  } catch (e) {
    console.error('[updateTreatmentPlan] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * DELETE /api/treatment-plans/:id
 * Delete treatment plan (only if no visits and no payments)
 */
export const deleteTreatmentPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const plan = await prisma.treatmentPlan.findUnique({
      where: { id },
      include: { visits: true, invoices: { include: { payments: true } } }
    })

    if (!plan) return res.status(404).json({ message: 'Treatment Plan tidak ditemukan' })

    if (plan.visits.length > 0) {
      return res.status(400).json({ message: 'Tidak dapat menghapus, karena sudah ada kunjungan' })
    }

    const hasPayments = plan.invoices.some(inv => inv.payments.length > 0)
    if (hasPayments) {
      return res.status(400).json({ message: 'Tidak dapat menghapus, karena sudah ada pembayaran' })
    }

    await prisma.$transaction(async (tx) => {
      for (const inv of plan.invoices) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: inv.id } })
        await tx.invoice.delete({ where: { id: inv.id } })
      }
      await tx.treatmentPlan.delete({ where: { id } })
    })

    res.json({ message: 'Treatment Plan berhasil dihapus' })
  } catch (e) {
    console.error('[deleteTreatmentPlan] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * POST /api/treatment-plans/:id/visits
 * Add a new visit to an existing treatment plan
 */
export const addVisit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { notes, visitDate } = req.body

    const plan = await prisma.treatmentPlan.findUnique({
      where: { id },
      include: { visits: { orderBy: { visitNumber: 'desc' }, take: 1 } }
    })

    if (!plan) {
      return res.status(404).json({ message: 'Treatment Plan tidak ditemukan' })
    }

    if (plan.status === 'COMPLETED') {
      return res.status(400).json({ message: 'Treatment Plan sudah selesai, tidak bisa menambah kunjungan baru' })
    }

    const nextVisitNumber = (plan.visits[0]?.visitNumber || 0) + 1

    const visit = await prisma.visit.create({
      data: {
        treatmentPlanId: id,
        visitNumber: nextVisitNumber,
        visitDate: visitDate ? new Date(visitDate) : new Date(),
        notes: notes || null,
      }
    })

    res.status(201).json(visit)
  } catch (e) {
    console.error('[addVisit] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * POST /api/treatment-plans/:id/invoices
 * Create a new billing invoice (e.g. for DP or a specific termin)
 */
export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { items } = req.body // Array of { description, quantity, price }
    const clinicId = (req as any).clinicId

    const plan = await prisma.treatmentPlan.findUnique({
      where: { id }
    })

    if (!plan) {
      return res.status(404).json({ message: 'Treatment Plan tidak ditemukan' })
    }

    if (!items || !items.length) {
      return res.status(400).json({ message: 'Item tagihan tidak boleh kosong' })
    }

    const { getJakartaDateString } = require('../utils/date')
    const dateStr = getJakartaDateString().replace(/-/g, '')

    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Invoice Number
      let nextInvNum = 1
      const lastInv = await tx.invoice.findFirst({
        where: { invoiceNo: { startsWith: `INV-TP-${dateStr}-` } },
        orderBy: { invoiceNo: 'desc' }
      })
      if (lastInv) {
        const parts = lastInv.invoiceNo.split('-')
        const lastNum = parseInt(parts[parts.length - 1])
        if (!isNaN(lastNum)) nextInvNum = lastNum + 1
      }

      let invoiceNo = ''
      let isUnique = false
      while (!isUnique) {
        invoiceNo = `INV-TP-${dateStr}-${nextInvNum.toString().padStart(4, '0')}`
        const existing = await tx.invoice.findUnique({ where: { invoiceNo } })
        if (!existing) isUnique = true
        else nextInvNum++
      }

      // 2. Format Items and calculate total
      const invoiceItems = items.map((item: any) => ({
        description: item.description || item.itemName,
        quantity: item.quantity || 1,
        price: item.price || 0,
        subtotal: (item.quantity || 1) * (item.price || 0),
        serviceId: item.serviceId || null,
      }))
      const subtotal = invoiceItems.reduce((sum: number, item: any) => sum + item.subtotal, 0)

      // 3. Create the Invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          patientId: plan.patientId,
          clinicId: clinicId || null,
          treatmentPlanId: plan.id,
          invoiceDate: new Date(),
          subtotal,
          total: subtotal,
          status: 'pending',
          items: {
            create: invoiceItems
          }
        },
        include: {
          items: true
        }
      })

      return invoice
    }, { timeout: 15000 })

    res.status(201).json(result)
  } catch (e) {
    console.error('[createInvoice] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * PATCH /api/treatment-plans/:id/status
 * Update treatment plan status manually
 */
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!['ACTIVE', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ message: 'Status harus ACTIVE atau COMPLETED' })
    }

      const plan = await prisma.treatmentPlan.update({
        where: { id },
        data: { status },
        include: {
          patient: { select: { name: true, medicalRecordNo: true } },
          visits: { orderBy: { visitNumber: 'asc' } },
          invoices: { include: { payments: true } }
        }
      })

    res.json(plan)
  } catch (e) {
    console.error('[updateStatus] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}
