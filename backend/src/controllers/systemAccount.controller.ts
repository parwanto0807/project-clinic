import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

/**
 * Get all mapped system accounts
 */
export const getSystemAccounts = async (req: Request, res: Response) => {
  try {
    const currentClinicId = (req as any).clinicId
    const accounts = await prisma.systemAccount.findMany({
      where: {
        OR: [
          { clinicId: currentClinicId },
          { clinicId: null }
        ]
      },
      include: {
        coa: true
      }
    })

    // Define the full list of required system accounts in a logical order
    const defaults = [
        { key: 'ACCOUNTS_RECEIVABLE', name: 'Piutang Usaha (AR)' },
        { key: 'SALES_REVENUE', name: 'Pendapatan Penjualan Obat' },
        { key: 'SERVICE_REVENUE', name: 'Pendapatan Jasa Medis' },
        { key: 'LAB_REVENUE', name: 'Pendapatan Laboratorium / Diagnostik' },
        { key: 'SALES_DISCOUNT', name: 'Potongan Penjualan (Diskon)' },
        { key: 'CASH_ACCOUNT', name: 'Kas Utama / Teller' },
        { key: 'BANK_ACCOUNT', name: 'Bank (Transfer/EDC)' },
        { key: 'PETTY_CASH', name: 'Kas Kecil (Petty Cash)' },
        { key: 'INVENTORY_ACCOUNT', name: 'Persediaan Obat & BHP' },
        { key: 'TAX_PAYABLE', name: 'Hutang Pajak (PPN)' },
        { key: 'ACCOUNTS_PAYABLE', name: 'Hutang Usaha (Supplier)' },
        { key: 'COGS', name: 'Harga Pokok Penjualan (HPP)' },
        { key: 'PURCHASE_DISCOUNT', name: 'Potongan Pembelian' },
        { key: 'EXPENSE_SALARY', name: 'Beban Gaji Karyawan' },
        { key: 'EXPENSE_UTILITY', name: 'Beban Listrik/Air/Internet' },
        { key: 'MAINTENANCE_EXPENSE', name: 'Beban Maintenance Alat' },
        { key: 'INTER_BRANCH_CLEARING', name: 'Kliring Antar Cabang' },
        { key: 'ASSET_EQUIPMENT', name: 'Aset Tetap: Peralatan Medis' },
        { key: 'ASSET_INVENTORY', name: 'Aset Tetap: Inventaris & Furnitur' },
        { key: 'ASSET_LAND_BUILDING', name: 'Aset Tetap: Tanah & Bangunan' },
        { key: 'ACCUM_DEP_GENERAL', name: 'Akumulasi Penyusutan (General)' },
        { key: 'RETAINED_EARNINGS', name: 'Laba Ditahan' },
        { key: 'COMPOUND_SERVICE_REVENUE', name: 'Pendapatan Jasa Racik / Tuslah' },
        { key: 'DOCTOR_FEE_PAYABLE', name: 'Hutang Jasa Medik / Doctor Fee' },
        { key: 'DOCTOR_FEE_EXPENSE', name: 'Beban Jasa Medik / Doctor Fee Expense' },
    ]

    // Merge database accounts with defaults to ensure everything is visible
    const mergedResults = defaults.map(def => {
        const existing = accounts.find(a => a.key === def.key)
        if (existing) {
            return {
                ...existing,
                coaId: existing.coaId || ""
            }
        }
        
        return {
            id: `temp-${def.key}`,
            key: def.key,
            name: def.name,
            coaId: "",
            clinicId: currentClinicId,
            coa: null,
            isNew: true
        }
    })

    res.json(mergedResults)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Upsert system account mapping
 */
export const updateSystemAccount = async (req: Request, res: Response) => {
  try {
    const { key, coaId, name } = req.body
    const currentClinicId = (req as any).clinicId

    if (!key || !coaId) {
      return res.status(400).json({ message: 'Key and COA ID are required' })
    }

    // 1. Verify that COA exists to prevent "Record not found" error
    const coa = await prisma.chartOfAccount.findFirst({
      where: { id: coaId }
    })
    if (!coa) {
      return res.status(404).json({ message: `Account COA dengan ID ${coaId} tidak ditemukan.` })
    }

    // 2. Normalize clinicId (Empty string becomes null)
    const targetClinicId = currentClinicId || null

    // 3. Manual Upsert logic within transaction (Postgres 42P10 workaround for Nulls in Unique Constraints)
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.systemAccount.findFirst({
        where: {
          key,
          clinicId: targetClinicId
        }
      })

      if (existing) {
        return await tx.systemAccount.update({
          where: { id: existing.id },
          data: {
            coaId,
            name: name || key
          }
        })
      } else {
        return await tx.systemAccount.create({
          data: {
            key,
            coaId,
            name: name || key,
            clinicId: targetClinicId
          }
        })
      }
    })

    res.json(result)
  } catch (e: any) {
    console.error('❌ [SystemAccount] Update Error:', e)
    res.status(500).json({ 
      message: e.message || 'Gagal memperbarui pemetaan akun sistem',
      error: process.env.NODE_ENV === 'development' ? e : undefined 
    })
  }
}

