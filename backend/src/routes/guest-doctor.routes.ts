import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  getGuestDoctorProfiles,
  createGuestDoctorProfile,
  updateGuestDoctorProfile,
  deleteGuestDoctorProfile,
  getGuestDoctorAssignments,
  createGuestDoctorAssignment,
  activateGuestDoctorAssignment,
  completeGuestDoctorAssignment,
  cancelGuestDoctorAssignment,
  getTodayActiveGuestDoctor,
  getGuestDoctorStatistics
} from '../controllers/guest-doctor.controller'

const guestDoctorRoutes = Router()

// All routes require authentication
guestDoctorRoutes.use(authMiddleware)

// Guest Doctor Profiles (Master Data)
guestDoctorRoutes.get('/profiles', getGuestDoctorProfiles)
guestDoctorRoutes.post('/profiles', createGuestDoctorProfile)
guestDoctorRoutes.put('/profiles/:id', updateGuestDoctorProfile)
guestDoctorRoutes.delete('/profiles/:id', deleteGuestDoctorProfile)

// Guest Doctor Assignments (Daily)
guestDoctorRoutes.get('/assignments', getGuestDoctorAssignments)
guestDoctorRoutes.post('/assignments', createGuestDoctorAssignment)
guestDoctorRoutes.put('/assignments/:id/activate', activateGuestDoctorAssignment)
guestDoctorRoutes.put('/assignments/:id/complete', completeGuestDoctorAssignment)
guestDoctorRoutes.put('/assignments/:id/cancel', cancelGuestDoctorAssignment)

// Get today's active guest doctor
guestDoctorRoutes.get('/assignments/today/active', getTodayActiveGuestDoctor)

// Statistics
guestDoctorRoutes.get('/statistics', getGuestDoctorStatistics)

export { guestDoctorRoutes }
