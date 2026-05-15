import { Router } from 'express'
import { getDoctorFeeReport, createManualCommission, payCommissions } from '../controllers/report.controller'
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware'

const router = Router()

// All report routes require authentication and appropriate roles
router.use(authMiddleware)

router.get('/doctor-fees', roleMiddleware(['SUPER_ADMIN', 'ADMIN', 'STAFF', 'ACCOUNTING']), getDoctorFeeReport)
router.post('/manual-commission', roleMiddleware(['SUPER_ADMIN', 'ADMIN', 'STAFF', 'ACCOUNTING']), createManualCommission)
router.post('/pay-commissions', roleMiddleware(['SUPER_ADMIN', 'ADMIN', 'STAFF', 'ACCOUNTING']), payCommissions)

export default router
