import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { getPaginationOptions, PaginatedResult } from '../utils/pagination'

/**
 * Get all invoices with filtering (Paginated)
 */
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { status, search, startDate, endDate, page: pageParam } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const { skip, take, page, limit } = getPaginationOptions(req.query)

    const where: any = {
      ...(!isAdminView ? { clinicId: currentClinicId } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(search ? {
        OR: [
          { invoiceNo: { contains: String(search), mode: 'insensitive' } },
          { patient: { name: { contains: String(search), mode: 'insensitive' } } },
          { patient: { medicalRecordNo: { contains: String(search), mode: 'insensitive' } } },
        ]
      } : {}),
      ...(startDate || endDate ? {
        invoiceDate: {
          ...(startDate ? { gte: new Date(String(startDate)) } : {}),
          ...(endDate ? { lte: new Date(String(endDate)) } : {}),
        }
      } : {}),
    }

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { id: true, name: true, medicalRecordNo: true, phone: true } },
          registration: {
            include: {
              queueNumbers: {
                select: { status: true, queueDate: true },
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          bank: true,
          items: true,
          payments: true
        },
        orderBy: { createdAt: 'desc' },
        skip: pageParam ? skip : undefined,
        take: pageParam ? take : undefined,
      })
    ])

    if (pageParam) {
      const result: PaginatedResult<any> = {
        data: invoices,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
      return res.json(result)
    }

    res.json(invoices)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Process payment for an invoice
 */
export const processPayment = async (req: Request, res: Response) => {
  try {
    const { invoiceId, amount, paymentMethod, notes, transactionRef, bankId, discount, discountType } = req.body
    const currentClinicIdContext = (req as any).clinicId
    const amountToPay = parseFloat(amount)

    if (!invoiceId || !paymentMethod) {
      return res.status(400).json({ message: 'Data pembayaran tidak lengkap' })
    }

    const discountValue = discount ? parseFloat(discount) : 0

    if (amountToPay <= 0 && discountValue <= 0) {
      return res.status(400).json({ message: 'Jumlah pembayaran atau diskon harus lebih dari 0' })
    }

    // --- ATOMIC TRANSACTION ---
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch Invoice (with payments) inside transaction
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true }
      })

      if (!invoice) throw new Error('Invoice tidak ditemukan')
      if (invoice.status === 'cancelled') throw new Error('Invoice sudah dibatalkan')

      // Guard: block if already fully paid
      if (invoice.status === 'paid') {
        throw new Error('Invoice ini sudah LUNAS. Tidak dapat memproses pembayaran tambahan.')
      }

      // --- NEW: Apply Discount to Invoice ---
      let currentTotal = invoice.total
      let updatedDiscount = invoice.discount || 0
      if (discountValue > 0) {
        updatedDiscount += discountValue
        currentTotal = Math.max(0, invoice.subtotal - updatedDiscount + (invoice.tax || 0))
      }

      // 2. IDEMPOTENCY: prevent double clicks via transactionRef
      if (transactionRef) {
        const existingByRef = await tx.payment.findFirst({
          where: { transactionRef, invoiceId }
        })
        if (existingByRef) return { alreadyProcessed: true, data: existingByRef }
      }

      // 3. Balance Validation — always re-read from DB to prevent race conditions
      const freshPayments = await tx.payment.findMany({ where: { invoiceId } })
      const totalPaidSoFar = freshPayments.reduce((sum, p) => sum + p.amount, 0)
      const remainingBalance = currentTotal - totalPaidSoFar

      if (remainingBalance <= 0) {
        throw new Error('Invoice ini sudah LUNAS berdasarkan riwayat pembayaran.')
      }
      if (amountToPay > remainingBalance + 0.01) {
        throw new Error(`Kelebihan Bayar: Jumlah bayar (Rp ${amountToPay.toLocaleString('id-ID')}) melebihi sisa tagihan (Rp ${remainingBalance.toFixed(0)})`)
      }

      const targetClinicId = invoice.clinicId || currentClinicIdContext
      if (!targetClinicId) throw new Error('Klinik tidak teridentifikasi.')

      // 4. Resolve COA accounts from System Accounts (configured in /master/system-accounts)
      const sysAccountKeys = ['CASH_ACCOUNT', 'BANK_ACCOUNT', 'ACCOUNTS_RECEIVABLE']
      const sysAccounts = await tx.systemAccount.findMany({
        where: { key: { in: sysAccountKeys }, OR: [{ clinicId: targetClinicId }, { clinicId: null }] },
        include: { coa: true },
        orderBy: { clinicId: 'desc' } // clinic-specific takes priority over global
      })
      const getSysAccount = (key: string) => sysAccounts.find(s => s.key === key)

      // Resolve Kas/Bank COA based on payment method
      let debitCoaId: string | undefined
      if (paymentMethod === 'cash') {
        // Cash: check System Accounts, then fallback to automatic clinic-code mapping
        debitCoaId = getSysAccount('CASH_ACCOUNT')?.coaId
        if (!debitCoaId) {
            const clinic = await tx.clinic.findUnique({ where: { id: targetClinicId } })
            if (clinic?.code) {
                const pettyCashCode = `1-1101-${clinic.code}`
                const specificCoa = await tx.chartOfAccount.findFirst({ where: { code: pettyCashCode } })
                debitCoaId = specificCoa?.id
            }
        }
        if (!debitCoaId) {
            debitCoaId = (await tx.chartOfAccount.findFirst({ where: { code: '1-1101' } }))?.id
        }
        if (!debitCoaId) throw new Error('Akun Kas (Petty Cash) tidak ditemukan. Mohon petakan CASH_ACCOUNT di System Accounts atau buat akun 1-1101.')
      } else {
        // Transfer: prefer bank attached to invoice, fallback to BANK_ACCOUNT system account
        const finalBankId = bankId || (invoice as any).bankId
        if (finalBankId) {
          const bank = await tx.bank.findUnique({ where: { id: finalBankId } })
          debitCoaId = bank?.coaId
        }
        if (!debitCoaId) {
          // Fallback: use BANK_ACCOUNT system account
          debitCoaId = getSysAccount('BANK_ACCOUNT')?.coaId
        }
        if (!debitCoaId) throw new Error('Akun Bank belum dikonfigurasi. Pilih bank di invoice atau petakan BANK_ACCOUNT di System Accounts.')
      }

      // Resolve AR (Piutang) COA: prefer ACCOUNTS_RECEIVABLE system account, fallback to code 1-1201
      const arSysAccount = getSysAccount('ACCOUNTS_RECEIVABLE')
      const specificArAccount = arSysAccount
        ? arSysAccount.coa
        : await tx.chartOfAccount.findFirst({
            where: { code: '1-1201', OR: [{ clinicId: targetClinicId }, { clinicId: null }] }
          })
      if (!specificArAccount) throw new Error('Akun Piutang (ACCOUNTS_RECEIVABLE) belum dipetakan di System Accounts.')

      // 5. Create Payment record (only if amount > 0)
      let payment = null
      if (amountToPay > 0) {
        const count = await tx.payment.count()
        const paymentNo = `PAY-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}-${(count + 1).toString().padStart(3, '0')}`

        payment = await tx.payment.create({
          data: {
            paymentNo,
            invoiceId,
            amount: amountToPay,
            paymentMethod,
            transactionRef,
            bankId: paymentMethod === 'transfer' || paymentMethod === 'card' ? bankId : null,
            notes,
            paymentDate: new Date()
          }
        })
      }

      // 6. Create GL Journal — DEFERRED to postInvoice() per centralized posting workflow
      //    Payments no longer affect the GL immediately. Clicking 'Post' will trigger synchronization.

      // 7. Update Invoice totals (re-read from DB for accuracy)
      const allPaymentsAfter = await tx.payment.findMany({ where: { invoiceId } })
      const updatedTotalPaid = allPaymentsAfter.reduce((sum, p) => sum + p.amount, 0)
      const newStatus = updatedTotalPaid >= currentTotal - 0.01 ? 'paid' : 'partial'

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: { 
          amountPaid: updatedTotalPaid, 
          status: newStatus,
          discount: updatedDiscount,
          total: currentTotal
        }
      })

      return { payment, invoice: updatedInvoice }
    }, {
      timeout: 30000
    })

    if ((result as any).alreadyProcessed) return res.json((result as any).data)
    res.status(201).json(result)
  } catch (e: any) {
    res.status(400).json({ message: e.message || 'Gagal memproses pembayaran' })
  }
}

