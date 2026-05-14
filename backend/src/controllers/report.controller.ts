import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { getPaginationOptions, PaginatedResult } from '../utils/pagination'

/**
 * Get Doctor Commission / Fee Report
 * Unified report from automated invoice splitting and manual entries
 */
export const getDoctorFeeReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, doctorId, clinicId, page: pageParam, status } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const { skip, take, page, limit } = getPaginationOptions(req.query)

    const dateWhere: any = {}
    if (startDate) {
      dateWhere.gte = new Date(String(startDate))
      dateWhere.gte.setHours(0, 0, 0, 0)
    }
    if (endDate) {
      dateWhere.lte = new Date(String(endDate))
      dateWhere.lte.setHours(23, 59, 59, 999)
    }

    const where: any = {
      ...(doctorId ? { doctorId: String(doctorId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(clinicId ? { clinicId: String(clinicId) } : (!isAdminView ? { clinicId: currentClinicId } : {})),
      ...(Object.keys(dateWhere).length > 0 ? { date: dateWhere } : {}),
      // Filter out pharmacy/medicine items from the report
      NOT: [
        { description: { contains: 'obat', mode: 'insensitive' } },
        { description: { contains: 'farmasi', mode: 'insensitive' } }
      ]
    }

    const [total, results] = await Promise.all([
      (prisma as any).doctorCommission.count({ where }),
      (prisma as any).doctorCommission.findMany({
        where,
        include: {
          doctor: { select: { name: true } },
          invoice: { 
            include: { 
              patient: { select: { name: true, medicalRecordNo: true } }
            } 
          }
        },
        orderBy: { date: 'desc' },
        skip: pageParam ? skip : undefined,
        take: pageParam ? take : undefined,
      })
    ])

    const reportData = results.map((item: any) => ({
      id: item.id,
      date: item.date,
      invoiceNo: item.invoice?.invoiceNo || 'MANUAL',
      invoiceDate: item.invoice?.invoiceDate,
      patientName: item.invoice?.patient?.name || 'N/A',
      patientMRN: item.invoice?.patient?.medicalRecordNo || 'N/A',
      doctorName: item.doctor.name,
      serviceName: item.description,
      totalPrice: item.type === 'INVOICE' ? (item.amount > 0 ? 'See Invoice' : 0) : '-', 
      doctorFee: item.amount,
      type: item.type,
      status: item.status,
      paidAt: item.paidAt
    }))

    if (pageParam) {
      const result: PaginatedResult<any> = {
        data: reportData,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
      }
      return res.json(result)
    }

    res.json(reportData)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

/**
 * Create Manual Commission (e.g. Uang Duduk)
 * Also creates a Journal Entry
 */
export const createManualCommission = async (req: Request, res: Response) => {
  try {
    const { doctorId, amount, description, date } = req.body
    const clinicId = (req as any).clinicId

    if (!doctorId || !amount) {
      return res.status(400).json({ message: 'Dokter dan Nominal wajib diisi' })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Commission Record
      const commission = await (tx as any).doctorCommission.create({
        data: {
          doctorId,
          clinicId,
          amount: parseFloat(amount),
          description,
          date: date ? new Date(date) : new Date(),
          type: 'MANUAL',
          status: 'unpaid'
        },
        include: { doctor: true }
      })

      // 2. Create Journal Entry (Manual Adjustment)
      const sysAccountKeys = ['DOCTOR_FEE_PAYABLE', 'DOCTOR_FEE_EXPENSE']
      const sysAccounts = await tx.systemAccount.findMany({
        where: { key: { in: sysAccountKeys }, OR: [{ clinicId }, { clinicId: null }] },
        include: { coa: true }
      })

      const getSysAcc = (key: string) => sysAccounts.find(a => a.key === key)
      
      const payableAcc = getSysAcc('DOCTOR_FEE_PAYABLE')?.coa || await tx.chartOfAccount.findFirst({ where: { code: '2-1102' } })
      const expenseAcc = getSysAcc('DOCTOR_FEE_EXPENSE')?.coa || await tx.chartOfAccount.findFirst({ where: { code: '6-1102' } })

      if (!payableAcc || !expenseAcc) {
        throw new Error('Konfigurasi Akun Sistem (Hutang/Beban Jasa Medik) belum lengkap.')
      }

      await tx.journalEntry.create({
        data: {
          date: commission.date,
          description: `Penyesuaian Jasa Medik Manual: ${description} - ${commission.doctor.name}`,
          referenceNo: `ADJ-${commission.id.slice(0,8).toUpperCase()}`,
          entryType: 'SYSTEM',
          clinicId,
          details: {
            create: [
              { coaId: expenseAcc.id, debit: commission.amount, credit: 0, description: `Beban Jasa Manual: ${description}` },
              { coaId: payableAcc.id, debit: 0, credit: commission.amount, description: `Hutang Jasa Manual: ${commission.doctor.name}` }
            ]
          }
        }
      })

      return commission
    })

    res.status(201).json(result)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

/**
 * Pay Commissions (Settlement)
 * Mark as paid and create Journal Entry
 */
export const payCommissions = async (req: Request, res: Response) => {
  try {
    const { commissionIds, coaId, date, notes } = req.body
    const clinicId = (req as any).clinicId

    if (!commissionIds || !commissionIds.length || !coaId) {
      return res.status(400).json({ message: 'Data komisi dan Akun Pembayaran wajib diisi' })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch Commissions
      const commissions = await (tx as any).doctorCommission.findMany({
        where: { id: { in: commissionIds }, status: 'unpaid' },
        include: { doctor: true }
      })

      if (commissions.length === 0) throw new Error('Tidak ada komisi yang valid untuk dibayar.')

      const totalAmount = commissions.reduce((sum: number, c: any) => sum + c.amount, 0)
      const doctorName = commissions[0].doctor.name
      const displayDesc = commissions.length === 1 ? commissions[0].description : `${commissions.length} Layanan`

      // 2. Mark as Paid
      await (tx as any).doctorCommission.updateMany({
        where: { id: { in: commissionIds } },
        data: { status: 'paid', paidAt: date ? new Date(date) : new Date() }
      })

      // 3. Create Journal Entry
      const payableSys = await tx.systemAccount.findFirst({
        where: { key: 'DOCTOR_FEE_PAYABLE', OR: [{ clinicId }, { clinicId: null }] },
        include: { coa: true }
      })
      const payableAcc = payableSys?.coa || await tx.chartOfAccount.findFirst({ where: { code: '2-1102' } })
      
      if (!payableAcc) throw new Error('Akun Hutang Jasa Medik tidak ditemukan.')

      await tx.journalEntry.create({
        data: {
          date: date ? new Date(date) : new Date(),
          description: `Pembayaran Jasa Medik: ${doctorName} (${displayDesc})`,
          referenceNo: `PAY-${Date.now().toString().slice(-6)}`,
          entryType: 'SYSTEM',
          clinicId,
          details: {
            create: [
              { coaId: payableAcc.id, debit: totalAmount, credit: 0, description: `Pelunasan Jasa Medik: ${doctorName}` },
              { coaId: coaId, debit: 0, credit: totalAmount, description: `Pembayaran via Kas/Bank - ${notes || ''}` }
            ]
          }
        }
      })

      return { totalAmount, count: commissions.length }
    })

    res.json({ message: 'Pembayaran jasa medik berhasil diproses', data: result })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}
