import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { InventoryService } from '../services/inventory.service';
import { syncInventoryToLedger, syncAllInventoryToLedger, syncOpeningBalances } from '../services/inventoryLedger.service';
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
          clinic: { select: { name: true } },
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
        branchName: p.clinic?.name || 'N/A',
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

    // Calculate total asset value across ALL pages for the current search accurately using batch prices
    const allMatchingStocks = await prisma.inventoryStock.findMany({
      where: {
        branchId: branchId as string,
        onHandQty: { gt: 0 },
        product: {
          productName: { contains: search as string, mode: 'insensitive' }
        }
      },
      select: { 
        onHandQty: true, 
        unitCost: true,
        product: {
          select: { purchasePrice: true }
        }
      }
    });
    const totalAssetValue = allMatchingStocks.reduce((sum, s) => {
      return sum + (s.onHandQty * (s.unitCost ?? s.product?.purchasePrice ?? 0));
    }, 0);

    if (pageParam) {
      const result: PaginatedResult<any> & { meta: { totalAssetValue?: number } } = {
        data: aggregatedStocks,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          totalAssetValue
        }
      };
      return res.json(result);
    }

    return res.json({ data: aggregatedStocks, totalAssetValue });
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
    
    if (req.query.search) {
      const search = req.query.search as string;
      whereClause.OR = [
        { product: { productName: { contains: search, mode: 'insensitive' } } },
        { product: { productCode: { contains: search, mode: 'insensitive' } } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

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
      // Get product for fallback pricing
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { inventoryBatches: { where: { id: batchId || '' } } }
      });
      if (!product) throw new Error('Produk tidak ditemukan');

      const batchPrice = product.inventoryBatches[0]?.purchasePrice;
      const unitCost = batchPrice ?? product.purchasePrice ?? 0;
      const sellingPrice = product.sellingPrice ?? 0;

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
            unitCost,
            sellingPrice,
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
          unitCost,
          sellingPrice,
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
            expiryDate: stock.batch?.expiryDate || null,
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
          expiryDate: null,
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
            batch: { select: { batchNumber: true, purchasePrice: true, expiryDate: true } }
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
              batch: { select: { batchNumber: true, purchasePrice: true, expiryDate: true } }
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
    const { sessionId, productId, batchId, physicalQty, notes, branchId, expiryDate } = req.body;

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

    // 3. Cek apakah item sudah ada di session (diperlukan untuk preserve unitPrice)
    const existingItem = await prisma.stockOpnameItem.findFirst({
      where: {
        sessionId,
        productId: targetProductId,
        batchId: batchId || null
      }
    });

    // 4. Resolve price — priority:
    //    1. Nilai eksplisit dari request yang > 0
    //    2. Nilai yang sudah tersimpan di item sebelumnya (preserve, jangan overwrite dengan 0)
    //    3. Fallback dari batch/product di DB
    let unitPrice = req.body.unitPrice;

    if (unitPrice === undefined || unitPrice === null) {
      // Tidak dikirim sama sekali → preserve nilai lama atau fallback DB
      if (existingItem && existingItem.unitPrice > 0) {
        unitPrice = existingItem.unitPrice;
      } else if (batchId) {
        const batch = await prisma.inventoryBatch.findUnique({ where: { id: batchId } });
        unitPrice = batch?.purchasePrice || 0;
      } else {
        const product = await prisma.product.findUnique({ where: { id: targetProductId } });
        unitPrice = product?.purchasePrice || 0;
      }
    } else if (Number(unitPrice) === 0 && existingItem && existingItem.unitPrice > 0) {
      // Dikirim 0 tapi item sudah punya harga valid → preserve, jangan overwrite
      unitPrice = existingItem.unitPrice;
    }

    const subtotal = physicalQty * unitPrice;

    // 5. Upsert item
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
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
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
          expiryDate: expiryDate ? new Date(expiryDate) : null,
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

    // Validasi: semua item yang ada selisih (diffQty != 0) WAJIB punya unitPrice > 0
    const itemsWithZeroPrice = session.items.filter(
      item => item.diffQty !== 0 && item.unitPrice === 0
    );
    if (itemsWithZeroPrice.length > 0) {
      const productIds = itemsWithZeroPrice.map(i => i.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, productName: true }
      });
      const productMap = new Map(products.map(p => [p.id, p.productName]));
      const namaList = itemsWithZeroPrice
        .map(i => productMap.get(i.productId) || i.productId)
        .join(', ');
      return res.status(400).json({
        message: `Finalisasi gagal: ${itemsWithZeroPrice.length} item memiliki harga beli = 0. ` +
          `Mohon isi harga beli terlebih dahulu sebelum finalisasi. Produk: ${namaList}`,
        field: 'unitPrice',
        affectedItems: itemsWithZeroPrice.map(i => ({
          id: i.id,
          productId: i.productId,
          productName: productMap.get(i.productId) || i.productId,
          diffQty: i.diffQty
        }))
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const modifiedProductIds = new Set<string>();

      for (const item of session.items) {
        if (item.diffQty === 0) continue;

        // 1. Update Product Price (branch) + ambil sellingPrice dari master
        const branchProduct = await tx.product.update({
          where: { id: item.productId },
          data: { purchasePrice: item.unitPrice },
          select: {
            masterProductId: true,
            sellingPrice: true,
            masterProduct: { select: { sellingPrice: true } }
          }
        });

        // Ambil sellingPrice: branch product → master product (tidak overwrite dengan 0)
        const sellingPrice =
          (branchProduct.sellingPrice && branchProduct.sellingPrice > 0
            ? branchProduct.sellingPrice
            : branchProduct.masterProduct?.sellingPrice) || 0;

        // Propagate purchasePrice ke ProductMaster
        if (branchProduct.masterProductId) {
          await tx.productMaster.update({
            where: { id: branchProduct.masterProductId },
            data: { purchasePrice: item.unitPrice }
          });
        }

        // 2. Update Stock Record — hanya untuk item yang SUDAH punya batchId
        // (item tanpa batch akan ditangani di step 3 saat batch dibuat)
        const existingStock = item.batchId
          ? await tx.inventoryStock.findFirst({
              where: {
                branchId: session.branchId,
                productId: item.productId,
                batchId: item.batchId,
              }
            })
          : null; // tanpa batch → akan dibuat ulang di step 3

        // 3. Auto-create batch (FIFO) untuk item tanpa batch, atau update batch yang sudah ada
        let resolvedBatchId: string | null = item.batchId || null;

        if (!item.batchId) {
          // Item belum punya batch → buat batch baru dengan batchNumber = unix timestamp
          // sehingga FIFO dapat berjalan (setiap opname menghasilkan batch berbeda)
          const batchNumber = `OPN-${Date.now()}`;
          // expiryDate wajib — pakai dari input opname, atau default 5 tahun ke depan
          const expiryDate = item.expiryDate
            ? new Date(item.expiryDate)
            : new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);

          // Cek apakah batch dengan number ini sudah ada (idempotent guard)
          const newBatch = await tx.inventoryBatch.upsert({
            where: {
              branchId_productId_batchNumber: {
                branchId: session.branchId,
                productId: item.productId,
                batchNumber,
              }
            },
            update: {
              currentQty: item.physicalQty,
              purchasePrice: item.unitPrice,
              expiryDate,
            },
            create: {
              branchId: session.branchId,
              productId: item.productId,
              batchNumber,
              expiryDate,
              purchasePrice: item.unitPrice,
              initialQty: item.physicalQty,
              currentQty: item.physicalQty,
            }
          });

          resolvedBatchId = newBatch.id;

          // Hapus inventoryStock lama yang tanpa batch (batchId: null) jika ada
          // lalu buat yang baru dengan batchId → FIFO bisa berjalan
          await tx.inventoryStock.deleteMany({
            where: {
              branchId: session.branchId,
              productId: item.productId,
              batchId: null,
            }
          });

          // Buat InventoryStock baru dengan batchId — upsert by batch
          const existingBatchStock = await tx.inventoryStock.findFirst({
            where: {
              branchId: session.branchId,
              productId: item.productId,
              batchId: resolvedBatchId,
            }
          });

          if (existingBatchStock) {
            await tx.inventoryStock.update({
              where: { id: existingBatchStock.id },
              data: {
                onHandQty: item.physicalQty,
                unitCost: item.unitPrice,
                ...(sellingPrice > 0 ? { sellingPrice } : {}),
              }
            });
          } else {
            await tx.inventoryStock.create({
              data: {
                branchId: session.branchId,
                productId: item.productId,
                batchId: resolvedBatchId,
                onHandQty: item.physicalQty,
                unitCost: item.unitPrice,
                sellingPrice,
              }
            });
          }

        } else {
          // Sudah punya batch → update saja
          await tx.inventoryBatch.update({
            where: { id: item.batchId },
            data: {
              currentQty: item.physicalQty,
              purchasePrice: item.unitPrice,
              ...(item.expiryDate ? { expiryDate: new Date(item.expiryDate) } : {})
            }
          });

          // Update inventoryStock yang terhubung ke batch ini
          if (existingStock) {
            await tx.inventoryStock.update({
              where: { id: existingStock.id },
              data: {
                onHandQty: item.physicalQty,
                unitCost: item.unitPrice,
                ...(sellingPrice > 0 ? { sellingPrice } : {}),
              }
            });
          }
        }

        // Update branchProductPrice untuk non-batch (pricing reference)
        await tx.branchProductPrice.upsert({
          where: {
            branchId_productId: {
              branchId: session.branchId,
              productId: item.productId,
            }
          },
          update: { purchasePrice: item.unitPrice },
          create: {
            branchId: session.branchId,
            productId: item.productId,
            purchasePrice: item.unitPrice,
            sellingPrice: sellingPrice || 0,
          }
        });

        // 4. Create Mutation dengan batchId yang sudah di-resolve (bisa batch baru)
        const mutation = await tx.inventoryMutation.create({
          data: {
            branchId: session.branchId,
            productId: item.productId,
            batchId: resolvedBatchId,        // ← pakai batch yang sudah di-resolve
            type: 'ADJUSTMENT',
            quantity: item.diffQty,
            unitCost: item.unitPrice,
            sellingPrice,
            referenceType: 'STOCK_OPNAME',
            referenceId: session.id,
            notes: `Stock Opname: ${session.notes || ''}`,
            userId,
          },
        });

        // 4. Sync ke General Ledger (atomic, idempotent)
        // Selisih positif → Debit Persediaan (1-1301/1302/1303), Kredit Laba Ditahan (3-2001)
        // Selisih negatif → Debit HPP (5-1101), Kredit Persediaan (1-1301/1302/1303)
        // Sinkronisasi GL harus sukses agar stok dan buku besar konsisten.
        // Jika syncInventoryToLedger melempar error, transaksi akan di-rollback.
        await syncInventoryToLedger(mutation.id, { tx, idempotent: true });

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
              expiryDate: s.batch?.expiryDate || null, // Auto-fill dari batch
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
            batch: { select: { batchNumber: true, purchasePrice: true, expiryDate: true } }
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

/**
 * Import Opname from Excel
 */
export const importOpnameExcel = async (req: Request, res: Response) => {
  try {
    const { branchId, items } = req.body;
    if (!branchId || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    // 1. Get or create active session
    let session = await prisma.stockOpnameSession.findFirst({
      where: { branchId: branchId as string, status: 'DRAFT' }
    });

    if (!session) {
      const userId = (req as any).user?.id || 'SYSTEM';
      session = await prisma.stockOpnameSession.create({
        data: {
          branchId: branchId as string,
          createdBy: userId,
          status: 'DRAFT',
          totalValue: 0
        }
      });
    }

    // 2. Map branch products
    const branchProducts = await prisma.product.findMany({
      where: { clinicId: branchId }
    });
    const productMap = new Map(branchProducts.map(p => [p.productCode?.toUpperCase(), p]));
    const productSkuMap = new Map(branchProducts.map(p => [p.sku?.toUpperCase(), p]));
    const productNameMap = new Map(branchProducts.map(p => [p.productName?.toUpperCase(), p]));

    // 3. Pre-fetch master products to fallback
    const masterProducts = await prisma.productMaster.findMany();
    const masterMap = new Map(masterProducts.map(p => [p.masterCode?.toUpperCase(), p]));
    const masterNameMap = new Map(masterProducts.map(p => [p.masterName?.toUpperCase(), p]));

    const failedItems: string[] = [];

    // Clean up string comparison helper (removes spaces and symbols)
    const sanitize = (str: string) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    for (const item of items) {
      const code = String(item.productCode || '').trim().toUpperCase();
      const name = String(item.productName || '').trim().toUpperCase();
      if (!code && !name) continue;

      let branchProduct = code ? (productMap.get(code) || productSkuMap.get(code)) : undefined;
      
      if (!branchProduct && name) {
         branchProduct = productNameMap.get(name);
         if (!branchProduct) {
            // Fuzzy match name
            const sanitizedName = sanitize(name);
            branchProduct = branchProducts.find(p => p.productName && sanitize(p.productName).includes(sanitizedName));
         }
      }
      
      let targetProductId = branchProduct?.id;
      let targetUnitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : branchProduct?.purchasePrice || 0;

      if (!branchProduct) {
        let master = code ? masterMap.get(code) : undefined;
        if (!master && name) {
           master = masterNameMap.get(name);
           if (!master) {
              const sanitizedName = sanitize(name);
              master = masterProducts.find(p => p.masterName && sanitize(p.masterName).includes(sanitizedName));
           }
        }

        if (master) {
          // Auto-register to branch
          branchProduct = await prisma.product.create({
            data: {
              masterProductId: master.id,
              productCode: master.masterCode,
              sku: master.masterCode,
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
            },
            include: { inventoryStocks: true }
          });
          targetProductId = branchProduct.id;
          targetUnitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : master.purchasePrice || 0;
          
          if (code) productMap.set(code, branchProduct);
          if (name) productNameMap.set(name, branchProduct);
        }
      }

      if (!targetProductId) {
        failedItems.push(code || name);
        continue;
      }

      // Check if already in session
      const existingItem = await prisma.stockOpnameItem.findFirst({
        where: { sessionId: session.id, productId: targetProductId }
      });

      if (existingItem) {
        // Update physical qty
        await prisma.stockOpnameItem.update({
          where: { id: existingItem.id },
          data: {
            physicalQty: Number(item.physicalQty || 0),
            unitPrice: targetUnitPrice,
            subtotal: Number(item.physicalQty || 0) * targetUnitPrice,
            diffQty: Number(item.physicalQty || 0) - existingItem.systemQty,
            notes: item.notes ? String(item.notes) : existingItem.notes,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : existingItem.expiryDate
          }
        });
      } else {
        // Create new item in session
        await prisma.stockOpnameItem.create({
          data: {
            sessionId: session.id,
            productId: targetProductId,
            systemQty: 0,
            physicalQty: Number(item.physicalQty || 0),
            diffQty: Number(item.physicalQty || 0),
            unitPrice: targetUnitPrice,
            subtotal: Number(item.physicalQty || 0) * targetUnitPrice,
            notes: item.notes ? String(item.notes) : null,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            status: 'DRAFT'
          }
        });
      }
    }

    // Recalculate session total
    const allItems = await prisma.stockOpnameItem.findMany({ where: { sessionId: session.id } });
    const totalValue = allItems.reduce((sum, i) => sum + i.subtotal, 0);
    await prisma.stockOpnameSession.update({
      where: { id: session.id },
      data: { totalValue }
    });

    if (failedItems.length > 0) {
      console.log(`[Import Excel] Failed to match ${failedItems.length} items. Samples:`, failedItems.slice(0, 20));
      return res.status(200).json({
        message: 'Partial success',
        added: items.length - failedItems.length,
        failed: failedItems
      });
    }

    res.json({ message: 'Success', added: items.length });

  } catch (error) {
    console.error('[InventoryController] importOpnameExcel Error:', error);
    res.status(500).json({
      message: 'Internal server error during import',
      details: (error as Error).message
    });
  }
};

/**
 * Sync Inventory Prices (Backfill unitCost and sellingPrice)
 * and Re-sync General Ledger for inventory mutations.
 */
export const syncInventoryPrices = async (req: Request, res: Response) => {
  try {
    console.log('[SyncInventoryPrices] Starting database backfill for unitCost and sellingPrice...');
    let stockUpdatedCount = 0;
    let mutationUpdatedCount = 0;

    // 1. Sync InventoryStock
    const stocksToFix = await prisma.inventoryStock.findMany({
      where: { OR: [{ unitCost: 0 }, { sellingPrice: 0 }] },
      include: {
        batch: true,
        product: {
          include: {
            branchPrices: true,
            masterProduct: true
          }
        }
      }
    });

    for (const stock of stocksToFix) {
      let unitPrice = stock.batch?.purchasePrice || 0;
      let sellPrice = 0;

      const branchPrice = stock.product?.branchPrices?.find(bp => bp.branchId === stock.branchId);
      
      if (!unitPrice && branchPrice?.purchasePrice) unitPrice = branchPrice.purchasePrice;
      if (!unitPrice && stock.product?.purchasePrice) unitPrice = stock.product.purchasePrice;
      if (!unitPrice && stock.product?.masterProduct?.purchasePrice) unitPrice = stock.product.masterProduct.purchasePrice;

      if (branchPrice?.sellingPrice) sellPrice = branchPrice.sellingPrice;
      if (!sellPrice && stock.product?.sellingPrice) sellPrice = stock.product.sellingPrice;
      if (!sellPrice && stock.product?.masterProduct?.sellingPrice) sellPrice = stock.product.masterProduct.sellingPrice;

      if (unitPrice > 0 || sellPrice > 0) {
        await prisma.inventoryStock.update({
          where: { id: stock.id },
          data: { 
            unitCost: unitPrice > 0 ? unitPrice : stock.unitCost,
            sellingPrice: sellPrice > 0 ? sellPrice : stock.sellingPrice
          }
        });
        stockUpdatedCount++;
      }
    }

    // 2. Sync InventoryMutation
    const mutationsToFix = await prisma.inventoryMutation.findMany({
      where: { OR: [{ unitCost: 0 }, { sellingPrice: 0 }] },
      include: {
        batch: true,
        product: {
          include: {
            branchPrices: true,
            masterProduct: true
          }
        }
      }
    });

    for (const mut of mutationsToFix) {
      let unitPrice = mut.batch?.purchasePrice || 0;
      let sellPrice = 0;

      const branchPrice = mut.product?.branchPrices?.find(bp => bp.branchId === mut.branchId);
      
      if (!unitPrice && branchPrice?.purchasePrice) unitPrice = branchPrice.purchasePrice;
      if (!unitPrice && mut.product?.purchasePrice) unitPrice = mut.product.purchasePrice;
      if (!unitPrice && mut.product?.masterProduct?.purchasePrice) unitPrice = mut.product.masterProduct.purchasePrice;

      if (branchPrice?.sellingPrice) sellPrice = branchPrice.sellingPrice;
      if (!sellPrice && mut.product?.sellingPrice) sellPrice = mut.product.sellingPrice;
      if (!sellPrice && mut.product?.masterProduct?.sellingPrice) sellPrice = mut.product.masterProduct.sellingPrice;

      if (unitPrice > 0 || sellPrice > 0) {
        await prisma.inventoryMutation.update({
          where: { id: mut.id },
          data: { 
            unitCost: unitPrice > 0 ? unitPrice : mut.unitCost,
            sellingPrice: sellPrice > 0 ? sellPrice : mut.sellingPrice
          }
        });
        mutationUpdatedCount++;
      }
    }

    console.log(`[SyncInventoryPrices] Stock Updated: ${stockUpdatedCount}, Mutations Updated: ${mutationUpdatedCount}`);

    // 2.5 Auto-Reconcile orphaned physical stock differences
    console.log('[SyncInventoryPrices] Reconciling physical stock differences...');
    const allClinics = await prisma.clinic.findMany();
    const sysUser = await prisma.user.findFirst();
    let reconciliationCount = 0;
    
    for (const clinic of allClinics) {
      const stocks = await prisma.inventoryStock.findMany({ 
        where: { branchId: clinic.id },
        include: { product: { include: { branchPrices: { where: { branchId: clinic.id } }, masterProduct: true } } } 
      });
      const muts = await prisma.inventoryMutation.findMany({ where: { branchId: clinic.id } });
      
      const mutGroups: any = {};
      for (const m of muts) {
        const key = m.productId + '_' + (m.batchId || 'null');
        if (!mutGroups[key]) mutGroups[key] = { qty: 0 };
        if (m.type === 'OPENING_BALANCE' || m.type === 'IN' || m.type === 'PURCHASE' || m.type === 'ADJUSTMENT') {
          mutGroups[key].qty += m.quantity;
        } else if (m.type === 'OUT' || m.type === 'SALE' || m.type === 'USAGE' || m.type === 'EXPIRED') {
          mutGroups[key].qty -= m.quantity;
        }
      }

      for (const key in mutGroups) {
        const [pid, bid] = key.split('_');
        const stock = stocks.find(s => s.productId === pid && (s.batchId || 'null') === bid);
        const stockQty = stock ? stock.onHandQty : 0;
        const mutQty = mutGroups[key].qty;
        
        if (Math.abs(stockQty - mutQty) > 0.001) {
          const diffQty = stockQty - mutQty; 
          const product = stock?.product || await prisma.product.findUnique({ where: { id: pid }, include: { branchPrices: { where: { branchId: clinic.id } }, masterProduct: true } });
          if (!product) continue;

          let unitCost = stock?.unitCost ?? product.purchasePrice ?? product.masterProduct?.purchasePrice ?? 0;
          if (!unitCost && product.branchPrices?.length > 0) {
             unitCost = product.branchPrices[0].purchasePrice || 0;
          }
          
          if (sysUser) {
            await prisma.inventoryMutation.create({
              data: {
                branchId: clinic.id,
                productId: pid,
                batchId: bid === 'null' ? null : bid,
                type: 'ADJUSTMENT',
                quantity: diffQty,
                unitCost: unitCost,
                sellingPrice: product.sellingPrice || 0,
                notes: 'Auto-adjustment to reconcile physical stock with ledger',
                userId: sysUser.id
              }
            });
            reconciliationCount++;
          }
        }
      }
    }
    console.log(`[SyncInventoryPrices] Auto-reconciled ${reconciliationCount} stock discrepancies.`);

    // 3. Delete old JournalEntries related to inventory
    const deletedJournals = await prisma.journalEntry.deleteMany({
      where: {
        OR: [
          { referenceNo: { startsWith: 'INV-MUT-' } },
          { referenceNo: { startsWith: 'OPENING-' } }
        ],
        entryType: 'SYSTEM'
      }
    });
    console.log(`[SyncInventoryPrices] Deleted ${deletedJournals.count} old inventory journals.`);

    // 4. Resync Ledger
    let journalsCreated = 0;
    
    // syncOpeningBalances REMOVED: It causes double accounting since syncAllInventoryToLedger 
    // processes historical ADJUSTMENT mutations which already account for the opening balance!

    // Re-run Mutations
    const retroResult = await syncAllInventoryToLedger();
    journalsCreated += retroResult.synced;

    res.json({
      message: 'Sinkronisasi Harga Stok dan Jurnal Keuangan Berhasil!',
      data: {
        stockUpdated: stockUpdatedCount,
        mutationUpdated: mutationUpdatedCount,
        oldJournalsDeleted: deletedJournals.count,
        newJournalsCreated: journalsCreated,
        ledgerSyncErrors: retroResult.errors
      }
    });

  } catch (error) {
    console.error('[InventoryController] syncInventoryPrices Error:', error);
    res.status(500).json({
      message: 'Gagal melakukan sinkronisasi harga stok',
      details: (error as Error).message
    });
  }
};

/**
 * Rekonsiliasi mandiri stok: menyelaraskan `inventoryBatch.currentQty` terhadap
 * `inventoryStock.onHandQty` (sumber kebenaran). Mencegah error
 * "Kritikal: Record Stok ... tidak cukup" saat stock sebenarnya tersedia karena
 * tabel batch tertinggal dari stock record.
 *
 * Body: { branchId?: string, productId?: string }
 * - branchId  : filter per cabang (wajib salah satu dari branchId/productId)
 * - productId : filter satu produk (opsional)
 *
 * Returns ringkasan jumlah batch yang disinkronkan otomatis + yang bermasalah.
 */
export const reconcileInventoryStock = async (req: Request, res: Response) => {
  try {
    const branchId = (req.body?.branchId as string) || (req.query.branchId as string) || (req.headers['x-clinic-id'] as string);
    const productId = (req.body?.productId as string) || (req.query.productId as string);

    if (branchId && productId) {
      const summary: any = { checked: 0, resolved: 0, skipped: 0, notFound: 0, details: [] };
      await prisma.$transaction(async (tx) => {
        const stocks = await tx.inventoryStock.findMany({
          where: {
            branchId,
            productId,
            batchId: { not: null },
          },
          select: { batchId: true, onHandQty: true },
        });

        for (const s of stocks) {
          if (!s.batchId) continue;
          summary.checked++;
          const batch = await tx.inventoryBatch.findUnique({
            where: { id: s.batchId },
            select: { id: true, currentQty: true, batchNumber: true },
          });
          if (!batch) { summary.notFound++; continue; }
          if (batch.currentQty === s.onHandQty) { summary.skipped++; continue; }

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { currentQty: s.onHandQty },
          });
          summary.resolved++;
          summary.details.push({
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            productId,
            from: batch.currentQty,
            to: s.onHandQty,
          });
        }
      });
      res.json({ message: 'Rekonsiliasi batch selesai.', data: summary });
      return;
    }

    // default: tanpa filter — scan semua batch yang punya record stock
    const result = await prisma.$transaction(async (tx) => {
      const stocks = await tx.inventoryStock.findMany({
        where: { batchId: { not: null } },
        select: { batchId: true, onHandQty: true, branchId: true },
      });

      const summary = { checked: 0, resolved: 0, skipped: 0, notFound: 0 };
      for (const s of stocks) {
        if (!s.batchId) continue;
        summary.checked++;
        const batch = await tx.inventoryBatch.findUnique({
          where: { id: s.batchId },
          select: { id: true, currentQty: true },
        });
        if (!batch) { summary.notFound++; continue; }
        if (batch.currentQty === s.onHandQty) { summary.skipped++; continue; }
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { currentQty: s.onHandQty },
        });
        summary.resolved++;
      }
      return summary;
    });

    res.json({
      message: 'Rekonsiliasi stok selesai.',
      data: result,
    });
  } catch (error) {
    console.error('[InventoryController] reconcileInventory Error:', error);
    res.status(500).json({
      message: 'Gagal melakukan rekonsiliasi stok',
      details: (error as Error).message,
    });
  }
};