/**
 * Post an invoice to the General Ledger
 */
export const postInvoice = async (req: Request, res: Response) => {
    try {
        const { invoiceId } = req.body
        const currentClinicId = (req as any).clinicId

        if (!invoiceId) return res.status(400).json({ message: 'Invoice ID is required' })

        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch Fresh State
            const invoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                include: { 
                    items: {
                        include: {
                            service: {
                                include: {
                                    coa: true,
                                    serviceCategory: true
                                }
                            }
                        }
                    }, 
                    registration: true,
                    patient: {
                        include: {
                            medicalRecords: {
                                orderBy: { recordDate: 'desc' },
                                take: 1
                            }
                        }
                    },
                    payments: true, 
                    bank: true 
                }
            })

            if (!invoice) throw new Error('Invoice tidak ditemukan')
            
            // 2. VALIDATION: Check if at least one payment exists (User requirement: Pay then Post)
            if (invoice.amountPaid <= 0 && invoice.total > 0) {
                throw new Error('Invoice belum dibayar. Mohon lakukan pembayaran terlebih dahulu sebelum posting ke Buku Besar.')
            }

            const commissionRecords: any[] = []

            const targetClinicId = invoice.clinicId || currentClinicId
            if (!targetClinicId) throw new Error('Klinik tidak teridentifikasi.')

            // 3. Resolve System Accounts & COAs
            const sysAccountKeys = ['CASH_ACCOUNT', 'BANK_ACCOUNT', 'ACCOUNTS_RECEIVABLE', 'SALES_REVENUE', 'SERVICE_REVENUE', 'SALES_DISCOUNT', 'LAB_REVENUE', 'DOCTOR_FEE_PAYABLE', 'DOCTOR_FEE_EXPENSE']
            const sysAccounts = await tx.systemAccount.findMany({
                where: { key: { in: sysAccountKeys }, OR: [{ clinicId: targetClinicId }, { clinicId: null }] },
                include: { coa: true },
                orderBy: { clinicId: 'desc' }
            })

            // Helper to find specific COA by suffix (e.g. 4-1101-K001)
            const resolveSpecificCoa = async (coa: any, clinicId: string) => {
                if (!coa || !clinicId) return coa
                const clinic = await tx.clinic.findUnique({ where: { id: clinicId }, select: { code: true } })
                if (!clinic?.code) return coa

                const baseCode = coa.code.split('-').length > 2 
                    ? coa.code.split('-').slice(0, 2).join('-') 
                    : coa.code
                
                const specificCode = `${baseCode}-${clinic.code}`
                const specificCoa = await tx.chartOfAccount.findFirst({
                    where: { code: specificCode, OR: [{ clinicId }, { clinicId: null }] }
                })
                return specificCoa || coa
            }

            const getSysAcc = async (key: string) => {
                const sys = sysAccounts.find(s => s.key === key)
                if (!sys?.coa) return null
                return await resolveSpecificCoa(sys.coa, targetClinicId)
            }

            const getCoaByCode = async (code: string) => {
                const coa = await tx.chartOfAccount.findFirst({
                    where: { code, OR: [{ clinicId: targetClinicId }, { clinicId: null }] }
                })
                return await resolveSpecificCoa(coa, targetClinicId)
            }

            // --- SECTION A: ACCRUAL JOURNAL (REVENUE) ---
            const existingMainJournal = await tx.journalEntry.findFirst({
                where: { referenceNo: invoice.invoiceNo, entryType: 'SYSTEM' }
            })

            if (!existingMainJournal) {
                const revenueMap = new Map<string, { amount: number; coaName: string }>()
                let totalDoctorFees = 0
                let totalDoctorSubsidies = 0

                for (const item of invoice.items) {
                    // --- PROFESSIONAL MAPPING LOGIC (Tiered) ---
                    const serviceData = item.service as any
                    const sName = (serviceData?.serviceName || '').trim().toLowerCase()
                    const cName = (serviceData?.serviceCategory?.categoryName || '').trim().toLowerCase()
                    
                    let targetCoa: any = null

                    // 1. Priority 1: Direct Service Mapping (Specific override)
                    if (item.service?.coaId) {
                        targetCoa = await resolveSpecificCoa(item.service.coa, targetClinicId)
                    }

                    // 2. Priority 2: System Account Category mapping (Logic-driven)
                    if (!targetCoa) {
                        if (cName.includes('obat') || cName.includes('farmasi') || sName.includes('obat')) {
                            targetCoa = await getSysAcc('SALES_REVENUE') || await getCoaByCode('4-1301')
                        } else if (cName.includes('lab') || sName.includes('lab') || sName.includes('diagnostik')) {
                            targetCoa = await getSysAcc('LAB_REVENUE') || await getCoaByCode('4-1401')
                        } else if (cName.includes('tindakan') || sName.includes('konsul') || sName.includes('admin')) {
                            targetCoa = await getSysAcc('SERVICE_REVENUE')
                        }
                    }

                    // 3. Priority 3: Legacy Keyword Search (Dynamic Fallback)
                    if (!targetCoa) {
                        if (sName.includes('obat')) {
                            targetCoa = await getSysAcc('SALES_REVENUE') || await getCoaByCode('4-1301')
                        } else if (sName.includes('pendaftaran') || sName.includes('admin') || sName.includes('kartu')) {
                            targetCoa = await getCoaByCode('4-1501')
                        } else if (sName.includes('lab') || sName.includes('diagnostik')) {
                            targetCoa = await getSysAcc('LAB_REVENUE') || await getCoaByCode('4-1401')
                        } else if (sName.includes('tindakan')) {
                            targetCoa = await getCoaByCode('4-1201')
                        }
                    }

                    // 4. Ultimate Fallback: Default Service Revenue
                    if (!targetCoa) {
                        targetCoa = await getSysAcc('SERVICE_REVENUE') || await getCoaByCode('4-1101')
                    }

                    if (!targetCoa) throw new Error(`Akun Pendapatan tidak ditemukan untuk item: ${item.description}`)

                    const totalItemSubtotal = item.subtotal || 0
                    
                    // Specific logic: Medicine/Pharmacy items NEVER generate doctor fees/commissions
                    const isPharmacyItem = cName.includes('obat') || cName.includes('farmasi') || sName.includes('obat')
                    const doctorFeePerUnit = isPharmacyItem ? 0 : ((serviceData?.doctorFee as number) || 0)
                    
                    const totalDoctorFee = doctorFeePerUnit * item.quantity

                    const clinicPortion = totalItemSubtotal - totalDoctorFee

                    if (clinicPortion > 0) {
                        const current = revenueMap.get(targetCoa.id) || { amount: 0, coaName: targetCoa.name }
                        revenueMap.set(targetCoa.id, { amount: current.amount + clinicPortion, coaName: current.coaName })
                    } else if (clinicPortion < 0) {
                        // If fee > price, the clinic pays out of pocket (Subsidy/Expense)
                        totalDoctorSubsidies += Math.abs(clinicPortion)
                    }

                    if (totalDoctorFee > 0) {
                        totalDoctorFees += totalDoctorFee
                        
                        // Track for centralized report
                        commissionRecords.push({
                            doctorId: invoice.registration?.doctorId || invoice.patient.medicalRecords[0]?.doctorId, // Fallback
                            clinicId: targetClinicId,
                            invoiceId: invoice.id,
                            description: item.description,
                            amount: totalDoctorFee,
                            type: 'INVOICE',
                            sourceId: item.id,
                            date: invoice.invoiceDate
                        })
                    }
                }

                const arAccount = await getSysAcc('ACCOUNTS_RECEIVABLE') || await getCoaByCode('1-1201')
                if (!arAccount) throw new Error('Akun Piutang (ACCOUNTS_RECEIVABLE) tidak tersedia.')

                const discountAccount = await getSysAcc('SALES_DISCOUNT') || await getCoaByCode('4-1199')

                const doctorPayableAccount = await getSysAcc('DOCTOR_FEE_PAYABLE') || await getCoaByCode('2-1102')

                const doctorExpenseAccount = await getSysAcc('DOCTOR_FEE_EXPENSE') || await getCoaByCode('6-1102')

                await tx.journalEntry.create({
                    data: {
                        date: invoice.invoiceDate,
                        description: `Pengakuan Piutang & Pendapatan - Inv #${invoice.invoiceNo}`,
                        referenceNo: invoice.invoiceNo,
                        entryType: 'SYSTEM',
                        clinicId: targetClinicId,
                        details: {
                            create: [
                                { coaId: arAccount.id, debit: invoice.total, credit: 0, description: `Piutang Pelanggan - Invoice ${invoice.invoiceNo}` },
                                ...(invoice.discount > 0 ? [
                                    { coaId: discountAccount?.id || arAccount.id, debit: invoice.discount, credit: 0, description: `Potongan Harga - Inv ${invoice.invoiceNo}` }
                                ] : []),
                                ...(totalDoctorSubsidies > 0 ? [
                                    { 
                                        coaId: doctorExpenseAccount?.id || '', 
                                        debit: totalDoctorSubsidies, 
                                        credit: 0, 
                                        description: `Beban Subsidi Jasa Medik - Inv ${invoice.invoiceNo}` 
                                    }
                                ] : []),
                                ...Array.from(revenueMap.entries()).map(([coaId, data]) => ({
                                    coaId, debit: 0, credit: data.amount, description: `Pendapatan ${data.coaName} (Net) - Inv ${invoice.invoiceNo}`
                                })),
                                ...(totalDoctorFees > 0 ? [
                                    { 
                                        coaId: doctorPayableAccount?.id || '', 
                                        debit: 0, 
                                        credit: totalDoctorFees, 
                                        description: `Hutang Jasa Medik Dokter - Inv ${invoice.invoiceNo}` 
                                    }
                                ] : [])
                            ].filter(d => d.coaId !== '') // Filter out empty COAs
                        }
                    }
                })
            }

            // --- SECTION B: PAYMENT JOURNALS (CASH/BANK) ---
            const payments = await tx.payment.findMany({ where: { invoiceId } })
            const arAccountForPay = await getSysAcc('ACCOUNTS_RECEIVABLE') || await getCoaByCode('1-1201')
            
            let paymentSyncCount = 0
            for (const pay of payments) {
                const existingPayJournal = await tx.journalEntry.findFirst({
                    where: { referenceNo: pay.paymentNo, entryType: 'SYSTEM' }
                })
                if (existingPayJournal) continue

                // Resolve Bank/Cash Coa for this payment
                let debitCoaId: string | null = null
                const normalizedMethod = (pay.paymentMethod || '').toUpperCase()

                if (normalizedMethod === 'CASH') {
                    const cashAcc = await getSysAcc('CASH_ACCOUNT')
                    
                    // Priority 1: Check System Accounts (CASH_ACCOUNT) for this clinic
                    debitCoaId = cashAcc?.coaId || null
                    
                    // Priority 2: Automatic mapping based on Clinic Code (Petty Cash)
                    if (!debitCoaId) {
                        const clinic = await tx.clinic.findUnique({ where: { id: targetClinicId } })
                        if (clinic?.code) {
                            const pettyCashCode = `1-1101-${clinic.code}`
                            const specificCoa = await tx.chartOfAccount.findFirst({ 
                                where: { code: pettyCashCode } 
                            })
                            debitCoaId = specificCoa?.id || null
                        }
                    }

                    // Priority 3: Fallback to global Petty Cash (1-1101)
                    if (!debitCoaId) {
                        debitCoaId = (await tx.chartOfAccount.findFirst({ 
                            where: { code: '1-1101' } 
                        }))?.id || null
                    }
                } else {
                    const bankAcc = await getSysAcc('BANK_ACCOUNT')
                    // Priority 1: Use bank from the payment itself (NEW: More accurate for individual transfers)
                    // Priority 2: Fallback to bank from invoice bankId
                    // Priority 3: Fallback to System Account
                    const finalBankIdForPay = (pay as any).bankId || (invoice as any).bankId
                    
                    if (finalBankIdForPay) {
                        const bank = await tx.bank.findUnique({ where: { id: finalBankIdForPay } })
                        debitCoaId = bank?.coaId || null
                    }

                    if (!debitCoaId) {
                        debitCoaId = bankAcc?.coaId || (await tx.chartOfAccount.findFirst({ where: { code: '1-1102' } }))?.id || null
                    }
                }

                if (!debitCoaId) throw new Error(`Akun Kas/Bank untuk pembayaran ${pay.paymentNo} tidak ditemukan.`)

                await tx.journalEntry.create({
                    data: {
                        date: pay.paymentDate || new Date(),
                        description: `Pelunasan - Invoice #${invoice.invoiceNo}`,
                        referenceNo: pay.paymentNo,
                        entryType: 'SYSTEM',
                        clinicId: targetClinicId,
                        details: {
                            create: [
                                { coaId: debitCoaId, debit: pay.amount, credit: 0, description: `Penerimaan Pembayaran - Inv ${invoice.invoiceNo}` },
                                { coaId: arAccountForPay!.id, debit: 0, credit: pay.amount, description: `Pengurangan Piutang - Inv ${invoice.invoiceNo}` }
                            ]
                        }
                    }
                })
                paymentSyncCount++
            }

            // 4. FINALIZE: Update invoice isPosted flag
            if (!invoice.isPosted) {
                await tx.invoice.update({ where: { id: invoiceId }, data: { isPosted: true } })
            }

                // 4. Create centralized commission records
                for (const comm of commissionRecords) {
                    if (comm.doctorId) {
                        await (tx as any).doctorCommission.create({ data: comm })
                    }
                }

                return { 
                    success: true, 
                    message: existingMainJournal 
                        ? `Sudah terposting sebelumnya. Berhasil sinkronisasi ${paymentSyncCount} pembayaran baru.` 
                        : `Berhasil memposting invoice dan ${paymentSyncCount} pembayaran ke Buku Besar.`
                }
        }, {
            timeout: 30000
        })

        res.json({ message: 'Invoice berhasil terposting ke Buku Besar', data: result })
    } catch (e: any) {
        res.status(400).json({ message: e.message })
    }
}