/**
 * Initialize default system accounts if missing
 */
export const seedSystemAccounts = async (req: Request, res: Response) => {
    try {
        const defaults = [
            { key: 'ACCOUNTS_RECEIVABLE', name: 'Piutang Usaha' },
            { key: 'SALES_REVENUE', name: 'Pendapatan Penjualan' },
            { key: 'SERVICE_REVENUE', name: 'Pendapatan Jasa Medis' },
            { key: 'CASH_ACCOUNT', name: 'Kas Utama' },
            { key: 'BANK_ACCOUNT', name: 'Bank (Transfer/EDC)' },
            { key: 'PETTY_CASH', name: 'Kas Kecil (Petty Cash)' },
            { key: 'TAX_PAYABLE', name: 'Hutang Pajak (PPN)' },
            { key: 'INVENTORY_ACCOUNT', name: 'Persediaan Obat/Alat' },
            { key: 'COGS', name: 'Harga Pokok Penjualan (HPP)' },
            { key: 'ACCOUNTS_PAYABLE', name: 'Hutang Usaha' },
            { key: 'SALES_DISCOUNT', name: 'Potongan / Diskon Penjualan' },
            { key: 'PURCHASE_DISCOUNT', name: 'Potongan / Diskon Pembelian' },
            { key: 'EXPENSE_SALARY', name: 'Beban Gaji Karyawan' },
            { key: 'EXPENSE_UTILITY', name: 'Beban Listrik, Air & Internet' },
            { key: 'MAINTENANCE_EXPENSE', name: 'Beban Maintenance Alat' },
            { key: 'INTER_BRANCH_CLEARING', name: 'Kliring Antar Cabang' },
            { key: 'ASSET_EQUIPMENT', name: 'Aset Tetap: Peralatan Medis' },
            { key: 'ASSET_INVENTORY', name: 'Aset Tetap: Inventaris & Furnitur' },
            { key: 'ASSET_LAND_BUILDING', name: 'Aset Tetap: Tanah & Bangunan' },
            { key: 'ACCUM_DEP_GENERAL', name: 'Akumulasi Penyusutan (General)' },
            { key: 'RETAINED_EARNINGS', name: 'Laba Ditahan' },
            { key: 'COMPOUND_SERVICE_REVENUE', name: 'Pendapatan Jasa Racik / Tuslah' },
            { key: 'DOCTOR_FEE_PAYABLE', name: 'Hutang Jasa Medik / Doctor Fee' },
            { key: 'DOCTOR_FEE_EXPENSE', name: 'Beban Jasa Medik / Doctor Fee Expense' },
            { key: 'LAB_REVENUE', name: 'Pendapatan Laboratorium / Diagnostik' },
        ]

        const results = []
        const currentClinicId = (req as any).clinicId || null

        for (const item of defaults) {
            const existing = await prisma.systemAccount.findFirst({
                where: { key: item.key, clinicId: currentClinicId }
            })

            if (!existing) {
                // Check if we can find a default COA by code (just a guess)
                // For example, if item is MAINTENANCE_EXPENSE, try to find 6-1401
                const fallbackCodes: Record<string, string> = {
                    'MAINTENANCE_EXPENSE': '6-1401',
                    'CASH_ACCOUNT': '1-1101',
                    'SERVICE_REVENUE': '4-1301',
                    'LAB_REVENUE': '4-1401'
                }
                
                let autoCoaId = null
                if (fallbackCodes[item.key]) {
                    const baseCode = fallbackCodes[item.key]
                    const clinic = await prisma.clinic.findUnique({ where: { id: currentClinicId || '' }, select: { code: true } })
                    
                    // Try clinic-specific code first (e.g. 4-1401-K001)
                    if (clinic?.code) {
                        const specificCode = `${baseCode}-${clinic.code}`
                        const specificCoa = await prisma.chartOfAccount.findFirst({
                            where: { code: specificCode, OR: [{ clinicId: currentClinicId }, { clinicId: null }] }
                        })
                        if (specificCoa) autoCoaId = specificCoa.id
                    }

                    // Fallback to generic code (e.g. 4-1401)
                    if (!autoCoaId) {
                        const coa = await prisma.chartOfAccount.findFirst({
                            where: { code: baseCode, OR: [{ clinicId: currentClinicId }, { clinicId: null }] }
                        })
                        if (coa) autoCoaId = coa.id
                    }
                }

                if (autoCoaId) {
                    const created = await prisma.systemAccount.create({
                        data: {
                            key: item.key,
                            name: item.name,
                            clinicId: currentClinicId,
                            coaId: autoCoaId
                        }
                    })
                    results.push({ key: item.key, status: 'created', coaId: autoCoaId })
                } else {
                    results.push({ key: item.key, status: 'skipped', reason: 'COA not found' })
                }
            } else {
                results.push({ key: item.key, status: 'exists' })
            }
        }

        res.json({ message: 'System accounts synchronized.', results })
    } catch (e) {
        res.status(500).json({ message: (e as Error).message })
    }
}
