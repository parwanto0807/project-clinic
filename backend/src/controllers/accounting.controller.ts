import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { AccountCategory } from '@prisma/client'
import { parseLocalDate } from '../utils/date'

/**
 * Get Trial Balance (Real-time)
 */
export const getTrialBalance = async (req: Request, res: Response) => {
  try {
    const { date, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    
    // If admin and no clinicId provided, show consolidated (null targetClinicId)
    // Otherwise, force currentClinicId or provided clinicId
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)
    
    let targetDate = parseLocalDate(String(date || ''), true)

    const whereAccount: any = {
      accountType: 'DETAIL',
    }
    if (targetClinicId) {
       whereAccount.OR = [{ clinicId: targetClinicId }, { clinicId: null }]
    }

    // 1. Get all detail accounts (to get opening balances)
    const accounts = await prisma.chartOfAccount.findMany({
      where: whereAccount,
      orderBy: { code: 'asc' }
    })

    // 2. Aggregate Journal Details in ONE query using groupBy
    const aggregates = await prisma.journalDetail.groupBy({
      by: ['coaId'],
      where: {
        journalEntry: {
          date: { lte: targetDate },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      _sum: {
        debit: true,
        credit: true
      }
    })

    // Create a map for quick lookup
    const aggregateMap = new Map(aggregates.map(a => [a.coaId, a._sum]))

    // 3. Combine results
    const trialBalance = accounts.map((acc) => {
      const sums = aggregateMap.get(acc.id) || { debit: 0, credit: 0 }
      const totalDebit = sums.debit || 0
      const totalCredit = sums.credit || 0
      
      let debitBalance = 0
      let creditBalance = 0

      const net = totalDebit - totalCredit
      if (acc.category === 'ASSET' || acc.category === 'EXPENSE') {
        const bal = acc.openingBalance + net
        if (bal >= 0) debitBalance = bal
        else creditBalance = Math.abs(bal)
      } else {
        const bal = acc.openingBalance + (totalCredit - totalDebit)
        if (bal >= 0) creditBalance = bal
        else debitBalance = Math.abs(bal)
      }

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        debit: debitBalance,
        credit: creditBalance
      }
    })

    // Filter: hanya tampilkan akun yang punya saldo atau opening balance
    // Akun dengan saldo 0 dan tidak ada transaksi tidak perlu ditampilkan
    // Filter: Tampilkan akun jika punya saldo (tidak nol) 
    // ATAU jika ada pergerakan transaksi (debit/credit movement > 0)
    const activeTrialBalance = trialBalance.filter(
      item => (item.debit > 0 || item.credit > 0) || (aggregateMap.has(item.id))
    )

    res.json(activeTrialBalance)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Get Profit & Loss Report
 */
export const getProfitLoss = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)

    const start = parseLocalDate(String(startDate || ''), false)
    const end = parseLocalDate(String(endDate || ''), true)

    console.log('[ProfitLoss] WIB-corrected UTC Range:', { start: start.toISOString(), end: end.toISOString(), targetClinicId })

    // 1. Get all revenue and expense accounts
    const accounts = await prisma.chartOfAccount.findMany({
      where: {
        accountType: 'DETAIL',
        category: { in: ['REVENUE', 'EXPENSE'] },
        ...(targetClinicId ? {
          OR: [
            { clinicId: targetClinicId },
            { clinicId: null }
          ]
        } : {})
      }
    })

    console.log(`[ProfitLoss] Found ${accounts.length} accounts to check.`)

    // 2. Aggregate in ONE query using groupBy
    const aggregates = await prisma.journalDetail.groupBy({
      by: ['coaId'],
      where: {
        journalEntry: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      _sum: { debit: true, credit: true }
    })

    const aggregateMap = new Map(aggregates.map(a => [a.coaId, a._sum]))

    const reportData = accounts.map((acc) => {
      const sums = aggregateMap.get(acc.id) || { debit: 0, credit: 0 }
      const totalDebit = sums.debit || 0
      const totalCredit = sums.credit || 0
      
      // Profit/Loss ignore opening balance for the period
      const balance = acc.category === 'REVENUE' ? (totalCredit - totalDebit) : (totalDebit - totalCredit)

      return {
        code: acc.code,
        name: acc.name,
        category: acc.category,
        balance
      }
    })

    const revenueItems = reportData.filter(d => d.category === 'REVENUE' && d.balance !== 0)
    const expenseItems = reportData.filter(d => d.category === 'EXPENSE' && d.balance !== 0)

    const totalRevenue = revenueItems.reduce((sum, i) => sum + i.balance, 0)
    const totalExpense = expenseItems.reduce((sum, i) => sum + i.balance, 0)

    res.json({
      period: { start, end },
      revenue: revenueItems,
      totalRevenue,
      expenses: expenseItems,
      totalExpense,
      netProfit: totalRevenue - totalExpense
    })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Get Balance Sheet (Neraca)
 */
export const getBalanceSheet = async (req: Request, res: Response) => {
  try {
    const { date, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)
    
    let targetDate = parseLocalDate(String(date || ''), true)

    // 1. Calculate Profit/Loss up to targetDate (for "Laba Tahun Berjalan")
    const plAccounts = await prisma.chartOfAccount.findMany({
      where: {
        accountType: 'DETAIL',
        category: { in: ['REVENUE', 'EXPENSE'] },
        ...(targetClinicId ? {
          OR: [
            { clinicId: targetClinicId },
            { clinicId: null }
          ]
        } : {})
      }
    })

    const aggregatesPL = await prisma.journalDetail.groupBy({
      by: ['coaId'],
      where: {
        journalEntry: { 
          date: { lte: targetDate }, 
          ...(targetClinicId ? { clinicId: targetClinicId } : {}) 
        }
      },
      _sum: { debit: true, credit: true }
    })

    const aggregatePLMap = new Map(aggregatesPL.map(a => [a.coaId, a._sum]))

    const plResult = plAccounts.map((acc) => {
      const sums = aggregatePLMap.get(acc.id) || { debit: 0, credit: 0 }
      const totalDebit = sums.debit || 0
      const totalCredit = sums.credit || 0

      // Revenue: kredit normal → positif menambah laba
      // Expense: debit normal  → negatif mengurangi laba
      if (acc.category === 'REVENUE') {
        return (totalCredit - totalDebit)   // positif = pendapatan
      } else {
        return -(totalDebit - totalCredit)  // negatif = beban (mengurangi laba)
      }
    })

    const currentYearEarnings = plResult.reduce((sum, val) => sum + val, 0)

    // 2. Get Balance Sheet Accounts (Asset, Liability, Equity)
    const bsAccounts = await prisma.chartOfAccount.findMany({
      where: {
        accountType: 'DETAIL',
        category: { in: ['ASSET', 'LIABILITY', 'EQUITY'] },
        ...(targetClinicId ? { OR: [{ clinicId: targetClinicId }, { clinicId: null }] } : {})
      },
      orderBy: { code: 'asc' }
    })

    const aggregatesBS = await prisma.journalDetail.groupBy({
      by: ['coaId'],
      where: {
        journalEntry: {
          date: { lte: targetDate },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      _sum: { debit: true, credit: true }
    })

    const aggregateBSMap = new Map(aggregatesBS.map(a => [a.coaId, a._sum]))

    const balances = bsAccounts.map((acc) => {
      const sums = aggregateBSMap.get(acc.id) || { debit: 0, credit: 0 }
      const totalDebit = sums.debit || 0
      const totalCredit = sums.credit || 0
      const net = totalDebit - totalCredit
      
      let balance = 0
      if (acc.category === 'ASSET') {
        balance = acc.openingBalance + net
      } else {
        // Liability & Equity normal balance is Credit
        balance = acc.openingBalance + (totalCredit - totalDebit)
      }

      return { code: acc.code, name: acc.name, category: acc.category, balance }
    })

    const assets = balances.filter(b => b.category === 'ASSET')
    const liabilities = balances.filter(b => b.category === 'LIABILITY')
    const equities = balances.filter(b => b.category === 'EQUITY')

    const totalAssets = assets.reduce((sum, i) => sum + i.balance, 0)
    const totalLiabilities = liabilities.reduce((sum, i) => sum + i.balance, 0)
    const totalEquityOnly = equities.reduce((sum, i) => sum + i.balance, 0)

    res.json({
      date: targetDate,
      assets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equity: [
        ...equities,
        { code: '3-9999', name: 'Laba Tahun Berjalan', category: 'EQUITY', balance: currentYearEarnings }
      ],
      currentYearEarnings,
      totalEquity: totalEquityOnly + currentYearEarnings,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquityOnly + currentYearEarnings
    })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Get General Ledger (Rincian per Akun)
 */
export const getGeneralLedger = async (req: Request, res: Response) => {
  try {
    const { coaId, startDate, endDate, clinicId, page, limit } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)

    const start = parseLocalDate(String(startDate || ''), false)
    const end = parseLocalDate(String(endDate || ''), true)

    const l = Number(limit) || 50
    const skip = (Number(page || 1) - 1) * l
    const p = Number(page) || 1

    // --- Mode A: Global Ledger (No specific COA) ---
    // Tampilkan per JournalEntry (bukan per JournalDetail) agar lebih mudah dibaca
    if (!coaId || coaId === '' || coaId === 'all') {
      const totalJournals = await prisma.journalEntry.count({
        where: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      })

      const journals = await prisma.journalEntry.findMany({
        where: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        },
        include: {
          details: {
            include: { coa: { select: { code: true, name: true, category: true } } },
            orderBy: { debit: 'desc' } // Debit entries first within each journal
          }
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], // Terbaru di atas
        skip,
        take: l
      })

      const transactions = journals.map(j => ({
        id: j.id,
        date: j.date,
        description: j.description,
        referenceNo: j.referenceNo,
        entryType: j.entryType,
        totalDebit: j.details.reduce((s, d) => s + d.debit, 0),
        totalCredit: j.details.reduce((s, d) => s + d.credit, 0),
        details: j.details.map(d => ({
          id: d.id,
          coaCode: d.coa.code,
          coaName: d.coa.name,
          coaCategory: d.coa.category,
          debit: d.debit,
          credit: d.credit,
          description: d.description
        }))
      }))

      return res.json({
        account: { code: 'ALL', name: 'Semua Akun', category: 'ALL' },
        period: { start, end },
        initialBalance: 0,
        transactions,
        finalBalance: 0,
        meta: {
          total: totalJournals,
          page: p,
          limit: l,
          totalPages: Math.ceil(totalJournals / l)
        }
      })
    }

    // --- Mode B: Specific Account Ledger ---
    const account = await prisma.chartOfAccount.findUnique({ where: { id: coaId as string } })
    if (!account) return res.status(404).json({ message: 'Account not found' })

    // 1. Saldo awal absolut (sebelum periode dimulai)
    const beforeStartAgg = await prisma.journalDetail.aggregate({
      where: {
        coaId: account.id,
        journalEntry: {
          date: { lt: start },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      _sum: { debit: true, credit: true }
    })
    const prevDebit = beforeStartAgg._sum.debit || 0
    const prevCredit = beforeStartAgg._sum.credit || 0
    let openingBalance = account.openingBalance
    if (account.category === 'ASSET' || account.category === 'EXPENSE') {
      openingBalance += (prevDebit - prevCredit)
    } else {
      openingBalance += (prevCredit - prevDebit)
    }

    // 2. Saldo Akhir Periode (untuk menghitung running balance mundur dari atas)
    const periodAgg = await prisma.journalDetail.aggregate({
      where: {
        coaId: account.id,
        journalEntry: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      _sum: { debit: true, credit: true }
    })
    const periodDebit = periodAgg._sum.debit || 0
    const periodCredit = periodAgg._sum.credit || 0
    let finalBalance = openingBalance
    if (account.category === 'ASSET' || account.category === 'EXPENSE') {
      finalBalance += (periodDebit - periodCredit)
    } else {
      finalBalance += (periodCredit - periodDebit)
    }

    // 3. Total transaksi dalam periode (untuk pagination)
    const totalTransactions = await prisma.journalDetail.count({
      where: {
        coaId: account.id,
        journalEntry: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      }
    })

    // 4. Saldo di baris paling atas halaman ini
    // Kita cari total mutasi dari transaksi yang "lebih baru" dari halaman ini
    const newerTransactions = await prisma.journalDetail.findMany({
      where: {
        coaId: account.id,
        journalEntry: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      orderBy: [
        { journalEntry: { date: 'desc' } },
        { journalEntry: { createdAt: 'desc' } }
      ],
      take: skip,
      select: { debit: true, credit: true }
    })
    const newerDebit = newerTransactions.reduce((sum, d) => sum + d.debit, 0)
    const newerCredit = newerTransactions.reduce((sum, d) => sum + d.credit, 0)

    let pageStartBalance = finalBalance
    if (account.category === 'ASSET' || account.category === 'EXPENSE') {
      pageStartBalance -= (newerDebit - newerCredit)
    } else {
      pageStartBalance -= (newerCredit - newerDebit)
    }

    // 5. Ambil transaksi halaman ini (Urutan DESC: Terbaru di atas)
    const details = await prisma.journalDetail.findMany({
      where: {
        coaId: account.id,
        journalEntry: {
          date: { gte: start, lte: end },
          ...(targetClinicId ? { clinicId: targetClinicId } : {})
        }
      },
      include: { journalEntry: true },
      orderBy: [
        { journalEntry: { date: 'desc' } },
        { journalEntry: { createdAt: 'desc' } }
      ],
      skip,
      take: l
    })

    // 6. Hitung running balance dari atas ke bawah (Mundur)
    let currentBalance = pageStartBalance
    const transactions = details.map(d => {
      const rowBalance = currentBalance
      // Kurangi efek transaksi ini untuk mendapatkan saldo baris berikutnya (yang lebih lama)
      if (account.category === 'ASSET' || account.category === 'EXPENSE') {
        currentBalance -= (d.debit - d.credit)
      } else {
        currentBalance -= (d.credit - d.debit)
      }
      return {
        id: d.id,
        date: d.journalEntry.date,
        description: d.description || d.journalEntry.description,
        referenceNo: d.journalEntry.referenceNo,
        entryType: d.journalEntry.entryType,
        debit: d.debit,
        credit: d.credit,
        balance: rowBalance
      }
    })

    res.json({
      account: { code: account.code, name: account.name, category: account.category },
      period: { start, end },
      initialBalance: openingBalance, // Saldo awal periode
      finalBalance: finalBalance,     // Saldo akhir periode
      transactions,
      meta: {
        total: totalTransactions,
        page: p,
        limit: l,
        totalPages: Math.ceil(totalTransactions / l)
      }
    })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Create Journal Entry (Manual)
 */
export const createJournalEntry = async (req: Request, res: Response) => {
  try {
    const { date, description, referenceNo, details, clinicId } = req.body
    const targetClinicId = clinicId || (req as any).clinicId

    if (!details || !Array.isArray(details) || details.length < 2) {
      return res.status(400).json({ message: 'Jurnal minimal terdiri dari 2 baris (Debet & Kredit)' })
    }

    // Validate balance
    const totalDebit = details.reduce((sum, d) => sum + (Number(d.debit) || 0), 0)
    const totalCredit = details.reduce((sum, d) => sum + (Number(d.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ message: `Jurnal tidak seimbang (D: ${totalDebit}, K: ${totalCredit}). Selisih: ${totalDebit - totalCredit}` })
    }

    const journal = await prisma.journalEntry.create({
      data: {
        date: parseLocalDate(String(date)),
        description,
        referenceNo,
        clinicId: targetClinicId,
        details: {
          create: details.map(d => ({
            coaId: d.coaId,
            debit: Number(d.debit) || 0,
            credit: Number(d.credit) || 0,
            description: d.description
          }))
        }
      },
      include: { details: { include: { coa: true } } }
    })

    res.status(201).json(journal)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Process Year-End Closing (Tutup Buku)
 */
export const postYearEndClosing = async (req: Request, res: Response) => {
    try {
        const { year, clinicId } = req.body
        const currentClinicId = (req as any).clinicId
        const isAdminView = (req as any).isAdminView
        const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)

        if (!year) return res.status(400).json({ message: 'Tahun (Year) wajib diisi' })

        const start = new Date(`${year}-01-01T00:00:00+07:00`)
        const end = new Date(`${year}-12-31T23:59:59+07:00`)

        // 1. Check if already closed
        const existingClosing = await prisma.journalEntry.findFirst({
            where: {
                entryType: 'CLOSING',
                date: { gte: start, lte: end },
                ...(targetClinicId ? { clinicId: targetClinicId } : {})
            }
        })

        if (existingClosing) {
            return res.status(400).json({ message: `Tutup Buku untuk tahun ${year} sudah dilakukan.` })
        }

        // 2. Fetch all Rev/Exp Detail accounts
        const accounts = await prisma.chartOfAccount.findMany({
            where: {
                accountType: 'DETAIL',
                category: { in: ['REVENUE', 'EXPENSE'] },
                OR: [{ clinicId: targetClinicId }, { clinicId: null }]
            }
        })

        // 3. Find Retained Earnings account
        const sysAccount = await prisma.systemAccount.findFirst({
            where: { key: 'RETAINED_EARNINGS', OR: [{ clinicId: targetClinicId }, { clinicId: null }] }
        })
        
        // Fallback to searching by code if not mapped — gunakan 3-2001 (Laba Ditahan)
        const reCoa = sysAccount
            ? await prisma.chartOfAccount.findUnique({ where: { id: sysAccount.coaId } })
            : await prisma.chartOfAccount.findFirst({
                where: { code: '3-2001', OR: [{ clinicId: targetClinicId }, { clinicId: null }] },
                orderBy: { clinicId: 'desc' }
              })

        if (!reCoa) {
            throw new Error('Akun Laba Ditahan (Retained Earnings) tidak ditemukan atau belum dipetakan di System Accounts.')
        }

        // 4. Calculate Net Balances for each account
        const result = await prisma.$transaction(async (tx) => {
            const closingDetails = []
            let totalProfitLoss = 0

            for (const acc of accounts) {
                const aggregates = await tx.journalDetail.aggregate({
                    where: {
                        coaId: acc.id,
                        journalEntry: {
                            date: { gte: start, lte: end },
                            ...(targetClinicId ? { clinicId: targetClinicId } : {})
                        }
                    },
                    _sum: { debit: true, credit: true }
                })

                const debit = aggregates._sum.debit || 0
                const credit = aggregates._sum.credit || 0
                const balance = acc.category === 'REVENUE' ? (credit - debit) : (debit - credit)

                if (balance !== 0) {
                    if (acc.category === 'REVENUE') {
                        // Revenue is Credit, so reverse it with DEBIT
                        closingDetails.push({
                            coaId: acc.id,
                            debit: balance,
                            credit: 0,
                            description: `Penutupan Akun ${acc.name} - Tahun ${year}`
                        })
                        totalProfitLoss += balance
                    } else {
                        // Expense is Debit, so reverse it with CREDIT
                        closingDetails.push({
                            coaId: acc.id,
                            debit: 0,
                            credit: balance,
                            description: `Penutupan Akun ${acc.name} - Tahun ${year}`
                        })
                        totalProfitLoss -= balance
                    }
                }
            }

            if (closingDetails.length === 0) {
                throw new Error('Tidak ada transaksi untuk ditutup pada tahun ini.')
            }

            // 5. Add Retained Earnings entry
            if (totalProfitLoss > 0) {
                // Net Profit -> Credit Equity
                closingDetails.push({
                    coaId: reCoa.id,
                    debit: 0,
                    credit: totalProfitLoss,
                    description: `Pemindahan Laba Bersih Tahun ${year} ke Laba Ditahan`
                })
            } else if (totalProfitLoss < 0) {
                // Net Loss -> Debit Equity
                closingDetails.push({
                    coaId: reCoa.id,
                    debit: Math.abs(totalProfitLoss),
                    credit: 0,
                    description: `Pemindahan Rugi Bersih Tahun ${year} ke Laba Ditahan`
                })
            }

            // 6. Create Closing Journal
            const journal = await tx.journalEntry.create({
                data: {
                    date: end,
                    description: `Tutup Buku Tahunan - Periode ${year}`,
                    referenceNo: `CLOSE-${year}`,
                    entryType: 'CLOSING',
                    clinicId: targetClinicId || currentClinicId,
                    details: {
                        create: closingDetails
                    }
                }
            })

            return journal
        })

        res.status(201).json({ message: 'Tutup Buku berhasil diproses.', data: result })
    } catch (e) {
        res.status(500).json({ message: (e as Error).message })
    }
}