/**
 * Get financial summary for dashboard
 */
export const getFinancialSummary = async (req: Request, res: Response) => {
    try {
        const currentClinicId = (req as any).clinicId
        const isAdminView = (req as any).isAdminView

        const today = new Date()
        today.setHours(0,0,0,0)

        console.log('[Finance] getFinancialSummary filters:', { 
          currentClinicId, 
          isAdminView,
          today: today.toISOString()
        })

        const [revenueToday, totalUnpaid] = await Promise.all([
            prisma.payment.aggregate({
                where: {
                    paymentDate: { gte: today },
                    invoice: !isAdminView ? { clinicId: currentClinicId } : {}
                },
                _sum: { amount: true }
            }),
            prisma.invoice.aggregate({
                where: {
                    status: { not: 'paid' },
                    ...(!isAdminView ? { clinicId: currentClinicId } : {})
                },
                _sum: { total: true }
            })
        ])

        console.log('[Finance] Summary raw totals:', {
          revenueToday: revenueToday._sum.amount,
          totalUnpaid: totalUnpaid._sum.total
        })

        res.json({
            todayRevenue: revenueToday._sum.amount || 0,
            pendingRevenue: totalUnpaid._sum.total || 0
        })
    } catch (e) {
        res.status(500).json({ message: (e as Error).message })
    }
}

