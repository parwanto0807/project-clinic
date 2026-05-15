import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { syncInventoryToLedger } from '../services/inventoryLedger.service';

// Get all direct purchases
export const getDirectPurchases = async (req: Request, res: Response) => {
  try {
    const clinicId = (req as any).clinicId;
    const purchases = await prisma.directMedicinePurchase.findMany({
      where: { clinicId },
      include: {
        items: {
          include: {
            product: true,
            batch: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      status: 'success',
      data: purchases
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch purchases'
    });
  }
};

// Create a new direct purchase draft
export const createDirectPurchase = async (req: Request, res: Response) => {
  try {
    const clinicId = (req as any).clinicId;
    console.log('[createDirectPurchase] req.body:', req.body);
    const { employeeName, notes, items, discount = 0 } = req.body;

    if (!employeeName || !items || items.length === 0) {
      console.log('[createDirectPurchase] 400 error: Missing fields');
      return res.status(400).json({ status: 'error', message: 'Employee name and items are required' });
    }

    // Calculate total
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
    const totalAmount = Math.max(0, subtotal - discount);
    const purchaseNo = `DP-${Date.now()}`;

    const purchase = await prisma.directMedicinePurchase.create({
      data: {
        purchaseNo,
        employeeName,
        notes,
        totalAmount,
        discount,
        clinicId,
        status: 'DRAFT',
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            batchId: item.batchId || null
          }))
        }
      },
      include: { items: true }
    });

    res.status(201).json({
      status: 'success',
      data: purchase,
      message: 'Draft purchase created successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create purchase'
    });
  }
};

// Update an existing draft
export const updateDirectPurchase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const clinicId = (req as any).clinicId;
    const { employeeName, notes, items, discount = 0 } = req.body;

    if (!employeeName || !items || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Employee name and items are required' });
    }

    const existing = await prisma.directMedicinePurchase.findFirst({
      where: { id, clinicId }
    });

    if (!existing) return res.status(404).json({ status: 'error', message: 'Purchase not found' });
    if (existing.status !== 'DRAFT') return res.status(400).json({ status: 'error', message: 'Only draft purchases can be edited' });

    const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
    const totalAmount = Math.max(0, subtotal - discount);

    const purchase = await prisma.$transaction(async (tx) => {
      await tx.directMedicinePurchaseItem.deleteMany({ where: { directMedicinePurchaseId: id } });
      
      return tx.directMedicinePurchase.update({
        where: { id },
        data: {
          employeeName,
          notes,
          totalAmount,
          discount,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.quantity * item.unitPrice,
              batchId: item.batchId || null
            }))
          }
        },
        include: { items: true }
      });
    });

    res.json({
      status: 'success',
      data: purchase,
      message: 'Purchase updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to update purchase' });
  }
};

