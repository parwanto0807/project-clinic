import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { InventoryService } from '../services/inventory.service'
import { syncInventoryToLedger } from '../services/inventoryLedger.service'

/**
 * Get active pharmacy queues / prescriptions
 */
export const getPharmacyQueues = async (req: Request, res: Response) => {
  try {
    const { clinicId, date } = req.query
    
    // Create query filters
    const whereClause: any = {}
    
    // If clinicId is provided, filter by patient's clinic via medical record or registration
    if (clinicId) {
       whereClause.medicalRecord = {
           clinicId: clinicId as string
       }
    }

    if (date) {
      const targetDate = new Date(date as string)
      targetDate.setHours(0, 0, 0, 0)
      const nextDate = new Date(targetDate)
      nextDate.setDate(nextDate.getDate() + 1)
      
      whereClause.prescriptionDate = {
        gte: targetDate,
        lt: nextDate
      }
    } else {
      // Default to today if no date specified
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      whereClause.prescriptionDate = {
        gte: today
      }
    }

    const prescriptions = await prisma.prescription.findMany({
      where: whereClause,
      include: {
        patient: { select: { id: true, name: true, medicalRecordNo: true, gender: true } },
        doctor: { select: { id: true, name: true } },
        items: { include: { medicine: true, components: { include: { medicine: true } }, formula: { select: { id: true, formulaName: true, formulaCode: true, tuslahPrice: true } } } },
        medicalRecord: {
          select: {
            registration: {
              include: {
                invoices: {
                  select: { status: true, total: true, amountPaid: true }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { dispenseStatus: 'asc' }, // usually 'pending', 'preparing', 'ready', 'dispensed'
        { prescriptionDate: 'desc' }
      ]
    })
    
    res.json(prescriptions)
  } catch (error) {
    console.error('Error fetching pharmacy queues:', error)
    res.status(500).json({ message: (error as Error).message })
  }
}

/**
 * Get single prescription details
 */
export const getPrescriptionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: true,
        medicalRecord: {
           include: {
              clinic: true,
              registration: {
                include: {
                  invoices: {
                    select: { status: true, total: true, amountPaid: true }
                  }
                }
              }
           }
        },
        items: { include: { medicine: true, components: { include: { medicine: true } }, formula: { select: { id: true, formulaName: true, formulaCode: true, tuslahPrice: true } } } }
      }
    })
    
    if (!prescription) {
      return res.status(404).json({ message: 'Resep tidak ditemukan' })
    }

    // Enrich items with current stock data
    const clinicId = (prescription as any).medicalRecord?.clinicId;
    
    if (clinicId) {
      const enrichedItems = await Promise.all(prescription.items.map(async (item) => {
        // Handle Standard Medicine
        if (item.medicineId && !item.isRacikan) {
          const product = await prisma.product.findFirst({
            where: {
              masterProduct: { medicineId: item.medicineId },
              clinicId: clinicId
            },
            select: { id: true, usedUnit: true, storageUnit: true, sellingPrice: true }
          });

          if (product) {
            const stock = await InventoryService.getAvailableStock(product.id, clinicId);
            (item as any).availableStock = stock.totalAvailable;
            (item as any).usedUnit = product.usedUnit;
            (item as any).storageUnit = product.storageUnit;
            (item as any).sellingPrice = product.sellingPrice;
          } else {
            (item as any).availableStock = 0;
          }
        }

        // Handle Racikan Components
        if (item.components && item.components.length > 0) {
          await Promise.all(item.components.map(async (comp) => {
            const product = await prisma.product.findFirst({
              where: {
                masterProduct: { medicineId: comp.medicineId },
                clinicId: clinicId
              },
              select: { id: true, usedUnit: true, storageUnit: true, sellingPrice: true }
            });

            if (product) {
              const stock = await InventoryService.getAvailableStock(product.id, clinicId);
              (comp as any).availableStock = stock.totalAvailable;
              (comp as any).usedUnit = product.usedUnit;
              (comp as any).storageUnit = product.storageUnit;
              (comp as any).sellingPrice = product.sellingPrice;
            } else {
              (comp as any).availableStock = 0;
            }
          }));
        }

        return item;
      }));

      (prescription as any).items = enrichedItems;
    }
    
    res.json(prescription)
  } catch (error) {
    console.error('Error fetching prescription details:', error)
    res.status(500).json({ message: (error as Error).message })
  }
}

/**
 * Update Dispense Status and handle inventory deduction when "dispensed"
 */