/**
 * Reset all payments for an invoice (Undo Payment)
 * Only allowed if the invoice hasn't been posted to General Ledger
 */
export const resetInvoicePayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const currentClinicId = (req as any).clinicId

        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch Invoice
            const invoice = await tx.invoice.findUnique({
                where: { id },
                include: { payments: true }
            })

            if (!invoice) throw new Error('Invoice tidak ditemukan')
            
            // 2. SAFETY GUARD: Cannot reset if already posted
            if (invoice.isPosted) {
                throw new Error('Invoice sudah diposting ke Buku Besar. Pembayaran tidak dapat dibatalkan.')
            }

            if (invoice.amountPaid === 0) {
                throw new Error('Invoice memang belum memiliki pembayaran.')
            }

            // 3. Delete all payments associated with this invoice
            await tx.payment.deleteMany({
                where: { invoiceId: id }
            })

            // 4. Reset Invoice status and amountPaid
            const updated = await tx.invoice.update({
                where: { id },
                data: {
                    status: 'unpaid',
                    amountPaid: 0
                }
            })

            return updated
        })

        res.json({ message: 'Pembayaran berhasil direset ke Belum Bayar', data: result })
    } catch (e: any) {
        res.status(400).json({ message: e.message })
    }
}

/**
 * Update Bank Account associated with an invoice (Billing Instructions)
 */
