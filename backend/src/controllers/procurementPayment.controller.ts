/**
 * ProcurementPayment Controller
 * ==============================
 * Mengelola pembayaran hutang supplier (Hutang Dagang → Kas/Bank)
 * dan pembelian cash langsung (Persediaan → Kas/Bank).
 *
 * Accounting Rules:
 *
 * [A] Bayar Hutang (setelah GRN kredit):
 *     Debit  2-1101 Hutang Dagang (Supplier)
 *     Kredit 1-1101 Kas / 1-1102 Bank
 *
 * [B] Pembelian Cash Langsung (GRN + bayar sekaligus):
 *     Debit  1-1301/1302/1303 Persediaan
 *     Kredit 1-1101 Kas / 1-1102 Bank
 *     (jurnal hutang dari GRN di-reverse otomatis)
 */

import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import path from 'path'
import fs from 'fs'

// ─── Helper: resolve COA ──────────────────────────────────────────────────────

async function resolveCoa(key: string, fallbackCode: string, clinicId: string) {
  const sys = await prisma.systemAccount.findFirst({
    where: { key, OR: [{ clinicId }, { clinicId: null }] },
    include: { coa: true },
    orderBy: { clinicId: 'desc' },
  })
  if (sys?.coa) return sys.coa

  const coa = await prisma.chartOfAccount.findFirst({
    where: { code: fallbackCode, OR: [{ clinicId }, { clinicId: null }] },
  })
  if (!coa) throw new Error(`Akun COA tidak ditemukan: key="${key}", fallback="${fallbackCode}"`)
  return coa
}

// ─── 1. Bayar Hutang Supplier ─────────────────────────────────────────────────

/**
 * POST /api/inventory/procurement/:id/pay
 * Body (multipart/form-data):
 *   amount        : number
 *   paymentMethod : CASH | TRANSFER
 *   bankId?       : string (wajib jika TRANSFER)
 *   referenceNo?  : string (nomor transfer / nomor bon)
 *   notes?        : string
 *   receiptFile?  : file (foto bon / invoice supplier)
 */
