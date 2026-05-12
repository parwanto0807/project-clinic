import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import { upload } from '../middleware/upload.middleware'
import {
  createReferral,
  getReferralsByMedicalRecord,
  getTemplates,
  createTemplate,
  uploadAttachment,
  deleteAttachment
} from '../controllers/clinical.controller'

const clinicalRoutes = Router()

// All clinical routes require authentication
clinicalRoutes.use(authMiddleware)

// Referrals
clinicalRoutes.post('/referrals', createReferral)
clinicalRoutes.get('/referrals/record/:id', getReferralsByMedicalRecord)

// Templates
clinicalRoutes.get('/templates', getTemplates)
clinicalRoutes.post('/templates', createTemplate)

// Attachments
clinicalRoutes.post('/attachments', upload.single('file'), uploadAttachment)
clinicalRoutes.delete('/attachments/:id', deleteAttachment)

export default clinicalRoutes