export const updateInvoiceBank = async (req: Request, res: Response) => {
    try {
        const { invoiceId, bankId } = req.body
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId }
        })

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice tidak ditemukan' })
        }

        if (invoice.isPosted) {
            return res.status(400).json({ message: 'Invoice sudah diposting dan tidak dapat diubah.' })
        }

        const updated = await prisma.invoice.update({
            where: { id: invoiceId },
            data: { bankId: bankId || null },
            include: { bank: true, patient: true }
        })

        res.json(updated)
    } catch (e) {
        res.status(500).json({ message: (e as Error).message })
    }
}

/**
 * Get all expenses with filtering
 */
export const getExpenses = async (req: Request, res: Response) => {
  try {
    const { categoryId, search, startDate, endDate, page: pageParam } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const { skip, take, page, limit } = getPaginationOptions(req.query)

    const where: any = {
      ...(!isAdminView ? { clinicId: currentClinicId } : {}),
      ...(categoryId ? { categoryId: String(categoryId) } : {}),
      ...(search ? {
        description: { contains: String(search), mode: 'insensitive' }
      } : {}),
      ...(startDate || endDate ? {
        expenseDate: {
          ...(startDate ? { gte: new Date(String(startDate)) } : {}),
          ...(endDate ? { lte: new Date(String(endDate)) } : {}),
        }
      } : {}),
    }

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: {
          category: { select: { id: true, categoryName: true, coaId: true } as any },
          clinic: { select: { id: true, name: true } }
        },
        orderBy: { expenseDate: 'desc' },
        skip: pageParam ? skip : undefined,
        take: pageParam ? take : undefined,
      })
    ])

    if (pageParam) {
      const result: PaginatedResult<any> = {
        data: expenses,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
      return res.json(result)
    }

    res.json(expenses)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Create a new expense and post to General Ledger
 */
export const createExpense = async (req: Request, res: Response) => {
  try {
    const { 
      expenseDate, categoryId, amount, paymentMethod, 
      description, bankId, notes, attachmentUrl 
    } = req.body
    const currentClinicId = (req as any).clinicId

    // Jika ada file upload, gunakan path file; jika tidak, gunakan attachmentUrl dari body
    const finalAttachmentUrl = req.file
      ? `/uploads/procurement/${req.file.filename}`
      : (attachmentUrl || null)

    if (!categoryId || !amount || !paymentMethod || !expenseDate) {
      return res.status(400).json({ message: 'Data pengeluaran tidak lengkap' })
    }

    // 1. Fetch Category
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId }
    })
    if (!category) return res.status(404).json({ message: 'Kategori pengeluaran tidak ditemukan' })
    
    const debitCoaId = (category as any).coaId
    if (!debitCoaId) {
      return res.status(400).json({ 
        message: `Kategori "${category.categoryName}" belum dihubungkan ke akun biaya di COA. Silakan hubungkan terlebih dahulu di Master Kategori.` 
      })
    }

    // 2. Determine Credit COA (Cash/Bank)
    let creditCoaId: string | undefined
    if (paymentMethod === 'cash') {
      const sysCash = await prisma.systemAccount.findFirst({
        where: { key: 'CASH_ACCOUNT', OR: [{ clinicId: currentClinicId }, { clinicId: null }] }
      })
      creditCoaId = sysCash?.coaId
      if (!creditCoaId) return res.status(400).json({ message: 'Konfigurasi Akun Kas Utama belum diatur.' })
    } else {
      if (!bankId) return res.status(400).json({ message: 'Akun Bank harus dipilih untuk pembayaran non-tunai.' })
      const bank = await prisma.bank.findUnique({ where: { id: bankId } })
      creditCoaId = bank?.coaId
      if (!creditCoaId) return res.status(400).json({ message: 'Akun Bank tujuan belum terhubung ke COA.' })
    }

    // 3. ATOMIC TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      // a. Generate Expense No
      const count = await tx.expense.count()
      const expenseNo = `EXP-${Date.now().toString().slice(-6)}-${(count + 1).toString().padStart(3, '0')}`

      // b. Create Expense Record
      const expense = await tx.expense.create({
        data: {
          expenseNo,
          categoryId,
          // Kompensasi UTC+7: "2026-04-24" → jam 00:00 WIB
          expenseDate: new Date(`${expenseDate}T00:00:00+07:00`),
          amount: parseFloat(amount),
          paymentMethod,
          description,
          notes,
          attachmentUrl: finalAttachmentUrl,
          bankId: paymentMethod !== 'cash' ? bankId : null,
          clinicId: currentClinicId,
          status: 'approved'
        } as any,
        include: { category: true }
      })

      // c. Create Journal Entry
      await tx.journalEntry.create({
        data: {
          date: new Date(`${expenseDate}T00:00:00+07:00`),
          description: `Pengeluaran: ${description || category.categoryName}`,
          referenceNo: expenseNo,
          entryType: 'SYSTEM',
          clinicId: currentClinicId,
          details: {
            create: [
              { coaId: debitCoaId, debit: parseFloat(amount), credit: 0, description: `Biaya ${category.categoryName} - ${expenseNo}` },
              { coaId: creditCoaId!, debit: 0, credit: parseFloat(amount), description: `Pembayaran via ${paymentMethod.toUpperCase()} - ${expenseNo}` }
            ]
          }
        }
      })

      return expense
    }, { timeout: 15000 })

    res.status(201).json(result)
  } catch (e: any) {
    console.error('❌ [Finance] Create Expense Error:', e)
    res.status(500).json({ message: e.message || 'Gagal mencatat pengeluaran' })
  }
}