export const updateDispenseStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, counselingGiven } = req.body
    const pharmacistId = (req as any).user?.id // Assuming pharmacist handles this

    if (!['pending', 'preparing', 'ready', 'dispensed'].includes(status)) {
       return res.status(400).json({ message: 'Status tidak valid' })
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: { 
         items: { 
           include: { 
             medicine: true,
             components: {
               include: {
                 medicine: true
               }
             }
           } 
         },
         medicalRecord: {
           include: {
             registration: {
               include: {
                 invoices: true
               }
             }
           }
         }
      }
    })

    if (!prescription) {
      return res.status(404).json({ message: 'Resep tidak ditemukan' })
    }

    // DISABLED: Block dispensing if invoice is not paid
    // if (status === 'dispensed') {
    //   const invoices = prescription.medicalRecord?.registration?.invoices || []
    //   const isPaid = invoices.some(inv => inv.status === 'paid')
    //   if (!isPaid) {
    //     return res.status(400).json({ message: 'Obat tidak dapat diserahkan karena pembayaran invoice belum lunas.' })
    //   }
    // }

    // Attempting to finish dispensing
    if (status === 'dispensed' && prescription.dispenseStatus !== 'dispensed') {
      const clinicId = prescription.medicalRecord?.clinicId

      await prisma.$transaction(async (tx) => {
         // BULK FETCH ALL RELATED PRODUCTS
         const requiredMedicineIds: string[] = [];
         for (const item of prescription.items) {
           if (item.isRacikan) {
             (item as any).components?.forEach((comp: any) => {
                if (comp.medicine) requiredMedicineIds.push(comp.medicine.id);
             });
           } else if (item.medicine) {
             requiredMedicineIds.push(item.medicine.id);
           }
         }

         const products = await tx.product.findMany({
            where: {
               masterProduct: { medicineId: { in: requiredMedicineIds } },
               clinicId: clinicId
            },
            include: { masterProduct: true }
         });

         const productMap = new Map<string, any>();
         products.forEach(p => {
            if (p.masterProduct?.medicineId) {
               productMap.set(p.masterProduct.medicineId, p);
            }
         });

         const deductedProductIds: string[] = [];
         const createdMutationIds: string[] = []; // Kumpulkan mutation IDs untuk GL sync

         // Deduct Stock
         for (const item of prescription.items) {
             
             // Core deduction handler using FIFO
             const deductItem = async (medicineId: string, medicineName: string, reqQty: number) => {
                const product = productMap.get(medicineId);

                if (!product) {
                   throw new Error(`Produk untuk obat ${medicineName} tidak ditemukan di klinik ini.`)
                }

                const wasReserved = ['preparing', 'ready'].includes(prescription.dispenseStatus);

                const picks = await InventoryService.deductStock(tx, {
                    productId: product.id,
                    branchId: clinicId as string,
                    quantity: reqQty,
                    userId: pharmacistId || 'SYSTEM',
                    referenceType: 'PHARMACY_DISPENSING',
                    referenceId: id,
                    notes: `Dispensing for Prescription ${prescription.prescriptionNo}`,
                    skipSync: true,
                    fromReserved: wasReserved
                });

                deductedProductIds.push(product.id);

                // Kumpulkan mutation IDs dari picks
                for (const pick of picks) {
                   if ((pick as any).mutationId) {
                     createdMutationIds.push((pick as any).mutationId);
                   }
                }
             }

             if (item.isRacikan) {
                for (const comp of (item as any).components) {
                   if (comp.medicine) {
                        const requiredQty = comp.quantity * item.quantity;
                        await deductItem(comp.medicine.id, comp.medicine.medicineName, requiredQty)
                   }
                }
             } else {
                 const medicine = item.medicine
                 if (medicine && clinicId) {
                    await deductItem(medicine.id, medicine.medicineName, item.quantity as number)
                 }
             }
         }

         // BULK SYNC ALL DEDUCTED PRODUCTS
         if (deductedProductIds.length > 0) {
             const uniqueProductIds = [...new Set(deductedProductIds)];
             await InventoryService.syncMultipleProductsQuantity(tx, uniqueProductIds, clinicId!);
         }

         // --- GL SYNC: Buat jurnal HPP per mutasi (Debit 5-1101, Kredit 1-1301) ---
         // Idempotent — tidak akan dobel meski dipanggil ulang
         for (const mutationId of createdMutationIds) {
            try {
               await syncInventoryToLedger(mutationId, { tx, idempotent: true });
            } catch (glErr) {
               console.error(`[Pharmacy] GL sync gagal untuk mutasi ${mutationId}:`, (glErr as Error).message);
            }
         }

         // Mark prescription as dispensed
         await tx.prescription.update({
           where: { id },
           data: {
             dispenseStatus: 'dispensed',
             pharmacistId: pharmacistId,
             counselingGiven: !!counselingGiven,
             dispenseDate: new Date()
           }
         })
      }, { maxWait: 60000, timeout: 60000 })
      return res.json({ message: 'Resep berhasil di-dispense dan stok obat telah dikurangi.' })
    }

    // --- RESERVATION LOGIC FOR STATUS TRANSITIONS ---
    const clinicId = prescription.medicalRecord?.clinicId;
    if (clinicId) {
      // 1. Transition to 'preparing' -> Reserve Stock
      if (status === 'preparing' && prescription.dispenseStatus === 'pending') {
         await prisma.$transaction(async (tx) => {
            for (const item of prescription.items) {
               if (item.isRacikan) {
                  for (const comp of (item as any).components) {
                     if (comp.medicine) {
                        const product = await tx.product.findFirst({ where: { masterProduct: { medicineId: comp.medicine.id }, clinicId } });
                        if (product) await InventoryService.reserveStock(tx, product.id, clinicId, comp.quantity * item.quantity, pharmacistId, prescription.prescriptionNo);
                     }
                  }
               } else if (item.medicine) {
                  const product = await tx.product.findFirst({ where: { masterProduct: { medicineId: item.medicine.id }, clinicId } });
                  if (product) await InventoryService.reserveStock(tx, product.id, clinicId, item.quantity as number, pharmacistId, prescription.prescriptionNo);
               }
            }
         });
      }
      
      // 2. Transition FROM 'preparing' or 'ready' back to 'pending' -> Release Reservation
      if (status === 'pending' && ['preparing', 'ready'].includes(prescription.dispenseStatus)) {
          await prisma.$transaction(async (tx) => {
            for (const item of prescription.items) {
               if (item.isRacikan) {
                  for (const comp of (item as any).components) {
                     if (comp.medicine) {
                        const product = await tx.product.findFirst({ where: { masterProduct: { medicineId: comp.medicine.id }, clinicId } });
                        if (product) await InventoryService.unreserveStock(tx, product.id, clinicId, comp.quantity * item.quantity, pharmacistId, prescription.prescriptionNo);
                     }
                  }
               } else if (item.medicine) {
                  const product = await tx.product.findFirst({ where: { masterProduct: { medicineId: item.medicine.id }, clinicId } });
                  if (product) await InventoryService.unreserveStock(tx, product.id, clinicId, item.quantity as number, pharmacistId, prescription.prescriptionNo);
               }
            }
         });
      }
    }

    // Just update status (e.g. pending -> preparing -> ready)
    const updated = await prisma.prescription.update({
      where: { id },
      data: { dispenseStatus: status }
    })

    res.json({ message: `Status resep berhasil diperbarui ke ${status}.`, prescription: updated })
  } catch (error: any) {
    console.error('Error updating dispense status:', error)
    const status = error.message.includes('Stok') ? 400 : 500;
    res.status(status).json({ message: error.message || 'Gagal memperbarui status dispense.' })
  }
}

