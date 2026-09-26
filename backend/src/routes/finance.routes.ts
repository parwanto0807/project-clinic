import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import { 
  getInvoices, processPayment, getFinancialSummary, postInvoice, 
  resetInvoicePayment, updateInvoiceBank, getExpenses, createExpense, deleteExpense,
  getCashTransfers, createCashTransfer, updateCashTransfer, deleteCashTransfer, postCashTransfer,
  deleteInvoice, releaseDeposit
} from '../controllers/finance.controller'
import { uploadBon } from '../middleware/procurementUpload.middleware'
import { reconcileCommissions } from '../controllers/reconcile.controller'
import { OpeningBalanceController } from '../controllers/opening-balance.controller'
import corporateBillingRoutes from './corporateBilling.routes'

const financeRoutes = Router()

// All finance routes require authentication
financeRoutes.use(authMiddleware)

financeRoutes.use('/corporate-billing', corporateBillingRoutes)

// Opening Balance
financeRoutes.get('/opening-balance', OpeningBalanceController.getAll)
financeRoutes.post('/opening-balance', OpeningBalanceController.create)
financeRoutes.post('/opening-balance/:id/post', OpeningBalanceController.post)
financeRoutes.post('/opening-balance/:id/unpost', OpeningBalanceController.unpost)
financeRoutes.delete('/opening-balance/:id', OpeningBalanceController.delete)

financeRoutes.get('/invoices', getInvoices)
financeRoutes.delete('/invoices/:id', deleteInvoice)
financeRoutes.post('/payments', processPayment)
financeRoutes.post('/invoices/post-to-ledger', postInvoice)
financeRoutes.post('/invoices/:id/reset-payment', resetInvoicePayment)
financeRoutes.post('/invoices/:id/release-deposit', releaseDeposit)
financeRoutes.put('/invoices/bank', updateInvoiceBank)
financeRoutes.get('/summary', getFinancialSummary)
financeRoutes.post('/reconcile-commissions', reconcileCommissions)

// Expenses
financeRoutes.get('/expenses', getExpenses)
financeRoutes.post('/expenses', uploadBon.single('attachment'), createExpense)
financeRoutes.delete('/expenses/:id', deleteExpense)

// Cash Transfers
financeRoutes.get('/cash-transfers', getCashTransfers)
financeRoutes.post('/cash-transfers', createCashTransfer)
financeRoutes.put('/cash-transfers/:id', updateCashTransfer)
financeRoutes.delete('/cash-transfers/:id', deleteCashTransfer)
financeRoutes.post('/cash-transfers/:id/post', postCashTransfer)

export default financeRoutes