/**
 * Delete an expense (hanya jika belum ada jurnal yang terkait dengan periode tutup buku)
 */
export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const currentClinicId = (req as any).clinicId

    const expense = await prisma.expense.findUnique({ where: { id } })
    if (!expense) return res.status(404).json({ message: 'Pengeluaran tidak ditemukan' })
    if (expense.clinicId !== currentClinicId) return res.status(403).json({ message: 'Akses ditolak' })

    await prisma.$transaction(async (tx) => {
      // Hapus jurnal GL terkait
      const journal = await tx.journalEntry.findFirst({
        where: { referenceNo: expense.expenseNo, entryType: 'SYSTEM' }
      })
      if (journal) {
        await tx.journalDetail.deleteMany({ where: { journalEntryId: journal.id } })
        await tx.journalEntry.delete({ where: { id: journal.id } })
      }
      // Hapus expense
      await tx.expense.delete({ where: { id } })
    })

    res.json({ message: 'Pengeluaran dan jurnal GL berhasil dihapus' })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

/**
 * Get all cash transfers with filtering (Paginated)
 */
export const getCashTransfers = async (req: Request, res: Response) => {
  try {
    const { status, search, startDate, endDate, page: pageParam } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const { skip, take, page, limit } = getPaginationOptions(req.query)

    const where: any = {
      ...(!isAdminView ? { clinicId: currentClinicId } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(search ? {
        transferNo: { contains: String(search), mode: 'insensitive' }
      } : {}),
      ...(startDate || endDate ? {
        date: {
          ...(startDate ? { gte: new Date(String(startDate)) } : {}),
          ...(endDate ? { lte: new Date(String(endDate)) } : {}),
        }
      } : {}),
    }

    const [total, transfers] = await Promise.all([
      prisma.cashTransfer.count({ where }),
      prisma.cashTransfer.findMany({
        where,
        include: {
          fromCoa: true,
          toCoa: true,
          journalEntry: true
        },
        orderBy: { date: 'desc' },
        skip: pageParam ? skip : undefined,
        take: pageParam ? take : undefined,
      })
    ])

    if (pageParam) {
      return res.json({
        data: transfers,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      })
    }

    res.json(transfers)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Create a new cash transfer (DRAFT)
 */
export const createCashTransfer = async (req: Request, res: Response) => {
  try {
    const { date, fromCoaId, toCoaId, amount, description } = req.body
    const clinicId = req.body.clinicId || (req as any).clinicId

    if (!date || !fromCoaId || !toCoaId || !amount) {
      return res.status(400).json({ message: 'Data transfer tidak lengkap' })
    }

    const count = await prisma.cashTransfer.count()
    const transferNo = `TRF-${Date.now().toString().slice(-6)}-${(count + 1).toString().padStart(3, '0')}`

    const transfer = await prisma.cashTransfer.create({
      data: {
        transferNo,
        date: new Date(`${date}T00:00:00+07:00`),
        fromCoaId,
        toCoaId,
        amount: parseFloat(amount),
        description,
        status: 'DRAFT',
        clinicId
      }
    })

    res.status(201).json(transfer)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Update a cash transfer (only if DRAFT)
 */
export const updateCashTransfer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { date, fromCoaId, toCoaId, amount, description } = req.body

    const existing = await prisma.cashTransfer.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Data tidak ditemukan' })
    if (existing.status === 'POSTED') return res.status(400).json({ message: 'Data sudah diposting dan tidak dapat diubah' })

    const updated = await prisma.cashTransfer.update({
      where: { id },
      data: {
        ...(date ? { date: new Date(`${date}T00:00:00+07:00`) } : {}),
        fromCoaId,
        toCoaId,
        ...(amount ? { amount: parseFloat(amount) } : {}),
        description
      }
    })

    res.json(updated)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Delete a cash transfer (only if DRAFT)
 */
export const deleteCashTransfer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const existing = await prisma.cashTransfer.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Data tidak ditemukan' })
    if (existing.status === 'POSTED') return res.status(400).json({ message: 'Data sudah diposting dan tidak dapat dihapus' })

    await prisma.cashTransfer.delete({ where: { id } })
    res.json({ message: 'Data berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

/**
 * Post cash transfer to General Ledger
 */
export const postCashTransfer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    
    const transfer = await prisma.cashTransfer.findUnique({
      where: { id },
      include: { fromCoa: true, toCoa: true }
    })

    if (!transfer) return res.status(404).json({ message: 'Data tidak ditemukan' })
    if (transfer.status === 'POSTED') return res.status(400).json({ message: 'Data sudah diposting' })

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Journal Entry
      const journal = await tx.journalEntry.create({
        data: {
          date: transfer.date,
          description: `Transfer Antar Kas: ${transfer.description || ''} (${transfer.transferNo})`,
          referenceNo: transfer.transferNo,
          entryType: 'SYSTEM',
          clinicId: transfer.clinicId,
          details: {
            create: [
              {
                coaId: transfer.toCoaId,
                debit: transfer.amount,
                credit: 0,
                description: `Penerimaan Transfer - ${transfer.transferNo}`
              },
              {
                coaId: transfer.fromCoaId,
                debit: 0,
                credit: transfer.amount,
                description: `Pengiriman Transfer - ${transfer.transferNo}`
              }
            ]
          }
        }
      })

      // 2. Update Transfer status and link journal
      return await tx.cashTransfer.update({
        where: { id },
        data: {
          status: 'POSTED',
          journalEntryId: journal.id
        }
      })
    })

    res.json(result)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}