export const payProcurement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { amount, paymentMethod, bankId, referenceNo, notes } = req.body
    const userId = (req as any).user?.id || 'SYSTEM'
    const clinicIdCtx = (req as any).clinicId

    // Validasi input
    const payAmount = parseFloat(amount)
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ message: 'Jumlah pembayaran harus lebih dari 0' })
    }
    if (!['CASH', 'TRANSFER'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'paymentMethod harus CASH atau TRANSFER' })
    }
    if (paymentMethod === 'TRANSFER' && !bankId) {
      return res.status(400).json({ message: 'bankId wajib diisi untuk pembayaran TRANSFER' })
    }

    // Path file bon jika ada upload
    const receiptFile = req.file
      ? `/uploads/procurement/${req.file.filename}`
      : null

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch procurement
      const procurement = await tx.procurement.findUnique({
        where: { id },
        include: { items: { include: { product: true } } },
      })
      if (!procurement) throw new Error('Procurement tidak ditemukan')
      if (procurement.status !== 'RECEIVED') {
        throw new Error('Pembayaran hanya bisa dilakukan setelah barang diterima (status: RECEIVED)')
      }
      if (procurement.paymentStatus === 'PAID') {
        throw new Error('Procurement ini sudah LUNAS')
      }

      const clinicId = procurement.branchId || clinicIdCtx
      const remaining = procurement.totalAmount - procurement.paidAmount

      if (payAmount > remaining + 0.01) {
        throw new Error(
          `Kelebihan bayar: jumlah (Rp ${payAmount.toLocaleString('id-ID')}) melebihi sisa hutang (Rp ${remaining.toLocaleString('id-ID')})`
        )
      }

      // 2. Resolve COA
      const apCoa = await resolveCoa('ACCOUNTS_PAYABLE', '2-1101', clinicId)

      let cashBankCoa: any
      if (paymentMethod === 'CASH') {
        cashBankCoa = await resolveCoa('CASH_ACCOUNT', '1-1101', clinicId)
      } else {
        // TRANSFER: pakai COA dari Bank yang dipilih
        const bank = await tx.bank.findUnique({ where: { id: bankId }, include: { coa: true } })
        if (!bank) throw new Error('Bank tidak ditemukan')
        cashBankCoa = bank.coa
      }

      // 3. Generate payment number
      const count = await tx.procurementPayment.count()
      const paymentNo = `PPAY-${Date.now()}-${(count + 1).toString().padStart(3, '0')}`

      // 4. Buat jurnal GL
      // Debit 2-1101 Hutang Dagang / Kredit Kas atau Bank
      const journal = await tx.journalEntry.create({
        data: {
          date: new Date(),
          description: `Pembayaran Hutang Supplier - ${procurement.procurementNo}`,
          referenceNo: paymentNo,
          entryType: 'SYSTEM',
          clinicId,
          details: {
            create: [
              {
                coaId: apCoa.id,
                debit: payAmount,
                credit: 0,
                description: `Pelunasan Hutang - ${procurement.procurementNo}`,
              },
              {
                coaId: cashBankCoa.id,
                debit: 0,
                credit: payAmount,
                description: `${paymentMethod === 'CASH' ? 'Kas Keluar' : 'Transfer Bank'} - ${procurement.procurementNo}`,
              },
            ],
          },
        },
      })

      // 5. Buat record ProcurementPayment
      const payment = await tx.procurementPayment.create({
        data: {
          paymentNo,
          procurementId: id,
          branchId: clinicId,
          amount: payAmount,
          paymentMethod,
          bankId: paymentMethod === 'TRANSFER' ? bankId : null,
          referenceNo: referenceNo || null,
          notes: notes || null,
          receiptFile,
          paidBy: userId,
          journalEntryId: journal.id,
        },
      })

      // 6. Update paidAmount & paymentStatus di Procurement
      const newPaidAmount = procurement.paidAmount + payAmount
      const newPaymentStatus =
        newPaidAmount >= procurement.totalAmount - 0.01 ? 'PAID' : 'PARTIAL'

      await tx.procurement.update({
        where: { id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
          paymentMethod: procurement.paymentMethod || paymentMethod,
        },
      })

      return { payment, journal, newPaymentStatus, newPaidAmount }
    })

    res.status(201).json({
      success: true,
      message: `Pembayaran berhasil. Status: ${result.newPaymentStatus}`,
      paymentNo: result.payment.paymentNo,
      journalEntryId: result.journal.id,
      paidAmount: result.newPaidAmount,
      paymentStatus: result.newPaymentStatus,
      receiptFile: result.payment.receiptFile,
    })
  } catch (err: any) {
    // Hapus file yang sudah terupload jika transaksi gagal
    if (req.file) {
      const filePath = path.join(process.cwd(), 'public/uploads/procurement', req.file.filename)
      fs.unlink(filePath, () => {})
    }
    console.error('[ProcurementPayment] payProcurement error:', err)
    res.status(500).json({ message: err.message })
  }
}

// ─── 2. Pembelian Cash Langsung (GRN + Bayar Sekaligus) ──────────────────────

/**
 * POST /api/inventory/procurement/:id/receive-cash
 * Sama seperti receiveGoods tapi langsung bayar cash.
 * GL: Debit Persediaan / Kredit Kas (tanpa lewat Hutang Dagang)
 *
 * Body (multipart/form-data):
 *   items         : JSON string array [{ itemId, receivedQty, batchNumber, expiryDate }]
 *   grnNo?        : string
 *   bankId?       : string (jika bayar via transfer)
 *   paymentMethod : CASH | TRANSFER
 *   referenceNo?  : string
 *   notes?        : string
 *   receiptFile?  : file
 */
