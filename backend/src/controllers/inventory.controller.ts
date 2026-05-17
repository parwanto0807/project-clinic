import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { InventoryService } from '../services/inventory.service';
import { syncInventoryToLedger } from '../services/inventoryLedger.service';
import { getPaginationOptions, PaginatedResult } from '../utils/pagination';

/**
 * Get stock list for a specific branch
 */
export const getBranchStocks = async (req: Request, res: Response) => {
  try {
    const { search, productId } = req.query;
    const branchId = req.query.branchId || req.headers['x-clinic-id'];

    if (!branchId) {
      return res.status(400).json({ message: 'branchId is required' });
    }

    // Drill-down logic: If productId is provided, return detailed batch breakdown
    if (productId) {
      const batchStocks = await prisma.inventoryStock.findMany({
        where: {
          branchId: branchId as string,
          productId: productId as string,
          onHandQty: { gt: 0 } // Pro-Tip: GT 0 for efficiency
        },
        include: {
          batch: true,
          product: { select: { productName: true, productCode: true, unit: true } }
        },
        orderBy: { batch: { expiryDate: 'asc' } }
      });
      return res.json(batchStocks);
    }

    const { skip, take, page, limit } = getPaginationOptions(req.query);
    const pageParam = req.query.page;

    // Single-Line View Logic: Query Product table which already has synced 'quantity'
    // This eliminates redundancy while maintaining performance.
    const [total, products] = await Promise.all([
      prisma.product.count({
        where: {
          clinicId: branchId as string,
          quantity: { gt: 0 }, // Pro-Tip: Hide zero stock at DB level
          productName: { contains: search as string, mode: 'insensitive' },
        }
      }),
      prisma.product.findMany({
        where: {
          clinicId: branchId as string,
          quantity: { gt: 0 },
          productName: { contains: search as string, mode: 'insensitive' },
        },
        include: {
          masterProduct: { select: { productCategory: { select: { categoryName: true } } } },
          _count: {
            select: { inventoryStocks: { where: { onHandQty: { gt: 0 } } } }
          },
          inventoryStocks: {
            select: { reservedQty: true }
          }
        },
        orderBy: { productName: 'asc' },
        skip: pageParam ? skip : undefined,
        take: pageParam ? take : undefined,
      })
    ]);

    // Map to a unified response format that the frontend can easily consume
    const aggregatedStocks = (products as any[]).map(p => {
      const reservedQty = p.inventoryStocks?.reduce((sum: number, is: any) => sum + (is.reservedQty || 0), 0) || 0;

      return {
        id: p.id,
        productId: p.id,
        productName: p.productName,
        productCode: p.productCode,
        category: p.masterProduct?.productCategory?.categoryName || 'N/A',
        unit: p.unit,
        onHandQty: p.quantity,
        reservedQty: reservedQty,
        branchId: p.clinicId,
        minStockAlert: p.minimumStock,
        batchCount: p._count?.inventoryStocks || 0,
        // Compatibility structure for existing UI
        product: {
          productName: p.productName,
          productCode: p.productCode,
          isMedicine: (p.masterProduct?.productCategory?.categoryName || '').toLowerCase().includes('obat') || (p.masterProduct?.productCategory?.categoryName || '').toLowerCase().includes('medicine'),
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice
        }
      };
    });

    if (pageParam) {
      const result: PaginatedResult<any> = {
        data: aggregatedStocks,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
      return res.json(result);
    }

    res.json(aggregatedStocks);
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Get all available Products explicitly linked to a branch
 * Useful for Procurement where we need Product.id instead of ProductMaster.id
 */
export const getBranchProducts = async (req: Request, res: Response) => {
  try {
    const { search, lowStock } = req.query;
    const branchId = req.query.branchId || req.headers['x-clinic-id'];
    if (!branchId) return res.status(400).json({ message: 'branchId is required' });

    const products = await prisma.product.findMany({
      where: {
        clinicId: branchId as string,
        OR: search ? [
          { productName: { contains: search as string, mode: 'insensitive' } },
          { productCode: { contains: search as string, mode: 'insensitive' } }
        ] : undefined,
      },
      include: {
        masterProduct: true
      },
      orderBy: { productName: 'asc' },
    });

    if (lowStock === 'true') {
      const filtered = products.filter(p => p.quantity <= p.minimumStock);
      return res.json(filtered);
    }

    res.json(products);
  } catch (error) {
    console.error('Error fetching branch products:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Get mutation history (Stock Card)
 */
export const getStockMutations = async (req: Request, res: Response) => {
  try {
    const { productId, startDate, endDate } = req.query;
    const branchId = req.query.branchId || req.headers['x-clinic-id'];

    if (!branchId) {
      return res.status(400).json({ message: 'branchId is required' });
    }

    const whereClause: any = { branchId: branchId as string };
    if (productId) whereClause.productId = productId as string;

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt.gte = new Date(startDate as string);
      if (endDate) whereClause.createdAt.lte = new Date(endDate as string);
    }

    const { skip, take, page, limit } = getPaginationOptions(req.query);
    const pageParam = req.query.page;

    const [total, mutations] = await Promise.all([
      prisma.inventoryMutation.count({ where: whereClause }),
      prisma.inventoryMutation.findMany({
        where: whereClause,
        include: {
          product: { select: { productName: true, productCode: true } },
          batch: { select: { batchNumber: true, purchasePrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pageParam ? skip : undefined,
        take: pageParam ? take : undefined,
      })
    ]);

    if (pageParam) {
      const result: PaginatedResult<any> = {
        data: mutations,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
      return res.json(result);
    }

    res.json(mutations);
  } catch (error) {
    console.error('Error fetching mutations:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Manual Stock Adjustment
 */
export const adjustStock = async (req: Request, res: Response) => {
  try {
    const { branchId, productId, batchId, quantity, type, reason } = req.body;
    const userId = (req as any).user?.id || 'SYSTEM';

    if (!branchId || !productId || !quantity || !type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validation: No negative stock
    if (type === 'ADJUST_REDUCE') {
      const current = await InventoryService.getAvailableStock(productId, branchId);
      if (current.totalOnHand < quantity) {
        return res.status(400).json({ message: 'Stok tidak mencukupi untuk pengurangan.' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Get Stock Record ID (Prisma findUnique can have issues with null batchId in composite keys)
      const existingStock = await tx.inventoryStock.findFirst({
        where: { branchId, productId, batchId: batchId || null }
      });

      let stock;
      if (existingStock) {
        stock = await tx.inventoryStock.update({
          where: { id: existingStock.id },
          data: {
            onHandQty: type === 'ADJUST_ADD' ? { increment: quantity } : { decrement: quantity },
          },
        });

        // Final safety check after decrement
        if (stock.onHandQty < 0) {
          throw new Error(`Penyesuaian stok gagal: Saldo akhir tidak boleh negatif (${stock.onHandQty})`);
        }
      } else {
        // Create if doesn't exist
        if (type === 'ADJUST_REDUCE') {
          throw new Error('Penyesuaian stok gagal: Record stok tidak ditemukan untuk pengurangan.');
        }

        stock = await tx.inventoryStock.create({
          data: {
            branchId,
            productId,
            batchId: batchId || null,
            onHandQty: quantity,
          }
        });
      }

      // 2. If it's a batch record, update batch as well
      if (batchId) {
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: {
            currentQty: type === 'ADJUST_ADD' ? { increment: quantity } : { decrement: quantity },
          },
        });
      }

      // 3. Create Mutation Record
      const mutation = await tx.inventoryMutation.create({
        data: {
          branchId,
          productId,
          batchId,
          type: 'ADJUSTMENT',
          quantity: type === 'ADJUST_ADD' ? quantity : -quantity,
          referenceType: 'MANUAL_ADJUSTMENT',
          notes: reason,
          userId,
        },
      });

      // 4. Audit Log
      await tx.inventoryAuditLog.create({
        data: {
          branchId,
          userId,
          action: 'UPDATE',
          tableName: 'inventory_stocks',
          recordId: stock.id,
          newData: JSON.stringify({ type, quantity, reason }),
        },
      });

      // 5. Synchronize total quantity
      await InventoryService.syncProductQuantity(tx, productId, branchId);

      return { stock, mutation };
    });

    res.json({ message: 'Stock adjusted successfully', data: result });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Search Products for Stock Opname (from Global Master)
 */
export const getOpnameProducts = async (req: Request, res: Response) => {
  try {
    const { branchId, search } = req.query;
    if (!branchId) return res.status(400).json({ message: 'branchId is required' });

    const products = await prisma.productMaster.findMany({
      where: {
        OR: search ? [
          { masterName: { contains: search as string, mode: 'insensitive' } },
          { masterCode: { contains: search as string, mode: 'insensitive' } }
        ] : undefined,
        isActive: true
      },
      include: {
        products: {
          where: { clinicId: branchId as string },
          include: {
            inventoryStocks: {
              include: { batch: true }
            }
          }
        }
      },
      orderBy: { masterName: 'asc' },
      take: 20
    });

    // Flatten data for frontend: 
    // We want to return a list of "Items" (which could be Batches or just Products)
    const flatResults: any[] = [];

    products.forEach(master => {
      const branchProduct = master.products[0]; // Should be only one for this clinicId

      if (branchProduct && branchProduct.inventoryStocks.length > 0) {
        // Option A: Item already in stock (has batches or no-batch records)
        branchProduct.inventoryStocks.forEach(stock => {
          flatResults.push({
            id: stock.id,
            productId: branchProduct.id,
            masterProductId: master.id,
            productName: master.masterName,
            productCode: master.masterCode,
            sku: branchProduct.sku || master.masterCode,
            batchId: stock.batchId,
            batchNumber: stock.batch?.batchNumber || null,
            onHandQty: stock.onHandQty,
            purchasePrice: stock.batch?.purchasePrice || branchProduct.purchasePrice || master.purchasePrice || 0,
            status: 'IN_STOCK'
          });
        });
      } else {
        // Option B: Registered in branch but no stock records, or not registered in branch at all
        flatResults.push({
          id: null,
          productId: branchProduct?.id || null,
          masterProductId: master.id,
          productName: master.masterName,
          productCode: master.masterCode,
          sku: branchProduct?.sku || master.masterCode,
          batchId: null,
          batchNumber: null,
          onHandQty: 0,
          purchasePrice: branchProduct?.purchasePrice || master.purchasePrice || 0,
          status: branchProduct ? 'IN_CATALOG' : 'GLOBAL_MASTER'
        });
      }
    });

    res.json(flatResults);
  } catch (error) {
    console.error('Error getOpnameProducts:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Create or Fetch Active Stock Opname Session
 */
export const getOrCreateOpnameSession = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query;
    const userId = (req as any).user?.id || 'SYSTEM';

    if (!branchId) return res.status(400).json({ message: 'branchId required' });

    let session = await prisma.stockOpnameSession.findFirst({
      where: { branchId: branchId as string, status: 'DRAFT' },
      include: {
        items: {
          include: {
            product: { select: { productName: true, productCode: true, purchasePrice: true } },
            batch: { select: { batchNumber: true, purchasePrice: true } }
          }
        }
      }
    });

    if (!session) {
      session = await prisma.stockOpnameSession.create({
        data: {
          branchId: branchId as string,
          createdBy: userId,
          status: 'DRAFT'
        },
        include: {
          items: {
            include: {
              product: { select: { productName: true, productCode: true, purchasePrice: true } },
              batch: { select: { batchNumber: true, purchasePrice: true } }
            }
          }
        }
      });
    }

    res.json(session);
  } catch (error) {
    console.error('Error getOrCreateOpnameSession:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Add or Update Item in Opname Session
 */
export const addOrUpdateOpnameItem = async (req: Request, res: Response) => {
  try {
    const { sessionId, productId, batchId, physicalQty, notes, branchId } = req.body;

    if (!sessionId || physicalQty === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 1. Resolve Product for this branch
    let targetProductId = productId;
    const masterProductId = req.body.masterProductId;

    if (!targetProductId && masterProductId) {
      // Find if already exists in branch
      let branchProd = await prisma.product.findFirst({
        where: { masterProductId, clinicId: branchId }
      });

      if (!branchProd) {
        // Create Product for this branch from Master
        const master = await prisma.productMaster.findUnique({ where: { id: masterProductId } });
        if (!master) return res.status(404).json({ message: 'Master Product not found' });

        branchProd = await prisma.product.create({
          data: {
            masterProductId: master.id,
            productCode: master.masterCode,
            sku: master.masterCode, // Default SKU to master code
            productName: master.masterName,
            unit: master.defaultUnit || 'pcs',
            purchaseUnit: master.purchaseUnit || 'box',
            storageUnit: master.storageUnit || 'pcs',
            usedUnit: master.usedUnit || 'pcs',
            quantity: 0,
            minimumStock: master.minStock || 0,
            reorderQuantity: master.reorderPoint || 0,
            purchasePrice: master.purchasePrice || 0,
            sellingPrice: master.sellingPrice || 0,
            clinicId: branchId
          }
        });
      }
      targetProductId = branchProd.id;
    }

    if (!targetProductId) return res.status(400).json({ message: 'productId or masterProductId required' });

    // 2. Get current system stock (Use findFirst to safely handle batchId: null)
    const stock = await prisma.inventoryStock.findFirst({
      where: {
        branchId,
        productId: targetProductId,
        batchId: batchId || null
      }
    });

    const systemQty = stock?.onHandQty || 0;
    const diffQty = physicalQty - systemQty;

    // 3. Resolve price (User provided or database fallback)
    let unitPrice = req.body.unitPrice;

    if (unitPrice === undefined || unitPrice === null) {
      if (batchId) {
        const batch = await prisma.inventoryBatch.findUnique({ where: { id: batchId } });
        unitPrice = batch?.purchasePrice || 0;
      } else {
        const product = await prisma.product.findUnique({ where: { id: targetProductId } });
        unitPrice = product?.purchasePrice || 0;
      }
    }

    const subtotal = physicalQty * unitPrice;

    // 4. Upsert item (Use findFirst + update/create to handle null batchId safely)
    const existingItem = await prisma.stockOpnameItem.findFirst({
      where: {
        sessionId,
        productId: targetProductId,
        batchId: batchId || null
      }
    });

    let item;
    if (existingItem) {
      item = await prisma.stockOpnameItem.update({
        where: { id: existingItem.id },
        data: {
          physicalQty,
          systemQty,
          diffQty,
          unitPrice,
          subtotal,
          notes,
          status: 'DRAFT'
        }
      });
    } else {
      item = await prisma.stockOpnameItem.create({
        data: {
          sessionId,
          productId: targetProductId,
          batchId: batchId || null,
          physicalQty,
          systemQty,
          diffQty,
          unitPrice,
          subtotal,
          notes,
          status: 'DRAFT'
        }
      });
    }

    // 5. Update session total value
    const allItems = await prisma.stockOpnameItem.findMany({ where: { sessionId } });
    const totalValue = allItems.reduce((sum, i) => sum + i.subtotal, 0);
    await prisma.stockOpnameSession.update({
      where: { id: sessionId },
      data: { totalValue }
    });

    res.json(item);
  } catch (error) {
    console.error('Error addOrUpdateOpnameItem:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Remove Item from Session
 */
export const deleteOpnameItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await prisma.stockOpnameItem.delete({ where: { id } });

    // Update session total
    const allItems = await prisma.stockOpnameItem.findMany({ where: { sessionId: item.sessionId } });
    const totalValue = allItems.reduce((sum, i) => sum + i.subtotal, 0);
    await prisma.stockOpnameSession.update({
      where: { id: item.sessionId },
      data: { totalValue }
    });

    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Finalize Opname (Reconciliation)
 */
export const finalizeOpname = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    const userId = (req as any).user?.id || 'SYSTEM';

    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

    const session = await prisma.stockOpnameSession.findUnique({
      where: { id: sessionId },
      include: { items: true }
    });

    if (!session || session.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Session not found or already finalized' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const modifiedProductIds = new Set<string>();

      for (const item of session.items) {
        if (item.diffQty === 0) continue;

        // 1. Update Stock Record (Find first to handle null batchId safely)
        const existingStock = await tx.inventoryStock.findFirst({
          where: {
            branchId: session.branchId,
            productId: item.productId,
            batchId: item.batchId || null,
          }
        });

        if (existingStock) {
          await tx.inventoryStock.update({
            where: { id: existingStock.id },
            data: { onHandQty: item.physicalQty }
          });
        } else {
          await tx.inventoryStock.create({
            data: {
              branchId: session.branchId,
              productId: item.productId,
              batchId: item.batchId || null,
              onHandQty: item.physicalQty,
            }
          });
        }

        // 2. Update Product Price (Global for branch)
        await tx.product.update({
          where: { id: item.productId },
          data: { purchasePrice: item.unitPrice }
        });

        // 3. Update Price and Batch (if applicable)
        if (item.batchId) {
          await tx.inventoryBatch.update({
            where: { id: item.batchId },
            data: {
              currentQty: item.physicalQty,
              purchasePrice: item.unitPrice
            }
          });
        } else {
          // For non-batched items, update branch-specific pricing
          await tx.branchProductPrice.upsert({
            where: {
              branchId_productId: {
                branchId: session.branchId,
                productId: item.productId,
              }
            },
            update: {
              purchasePrice: item.unitPrice
            },
            create: {
              branchId: session.branchId,
              productId: item.productId,
              purchasePrice: item.unitPrice,
              sellingPrice: 0 // Default selling price for new records
            }
          });
        }

        // 3. Create Mutation
        const mutation = await tx.inventoryMutation.create({
          data: {
            branchId: session.branchId,
            productId: item.productId,
            batchId: item.batchId,
            type: 'ADJUSTMENT',
            quantity: item.diffQty,
            referenceType: 'STOCK_OPNAME',
            referenceId: session.id,
            notes: `Stock Opname: ${session.notes || ''}`,
            userId,
          },
        });

        // 4. Sync ke General Ledger (atomic, idempotent)
        // Selisih positif → Debit Persediaan (1-1301/1302/1303), Kredit Laba Ditahan (3-2001)
        // Selisih negatif → Debit HPP (5-1101), Kredit Persediaan (1-1301/1302/1303)
        try {
          await syncInventoryToLedger(mutation.id, { tx, idempotent: true });
        } catch (glErr) {
          // GL sync gagal tidak membatalkan reconciliation stok.
          // Admin bisa re-sync manual via POST /api/inventory-ledger/sync/:mutationId
          console.error(`[StockOpname] GL sync gagal untuk mutasi ${mutation.id}:`, (glErr as Error).message);
        }

        // 5. Mark item as modified for synchronization
        modifiedProductIds.add(item.productId);
      }

      // 5. Synchronize total quantities (Bulk sync)
      await InventoryService.syncMultipleProductsQuantity(tx, Array.from(modifiedProductIds), session.branchId);

      // 6. Mark Session as COMPLETED
      return await tx.stockOpnameSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });
    }, {
      timeout: 60000 // 60 seconds to handle large stock take
    });

    res.json({ message: 'Stock Opname finalized successfully', data: result });
  } catch (error) {
    console.error('Error finalizing opname:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};

/**
 * Bulk Load current branch inventory into Opname Session
 */
export const bulkLoadInventory = async (req: Request, res: Response) => {
  console.log('[InventoryController] bulkLoadInventory hit with:', req.body);
  try {
    const { sessionId, branchId } = req.body;
    if (!sessionId || !branchId) {
      console.warn('[InventoryController] bulkLoadInventory: Missing required fields');
      return res.status(400).json({ message: 'Missing sessionId or branchId' });
    }

    // 0. Verify Session exists
    const session = await prisma.stockOpnameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      console.error(`[InventoryController] bulkLoadInventory: Session ${sessionId} not found`);
      return res.status(404).json({ message: 'Session not found' });
    }

    // 1. Get all products registered to this branch
    const branchProducts = await prisma.product.findMany({
      where: { clinicId: branchId },
      include: {
        inventoryStocks: {
          include: { batch: true }
        }
      }
    });

    console.log(`[InventoryController] bulkLoadInventory: Found ${branchProducts.length} products in branch ${branchId}`);

    // 2. Identify items already in the session to avoid duplicates
    const existingItems = await prisma.stockOpnameItem.findMany({
      where: { sessionId }
    });
    const existingKeys = new Set(existingItems.map(i => `${i.productId}-${i.batchId || 'null'}`));

    // 3. Flatten products and their stocks for opname
    const newItemsData: any[] = [];

    branchProducts.forEach(product => {
      if (product.inventoryStocks.length > 0) {
        // Load existing batches/stocks
        product.inventoryStocks.forEach(s => {
          const key = `${s.productId}-${s.batchId || 'null'}`;
          if (!existingKeys.has(key)) {
            const unitPrice = s.batch?.purchasePrice || product.purchasePrice || 0;
            newItemsData.push({
              sessionId,
              productId: s.productId,
              batchId: s.batchId,
              systemQty: s.onHandQty,
              physicalQty: s.onHandQty,
              diffQty: 0,
              unitPrice,
              subtotal: s.onHandQty * unitPrice,
              status: 'DRAFT'
            });
          }
        });
      } else {
        // Load product even if no stock record exists (0 stock)
        const key = `${product.id}-null`;
        if (!existingKeys.has(key)) {
          newItemsData.push({
            sessionId,
            productId: product.id,
            batchId: null,
            systemQty: 0,
            physicalQty: 0,
            diffQty: 0,
            unitPrice: product.purchasePrice || 0,
            subtotal: 0,
            status: 'DRAFT'
          });
        }
      }
    });

    console.log(`[InventoryController] bulkLoadInventory: Adding ${newItemsData.length} entries to session`);

    if (newItemsData.length > 0) {
      await prisma.stockOpnameItem.createMany({ data: newItemsData });
    }

    // 4. Update session total value
    const allItems = await prisma.stockOpnameItem.findMany({ where: { sessionId } });
    const totalValue = allItems.reduce((sum, i) => sum + i.subtotal, 0);
    const updatedSession = await prisma.stockOpnameSession.update({
      where: { id: sessionId },
      data: { totalValue },
      include: {
        items: {
          include: {
            product: { select: { productName: true, productCode: true, purchasePrice: true } },
            batch: { select: { batchNumber: true, purchasePrice: true } }
          }
        }
      }
    });

    res.json(updatedSession);
  } catch (error) {
    console.error('[InventoryController] bulkLoadInventory Error:', error);
    res.status(500).json({
      message: 'Internal server error during bulk load',
      details: (error as Error).message
    });
  }
};

/**
 * Cancel Opname Session
 */
export const cancelOpname = async (req: Request, res: Response) => {
  try {
    const { sessionId, reason } = req.body;
    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

    const session = await prisma.stockOpnameSession.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        notes: reason ? `CANCELLED: ${reason}` : 'CANCELLED'
      }
    });

    res.json({ message: 'Stock Opname dibatalkan', data: session });
  } catch (error) {
    console.error('Error cancelling opname:', error);
    res.status(500).json({ message: (error as Error).message });
  }
};
