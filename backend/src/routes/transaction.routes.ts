import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import { 
  createRegistration, 
  getQueues, 
  getQueueById,
  updateQueueStatus,
  reopenQueue
} from '../controllers/transaction.controller'
import { 
  saveNurseVitals, 
  saveDoctorConsultation, 
  getMedicalRecordByRegistration,
  getMedicalRecordsByPatient
} from '../controllers/medicalRecord.controller'
import {
  getAppointments,
  createAppointment,
  updateAppointmentStatus,
  updateAppointment,
  checkInAppointment,
  deleteAppointment
} from '../controllers/appointment.controller'

const router = Router()

// All transaction routes require authentication
router.use(authMiddleware)

// Registrasi & Antrian
router.post('/registrations', createRegistration)
router.get('/queues', getQueues)
router.get('/queues/:id', getQueueById)
router.patch('/queues/:id/status', updateQueueStatus)
router.post('/queues/:id/reopen', reopenQueue)

// Appointments
router.get('/appointments', getAppointments)
router.post('/appointments', createAppointment)
router.patch('/appointments/:id/status', updateAppointmentStatus)
router.put('/appointments/:id', updateAppointment)
router.post('/appointments/:id/check-in', checkInAppointment)
router.delete('/appointments/:id', deleteAppointment)

// Pemeriksaan Medis (2 Tahapan)
router.post('/medical-records/nurse', saveNurseVitals)
router.post('/medical-records/doctor', saveDoctorConsultation)
router.get('/medical-records/registration/:id', getMedicalRecordByRegistration)
router.get('/medical-records/patient/:id', getMedicalRecordsByPatient)

export default router
