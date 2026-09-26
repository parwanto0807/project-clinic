import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

export const reconcileCommissions = async (req: Request, res: Response) => {
  try {
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const { dryRun = true } = req.body as { dryRun: boolean }

    const clinics = isAdminView
      ? await prisma.clinic.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } })
      : [{ id: currentClinicId, code: null, name: 'Current Clinic' as const }]

    const results = []

    for (const clinic of clinics) {
      const cid = clinic.id
      const clinicWhere = isAdminView ? {} : { clinicId: currentClinicId }

      const unpaidCommissions = await prisma.doctorCommission.findMany({
        where: { ...clinicWhere, status: 'unpaid' }
      })

      const paidCommissions = await prisma.doctorCommission.findMany({
        where: { ...clinicWhere, status: 'paid' },
        select: { amount: true }
      })

      const totalUnpaid = unpaidCommissions.reduce((s, c) => s + Number(c.amount), 0)
      const totalPaid = paidCommissions.reduce((s, c) => s + Number(c.amount), 0)

      const coaList = await prisma.chartOfAccount.findMany({
        where: { code: { startsWith: '2-1102' }, OR: [{ clinicId: cid }, { clinicId: null }] }
      })
      const coaIds = coaList.map(c => c.id)

      const journalDetails = await prisma.journalDetail.findMany({
        where: { coaId: { in: coaIds } }
      })

      let totalDebit = 0
      let totalCredit = 0
      for (const d of journalDetails) {
        totalDebit += Number(d.debit) || 0
        totalCredit += Number(d.credit) || 0
      }

      const ledgerBalance = totalCredit - totalDebit
      const difference = Math.round((totalUnpaid - ledgerBalance) * 100) / 100
      const isBalanced = Math.abs(difference) < 0.01

      const result: any = {
        clinicId: cid,
        clinicCode: (clinic as any).code,
        clinicName: (clinic as any).name,
        unpaidCommissionCount: unpaidCommissions.length,
        totalUnpaidCommissions: totalUnpaid,
        paidCommissionCount: paidCommissions.length,
        totalPaidCommissions: totalPaid,
        ledgerBalance21102: ledgerBalance,
        totalCredits: totalCredit,
        totalDebits: totalDebit,
        difference,
        isBalanced
      }

      if (!dryRun && !isBalanced && Math.abs(difference) >= 0.01) {
        const adjustmentCoa = await prisma.chartOfAccount.findFirst({
          where: { code: { startsWith: '6-1' }, OR: [{ clinicId: cid }, { clinicId: null }] },
          orderBy: { code: 'asc' }
        })
        const payableCoa = coaList[0]

        if (!payableCoa) {
          result.fixError = 'Akun 2-1102 tidak ditemukan untuk klinik ini'
        } else if (!adjustmentCoa) {
          result.fixError = 'Akun Penyesuaian (6-1xx) tidak ditemukan untuk klinik ini'
        } else {
          if (difference > 0) {
            // Payable is too low: Dr Adjustment, Cr Payable
            await prisma.journalEntry.create({
              data: {
                date: new Date(),
                description: `Rekonsiliasi Komisi - ${(clinic as any).name}: Tambah Hutang Rp ${difference.toLocaleString('id-ID')}`,
                referenceNo: `RECONCILE-${cid}-${Date.now()}`,
                entryType: 'SYSTEM',
                clinicId: cid,
                details: {
                  create: [
                    { coaId: adjustmentCoa.id, debit: difference, credit: 0, description: `Penyesuaian Beban Jasa Medic - Komisi` },
                    { coaId: payableCoa.id, debit: 0, credit: difference, description: `Penyesuaian Hutang Jasa Medik Dokter` }
                  ]
                }
              }
            })
          } else {
            // Payable is too high: Dr Payable, Cr Adjustment
            await prisma.journalEntry.create({
              data: {
                date: new Date(),
                description: `Rekonsiliasi Komisi - ${(clinic as any).name}: Kurangi Hutang Rp ${Math.abs(difference).toLocaleString('id-ID')}`,
                referenceNo: `RECONCILE-${cid}-${Date.now()}`,
                entryType: 'SYSTEM',
                clinicId: cid,
                details: {
                  create: [
                    { coaId: payableCoa.id, debit: Math.abs(difference), credit: 0, description: `Penyesuaian Pengurangan Hutang Jasa Medik` },
                    { coaId: adjustmentCoa.id, debit: 0, credit: Math.abs(difference), description: `Penyesuaian Beban Jasa Medic - Selisih` }
                  ]
                }
              }
            })
          }

          result.fixApplied = true
          result.fixAmount = difference
        }
      }

      results.push(result)
    }

    res.json({
      dryRun,
      generatedAt: new Date().toISOString(),
      results,
      totalClinics: results.length,
      balancedCount: results.filter((r: any) => r.isBalanced).length,
      unbalancedCount: results.filter((r: any) => !r.isBalanced).length
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Gagal melakukan rekonsiliasi' })
  }
}