export const receiveCash = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { grnNo, paymentMethod, bankId, referenceNo, notes } = req.body
    const items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items
    const userId = (req as any).user?.id || 'SYSTEM'

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items wajib diisi' })
    }
    if (!['CASH', 'TRANSFER'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'paymentMethod harus CASH atau TRANSFER' })
    }

    const receiptFile = req.file
      ? `/uploads/procurement/${req.file.filename}`
      : null

    // Import syncInventoryToLedger di sini untuk avoid circular
    const { syncInventoryToLedger } = await import('../services/inventoryLedger.service')
    const { InventoryService } = await import('../services/inventory.service')

    const result = await prisma.$transaction(async (tx) => {
      const procurement = await tx.procurement.findUnique({
        where: { id },
        include: { items: { include: { product: true } } },
      })
      if (!procurement) throw new Error('Procurement tidak ditemukan')
      if (!['APPROVED', 'ORDERED'].includes(procurement.status)) {
        throw new Error(`Status harus APPROVED atau ORDERED. Saat ini: ${procurement.status}`)
      }

      const clinicId = procurement.branchId

      // Resolve COA Kas/Bank
      let cashBankCoa: any
      if (paymentMethod === 'CASH') {
        cashBankCoa = await resolveCoa('CASH_ACCOUNT', '1-1101', clinicId)
      } else {
        const bank = await tx.bank.findUnique({ where: { id: bankId }, include: { coa: true } })
        if (!bank) throw new Error('Bank tidak ditemukan')
        cashBankCoa = bank.coa
      }

      const modifiedProductIds: string[] = []
      let totalValue = 0

      for (const receiveItem of items) {
        const originalItem = procurement.items.find((i) => i.id === receiveItem.itemId)
        if (!originalItem) continue

        // Update ProcurementItem
        await tx.procurementItem.update({
          where: { id: receiveItem.itemId },
          data: {
            receivedQty: receiveItem.receivedQty,
            batchNumber: receiveItem.batchNumber,
            expiryDate: new Date(receiveItem.expiryDate),
          },
        })

        // Upsert Batch
        const batch = await tx.inventoryBatch.upsert({
          where: {
            branchId_productId_batchNumber: {
              branchId: clinicId,
              productId: originalItem.productId,
              batchNumber: receiveItem.batchNumber,
            },
          },
          update: {
            currentQty: { increment: receiveItem.receivedQty },
            purchasePrice: originalItem.unitPrice,
          },
          create: {
            branchId: clinicId,
            productId: originalItem.productId,
            batchNumber: receiveItem.batchNumber,
            expiryDate: new Date(receiveItem.expiryDate),
            purchasePrice: originalItem.unitPrice,
            initialQty: receiveItem.receivedQty,
            currentQty: receiveItem.receivedQty,
          },
        })

        // Update Product purchasePrice
        await tx.product.update({
          where: { id: originalItem.productId },
          data: { purchasePrice: originalItem.unitPrice },
        })

        // Upsert Stock
        await tx.inventoryStock.upsert({
          where: {
            branchId_productId_batchId: {
              branchId: clinicId,
              productId: originalItem.productId,
              batchId: batch.id,
            },
          },
          update: { onHandQty: { increment: receiveItem.receivedQty } },
          create: {
            branchId: clinicId,
            productId: originalItem.productId,
            batchId: batch.id,
            onHandQty: receiveItem.receivedQty,
          },
        })

        // Create Mutation IN
        const mutation = await tx.inventoryMutation.create({
          data: {
            branchId: clinicId,
            productId: originalItem.productId,
            batchId: batch.id,
            type: 'IN',
            quantity: receiveItem.receivedQty,
            referenceType: 'PROCUREMENT_CASH',
            referenceId: id,
            notes: `Cash purchase via ${grnNo || procurement.procurementNo}`,
            userId,
          },
        })

        // GL Sync untuk mutasi IN — tapi kita OVERRIDE jurnal-nya
        // Karena cash purchase: Debit Persediaan / Kredit Kas (bukan Hutang)
        // Kita tandai mutation sudah di-handle manual di bawah
        ;(mutation as any)._cashPurchase = true

        modifiedProductIds.push(originalItem.productId)
        totalValue += receiveItem.receivedQty * originalItem.unitPrice
      }

      // Sync product quantities
      const uniqueIds = [...new Set(modifiedProductIds)]
      await InventoryService.syncMultipleProductsQuantity(tx, uniqueIds, clinicId)

      // Buat jurnal GL cash purchase langsung
      // Debit Persediaan / Kredit Kas — tanpa lewat Hutang Dagang
      const count = await tx.procurementPayment.count()
      const paymentNo = `PPAY-${Date.now()}-${(count + 1).toString().padStart(3, '0')}`

      // Resolve inventory COA (pakai INVENTORY_ACCOUNT sebagai default)
      const inventoryCoa = await resolveCoa('INVENTORY_ACCOUNT', '1-1301', clinicId)

      const journal = await tx.journalEntry.create({
        data: {
          date: new Date(),
          description: `Pembelian Tunai - ${procurement.procurementNo}`,
          referenceNo: paymentNo,
          entryType: 'SYSTEM',
          clinicId,
          details: {
            create: [
              {
                coaId: inventoryCoa.id,
                debit: totalValue,
                credit: 0,
                description: `Persediaan Masuk (Cash) - ${procurement.procurementNo}`,
              },
              {
                coaId: cashBankCoa.id,
                debit: 0,
                credit: totalValue,
                description: `${paymentMethod === 'CASH' ? 'Kas Keluar' : 'Transfer Bank'} - ${procurement.procurementNo}`,
              },
            ],
          },
        },
      })

      // Buat ProcurementPayment record
      const payment = await tx.procurementPayment.create({
        data: {
          paymentNo,
          procurementId: id,
          branchId: clinicId,
          amount: totalValue,
          paymentMethod,
          bankId: paymentMethod === 'TRANSFER' ? bankId : null,
          referenceNo: referenceNo || null,
          notes: notes || null,
          receiptFile,
          paidBy: userId,
          journalEntryId: journal.id,
        },
      })

      // Update procurement status
      await tx.procurement.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          paymentStatus: 'PAID',
          paidAmount: totalValue,
          paymentMethod,
        },
      })

      return { payment, journal, totalValue }
    }, { timeout: 120000 })

    res.status(201).json({
      success: true,
      message: 'Penerimaan barang tunai berhasil. Stok dan GL sudah diperbarui.',
      paymentNo: result.payment.paymentNo,
      journalEntryId: result.journal.id,
      totalValue: result.totalValue,
      receiptFile: result.payment.receiptFile,
    })
  } catch (err: any) {
    if (req.file) {
      const filePath = path.join(process.cwd(), 'public/uploads/procurement', req.file.filename)
      fs.unlink(filePath, () => {})
    }
    console.error('[ProcurementPayment] receiveCash error:', err)
    res.status(500).json({ message: err.message })
  }
}