/**
 * Update prescription items (Adjustment/Substitution by Pharmacist)
 */
export const updatePrescriptionItems = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { items } = req.body;
  const userId = (req as any).user?.id || 'system';

  try {
    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: { 
        items: { include: { components: true } }, 
        medicalRecord: true 
      }
    });

    if (!prescription) return res.status(404).json({ message: 'Resep tidak ditemukan' });
    
    // 1. Fetch Related Invoice (MUST BE UNPAID & UNPOSTED)
    const invoice = await prisma.invoice.findFirst({
        where: { 
            patientId: prescription.patientId, 
            clinicId: prescription.medicalRecord?.clinicId,
            status: 'unpaid',
            isPosted: false
        },
        orderBy: { createdAt: 'desc' }
    });

    if (prescription.dispenseStatus === 'dispensed') {
      return res.status(400).json({ message: 'Resep sudah ter-dispense dan tidak dapat diubah lagi.' });
    }

    if (invoice && invoice.isPosted) {
        return res.status(400).json({ message: 'Invoice sudah terposting ke Buku Besar. Perubahan resep tidak diizinkan.' });
    }

    const clinicId = prescription.medicalRecord?.clinicId;

    await prisma.$transaction(async (tx) => {
      // 1. If currently reserved (preparing/ready), unreserve OLD items first
      if (['preparing', 'ready'].includes(prescription.dispenseStatus) && clinicId) {
        for (const item of prescription.items) {
           if (item.isRacikan) {
              for (const comp of item.components) {
                 const product = await tx.product.findFirst({ 
                   where: { masterProduct: { medicineId: comp.medicineId }, clinicId } 
                 });
                 if (product) await InventoryService.unreserveStock(tx, product.id, clinicId, comp.quantity * item.quantity, userId, prescription.prescriptionNo);
              }
           } else if (item.medicineId) {
              const product = await tx.product.findFirst({ 
                where: { masterProduct: { medicineId: item.medicineId }, clinicId } 
              });
              if (product) await InventoryService.unreserveStock(tx, product.id, clinicId, item.quantity, userId, prescription.prescriptionNo);
           }
        }
      }

      // 2. Delete all existing items
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });

      // 3. Create NEW items
      for (const newItem of items) {
        const createdItem = await tx.prescriptionItem.create({
          data: {
            prescriptionId: id,
            isRacikan: newItem.isRacikan,
            racikanName: newItem.racikanName,
            formulaId: newItem.formulaId || null,
            medicineId: newItem.medicineId,
            quantity: newItem.quantity,
            dosage: newItem.dosage,
            frequency: newItem.frequency,
            duration: newItem.duration,
            instructions: newItem.instructions,
            components: newItem.isRacikan ? {
              create: newItem.components.map((c: any) => ({
                medicineId: c.medicineId,
                quantity: c.quantity,
                unit: c.unit || null,
              }))
            } : undefined
          },
          include: { components: true }
        });

        // 4. If currently reserved, reserve NEW items
        if (['preparing', 'ready'].includes(prescription.dispenseStatus) && clinicId) {
           if (createdItem.isRacikan) {
              for (const comp of createdItem.components) {
                 const product = await tx.product.findFirst({ 
                   where: { masterProduct: { medicineId: comp.medicineId }, clinicId } 
                 });
                 if (product) await InventoryService.reserveStock(tx, product.id, clinicId, comp.quantity * createdItem.quantity, userId, prescription.prescriptionNo);
              }
           } else if (createdItem.medicineId) {
              const product = await tx.product.findFirst({ 
                where: { masterProduct: { medicineId: createdItem.medicineId }, clinicId } 
              });
              if (product) await InventoryService.reserveStock(tx, product.id, clinicId, createdItem.quantity, userId, prescription.prescriptionNo);
           }
        }
        }

      // 5. SYNC WITH INVOICE (If exists and unpaid)
      if (invoice) {
        // 5.1 Resolve "Obat-obatan" Service
        let obatService = await tx.service.findFirst({
          where: { 
            serviceName: { contains: 'Obat', mode: 'insensitive' },
            OR: [ { clinicId: clinicId }, { clinic: { isMain: true } } ]
          }
        });
        
        if (!obatService && clinicId) {
          obatService = await tx.service.create({
            data: {
              serviceCode: 'MED-GEN',
              serviceName: 'Obat-obatan',
              price: 0,
              isActive: true,
              clinicId: clinicId
            }
          });
        }

        if (obatService) {
            // 5.2 Remove old medicine items from invoice
            await tx.invoiceItem.deleteMany({
                where: { invoiceId: invoice.id, serviceId: obatService.id }
            });

            // 5.3 Add newly adjusted medicines
            let additionalTotal = 0;
            for (const newItem of items) {
                let itemName = newItem.isRacikan ? newItem.racikanName : 'Obat';
                let itemPrice = 0;

                if (!newItem.isRacikan && newItem.medicineId && clinicId) {
                    const product = await tx.product.findFirst({
                        where: { clinicId, masterProduct: { medicineId: newItem.medicineId } }
                    });
                    if (product) {
                        itemName = `${product.productName} (${newItem.dosage})`;
                        itemPrice = product.sellingPrice || 0;
                    }
                } else if (newItem.isRacikan) {
                    // Simple logic for racikan pricing (sum of components or fixed)
                    // For now, let's try to calculate from components if prices exist
                    for (const comp of newItem.components) {
                        const compProd = await tx.product.findFirst({
                            where: { clinicId, masterProduct: { medicineId: comp.medicineId } }
                        });
                        if (compProd) itemPrice += (compProd.sellingPrice || 0) * comp.quantity;
                    }
                }

                const subtotal = itemPrice * (newItem.quantity || 1);
                await tx.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        serviceId: obatService.id,
                        description: itemName,
                        quantity: newItem.quantity,
                        price: itemPrice,
                        subtotal
                    }
                });
                additionalTotal += subtotal;
            }

            // 5.4 Recalculate Invoice Totals
            // We need to fetch all current items (Services + new Medicines)
            const allItems = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
            const newSubtotal = allItems.reduce((sum, item) => sum + item.subtotal, 0);
            
            await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    subtotal: newSubtotal,
                    total: newSubtotal // Assuming no tax/discount complexity for now
                }
            });
        }
      }
    }, { maxWait: 30000, timeout: 30000 });

    res.json({ message: 'Daftar obat dalam resep berhasil disesuaikan oleh Apoteker.' });
  } catch (error: any) {
    console.error('Error updating prescription items:', error);
    const status = error.message.includes('Stok') ? 400 : 500;
    res.status(status).json({ message: error.message || 'Gagal memperbarui item resep.' });
  }
}