// Post a direct purchase (reduce stock)
export const postDirectPurchase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const clinicId = (req as any).clinicId;
    const userId = (req as any).user?.id || 'system';

    const purchase = await prisma.directMedicinePurchase.findFirst({
      where: { id, clinicId },
      include: { items: true }
    });

    if (!purchase) {
      return res.status(404).json({ status: 'error', message: 'Purchase not found' });
    }

    if (purchase.status === 'POSTED') {
      return res.status(400).json({ status: 'error', message: 'Purchase is already posted' });
    }

    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { code: true } });

    // Start transaction to reduce stock and update status
    await prisma.$transaction(async (tx) => {
      // 1. Resolve Accounts for Revenue Journal
      const sysAccountKeys = ['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE', 'SALES_DISCOUNT'];
      const sysAccounts = await tx.systemAccount.findMany({
        where: { key: { in: sysAccountKeys }, OR: [{ clinicId }, { clinicId: null }] },
        include: { coa: true },
        orderBy: { clinicId: 'desc' }
      });
      
      const resolveSpecificCoa = async (key: string, fallbackCode: string) => {
        const sys = sysAccounts.find(s => s.key === key);
        let coa = sys?.coa;
        
        if (!coa) {
          coa = await tx.chartOfAccount.findFirst({
            where: { code: fallbackCode, OR: [{ clinicId }, { clinicId: null }] }
          });
        }

        if (!coa) return null;

        // Apply clinic-specific suffix if exists (e.g. 4-1301-K001)
        if (clinic?.code) {
          const baseCode = coa.code.split('-').length > 2 
            ? coa.code.split('-').slice(0, 2).join('-') 
            : coa.code;
          const specificCode = `${baseCode}-${clinic.code}`;
          const specificCoa = await tx.chartOfAccount.findFirst({
            where: { code: specificCode, OR: [{ clinicId }, { clinicId: null }] }
          });
          return specificCoa || coa;
        }
        return coa;
      };

      const arAccount = await resolveSpecificCoa('ACCOUNTS_RECEIVABLE', '1-1201');
      const salesAccount = await resolveSpecificCoa('SALES_REVENUE', '4-1301');
      const discountAccount = await resolveSpecificCoa('SALES_DISCOUNT', '4-1199');

      if (!arAccount || !salesAccount) {
        throw new Error('Gagal memproses jurnal: Akun Piutang atau Pendapatan tidak ditemukan. Mohon periksa konfigurasi System Accounts.');
      }

      for (const item of purchase.items) {
        // Decrease stock
        const stock = await tx.inventoryStock.findFirst({
          where: { branchId: clinicId, productId: item.productId, batchId: item.batchId || undefined }
        });

        if (!stock || stock.onHandQty < item.quantity) {
          throw new Error(`Insufficient stock for product ID: ${item.productId}`);
        }

        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: {
            onHandQty: { decrement: item.quantity }
          }
        });

        // Also decrease from InventoryBatch if applicable
        if (item.batchId) {
           await tx.inventoryBatch.update({
             where: { id: item.batchId },
             data: { currentQty: { decrement: item.quantity } }
           });
        }

        // Add mutation log
        const mutation = await tx.inventoryMutation.create({
          data: {
            branchId: clinicId,
            productId: item.productId,
            batchId: item.batchId,
            type: 'OUT',
            quantity: item.quantity,
            referenceType: 'DIRECT_PURCHASE',
            referenceId: purchase.id,
            notes: `Direct purchase by ${purchase.employeeName}`,
            userId: userId || 'system'
          }
        });

        // Sync to General Ledger (COGS & Inventory)
        try {
          await syncInventoryToLedger(mutation.id, { tx: tx as any });
        } catch (err: any) {
          console.error(`[postDirectPurchase] GL Sync Failed for mutation ${mutation.id}:`, err.message);
        }
      }

      // 2. Create Revenue Journal Entry
      const description = `Penjualan Obat Karyawan - ${purchase.purchaseNo} (${purchase.employeeName})`;
      const grossAmount = purchase.totalAmount + (purchase.discount || 0);

      await tx.journalEntry.create({
        data: {
          date: purchase.purchaseDate,
          description,
          referenceNo: purchase.purchaseNo,
          entryType: 'SYSTEM',
          clinicId,
          details: {
            create: [
              // Debit: Piutang (Net Amount)
              {
                coaId: arAccount.id,
                debit: purchase.totalAmount,
                credit: 0,
                description: `${description} - Piutang`
              },
              // Debit: Diskon (Jika ada)
              ...(purchase.discount > 0 ? [{
                coaId: discountAccount?.id || salesAccount.id, // Fallback to sales if discount account missing (not ideal but safe)
                debit: purchase.discount,
                credit: 0,
                description: `${description} - Potongan Harga`
              }] : []),
              // Credit: Pendapatan (Gross Amount)
              {
                coaId: salesAccount.id,
                debit: 0,
                credit: grossAmount,
                description: `${description} - Pendapatan`
              }
            ]
          }
        }
      });

      // Update purchase status
      await tx.directMedicinePurchase.update({
        where: { id: purchase.id },
        data: { status: 'POSTED' }
      });
    }, {
      timeout: 30000
    });

    res.json({
      status: 'success',
      message: 'Purchase posted, stock updated, and GL journals created successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to post purchase'
    });
  }
};
