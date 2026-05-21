import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  getTreatmentPlans,
  getTreatmentPlanById,
  createTreatmentPlan,
  addVisit,
  createInvoice,
  updateStatus,
  updateTreatmentPlan,
  deleteTreatmentPlan,
} from '../controllers/treatmentPlan.controller'

const router = Router()

// All routes require authentication
router.use(authMiddleware)

// CRUD Treatment Plans
router.get('/', getTreatmentPlans)
router.get('/:id', getTreatmentPlanById)
router.post('/', createTreatmentPlan)
router.put('/:id', updateTreatmentPlan)
router.delete('/:id', deleteTreatmentPlan)
router.patch('/:id/status', updateStatus)

// Visit Management
router.post('/:id/visits', addVisit)

// Invoice Management (Creates specific billing termin/DP)
router.post('/:id/invoices', createInvoice)

export default router