/**
 * Repair Stock Integrity (Reconcile Batch currentQty with Stock onHandQty and sync Product quantities)
 */
export const repairStockIntegrity = async (req: Request, res: Response) => {
  try {
    console.log('[InventoryController] Starting inventory integrity repair...');
    
    // 1. Fetch all InventoryStock records that are linked to a batch
    const stocks = await prisma.inventoryStock.findMany({
      where: {
        batchId: { not: null }
      },
      include: {
        product: {
          select: {
            productName: true,
            productCode: true
          }
        },
        batch: true
      }
    });

    let discrepancyCount = 0;

    for (const stock of stocks) {
      if (!stock.batch) continue;

      const stockQty = stock.onHandQty;
      const batchQty = stock.batch.currentQty;

      // If there is a discrepancy between stock on hand and batch qty
      if (stockQty !== batchQty) {
        await prisma.inventoryBatch.update({
          where: { id: stock.batch.id },
          data: { currentQty: stockQty }
        });
        discrepancyCount++;
      }
    }

    // 2. Fetch all products to ensure their aggregated sum matches the Product.quantity field
    const products = await prisma.product.findMany({
      select: {
        id: true,
        clinicId: true,
        productName: true,
        quantity: true
      }
    });

    let productFixCount = 0;

    for (const p of products) {
      if (!p.clinicId) continue;

      // Calculate sum of onHandQty in InventoryStock for this product and branch
      const stockSum = await prisma.inventoryStock.aggregate({
        where: {
          productId: p.id,
          branchId: p.clinicId
        },
        _sum: {
          onHandQty: true
        }
      });

      const calculatedSum = stockSum._sum.onHandQty || 0;

      if (p.quantity !== calculatedSum) {
        await prisma.product.update({
          where: { id: p.id },
          data: { quantity: calculatedSum }
        });
        productFixCount++;
      }
    }

    res.json({
      message: 'Perbaikan integritas stok berhasil dilakukan!',
      data: {
        batchDiscrepanciesAligned: discrepancyCount,
        productQuantitiesResynced: productFixCount
      }
    });
  } catch (error) {
    console.error('[InventoryController] repairStockIntegrity Error:', error);
    res.status(500).json({
      message: 'Gagal melakukan perbaikan integritas stok',
      details: (error as Error).message
    });
  }
};

