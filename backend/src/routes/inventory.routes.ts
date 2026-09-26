import { Router } from 'express';
import * as InventoryController from '../controllers/inventory.controller';
import * as ProcurementController from '../controllers/procurement.controller';
import * as TransferController from '../controllers/transfer.controller';
import {
  payProcurement,
  receiveCash,
  getProcurementPayments,
  getOutstandingPayables,
} from '../controllers/procurementPayment.controller';
import { uploadBon } from '../middleware/procurementUpload.middleware';

const router = Router();

// --- Stock Management ---
router.get('/products', InventoryController.getBranchProducts);
router.get('/stocks', InventoryController.getBranchStocks);
router.get('/mutations', InventoryController.getStockMutations);
router.post('/adjust', InventoryController.adjustStock);
router.post('/sync-prices', InventoryController.syncInventoryPrices);
router.post('/reconcile', InventoryController.reconcileInventoryStock);
router.post('/repair-stock', InventoryController.repairStockIntegrity);


// --- Stock Opname ---
router.get('/opname/session', InventoryController.getOrCreateOpnameSession);
router.get('/opname/products', InventoryController.getOpnameProducts);
router.post('/opname/item', InventoryController.addOrUpdateOpnameItem);
router.delete('/opname/item/:id', InventoryController.deleteOpnameItem);
router.post('/opname/finalize', InventoryController.finalizeOpname);
router.post('/opname/cancel', InventoryController.cancelOpname);
router.post('/opname/bulk-load', InventoryController.bulkLoadInventory);
router.post('/opname/import', InventoryController.importOpnameExcel);

// --- Procurement (PR/PO/GRN) ---
router.get('/procurement/outstanding-payables', getOutstandingPayables);
router.get('/procurement', ProcurementController.getProcurements);
router.get('/procurement/:id', ProcurementController.getProcurementById);
router.post('/procurement', ProcurementController.createProcurement);
router.patch('/procurement/:id', ProcurementController.updateProcurement);
router.patch('/procurement/:id/approve', ProcurementController.approveProcurement);
router.post('/procurement/:id/receive', ProcurementController.receiveGoods);
router.delete('/procurement/:id', ProcurementController.deleteProcurement);

// --- Procurement Payment (Bayar Hutang / Bon Tunai) ---
router.get('/procurement/:id/payments', getProcurementPayments);
router.post('/procurement/:id/pay', uploadBon.single('receiptFile'), payProcurement);
router.post('/procurement/:id/receive-cash', uploadBon.single('receiptFile'), receiveCash);

// --- Inter-branch Transfer ---
router.get('/transfer', TransferController.getTransfers);
router.post('/transfer/request', TransferController.requestTransfer);
router.patch('/transfer/:id/approve', TransferController.approveTransfer);
router.post('/transfer/:id/ship', TransferController.shipTransfer);
router.post('/transfer/:id/receive', TransferController.receiveTransfer);

export default router;