// ─── 3. List Pembayaran per Procurement ──────────────────────────────────────

/**
 * GET /api/inventory/procurement/:id/payments
 */
export const getProcurementPayments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const procurement = await prisma.procurement.findUnique({
      where: { id },
      select: {
        id: true,
        procurementNo: true,
        totalAmount: true,
        paidAmount: true,
        paymentStatus: true,
        paymentMethod: true,
        status: true,
      },
    })
    if (!procurement) return res.status(404).json({ message: 'Procurement tidak ditemukan' })

    const payments = await prisma.procurementPayment.findMany({
      where: { procurementId: id },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: { paidAt: 'asc' },
    })

    res.json({
      procurement,
      payments,
      summary: {
        totalAmount: procurement.totalAmount,
        paidAmount: procurement.paidAmount,
        remainingAmount: procurement.totalAmount - procurement.paidAmount,
        paymentStatus: procurement.paymentStatus,
      },
    })
  } catch (err) {
    res.status(500).json({ message: (err as Error).message })
  }
}

// ─── 4. Hutang Supplier Outstanding (semua yang belum lunas) ─────────────────

/**
 * GET /api/inventory/procurement/outstanding-payables
 * Query: { branchId?, fromDate?, toDate? }
 */
export const getOutstandingPayables = async (req: Request, res: Response) => {
  try {
    const { branchId, fromDate, toDate } = req.query
    const clinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const targetBranchId = branchId ? String(branchId) : (!isAdminView ? clinicId : undefined)

    const where: any = {
      status: 'RECEIVED',
      paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
    }
    if (targetBranchId) where.branchId = targetBranchId
    if (fromDate || toDate) {
      where.createdAt = {}
      if (fromDate) where.createdAt.gte = new Date(String(fromDate))
      if (toDate) where.createdAt.lte = new Date(String(toDate))
    }

    const procurements = await prisma.procurement.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true } },
        items: {
          include: { product: { select: { productName: true } } },
        },
        payments: {
          select: { amount: true, paidAt: true, paymentMethod: true },
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const result = procurements.map((p) => ({
      id: p.id,
      procurementNo: p.procurementNo,
      branch: p.branch,
      totalAmount: p.totalAmount,
      paidAmount: p.paidAmount,
      remainingAmount: p.totalAmount - p.paidAmount,
      paymentStatus: p.paymentStatus,
      dueDate: p.dueDate,
      createdAt: p.createdAt,
      itemCount: p.items.length,
      lastPayment: p.payments[0] || null,
    }))

    const totalOutstanding = result.reduce((s, p) => s + p.remainingAmount, 0)

    res.json({
      data: result,
      summary: {
        count: result.length,
        totalOutstanding,
      },
    })
  } catch (err) {
    res.status(500).json({ message: (err as Error).message })
  }
}
