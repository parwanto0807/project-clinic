import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  getUsers, createUser, updateUser, deleteUser, getUnlinkedDoctorUsers,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getDoctors, createDoctor, updateDoctor, deleteDoctor,
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
  getServices, createService, updateService, deleteService, getNextServiceCode,
  getServiceCategories, createServiceCategory, updateServiceCategory, deleteServiceCategory,
  getMedicines, createMedicine, updateMedicine, deleteMedicine, syncMasterToMedicines,
  getExpenseCategories, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
  getProductMasters, createProductMaster, updateProductMaster, deleteProductMaster,
  getClinics, getClinicById, createClinic, updateClinic, deleteClinic,
  getAssets, createAsset, updateAsset, deleteAsset,
  getProductCategories, createProductCategory, updateProductCategory, deleteProductCategory,
  getInventoryProducts, createInventoryProduct, updateInventoryProduct, deleteInventoryProduct,
  getPatients, getPatientById, getNextMRNo, createPatient, updatePatient, deletePatient, importPatients
} from '../controllers/master.controller'
import { getCOAs, createCOA, updateCOA, deleteCOA, getCoaBalances } from '../controllers/coa.controller'
import { getBanks, createBank, updateBank, deleteBank } from '../controllers/bank.controller'
import { getSystemAccounts, updateSystemAccount, seedSystemAccounts } from '../controllers/systemAccount.controller'
import {
  getAllMaintenance, getAssetMaintenance, createAssetMaintenance, postMaintenanceToGL, updateAssetMaintenance, deleteAssetMaintenance,
  getAllAssetTransfers, getAssetTransfers, createAssetTransfer, approveAssetTransfer, rejectAssetTransfer,
  getAssetAuditLogs, getAssetInsurance, upsertAssetInsurance, deleteAssetInsurance, postAssetInsuranceToGL,
  getMaintenanceSchedule, getExpiringInsurance
} from '../controllers/assetManagement.controller'
import {
  depreciateAsset, depreciateAllAssets, disposeAsset, getAssetRegister, syncAssetOpeningBalance
} from '../controllers/assetFinance.controller'

import { upload, uploadDocument } from '../middleware/upload.middleware'

const masterRoutes = Router()

// All master routes require authentication
masterRoutes.use(authMiddleware)

// Users
masterRoutes.get('/users', getUsers)
masterRoutes.post('/users', createUser)
masterRoutes.put('/users/:id', updateUser)
masterRoutes.delete('/users/:id', deleteUser)
masterRoutes.get('/users/unlinked-doctors', getUnlinkedDoctorUsers)

// Departments
masterRoutes.get('/departments', getDepartments)
masterRoutes.post('/departments', createDepartment)
masterRoutes.put('/departments/:id', updateDepartment)
masterRoutes.delete('/departments/:id', deleteDepartment)

// Doctors
masterRoutes.get('/doctors', getDoctors)
masterRoutes.post('/doctors', upload.single('photo'), createDoctor)
masterRoutes.put('/doctors/:id', upload.single('photo'), updateDoctor)
masterRoutes.delete('/doctors/:id', deleteDoctor)

// Doctor Schedules
masterRoutes.get('/schedules', getSchedules)
masterRoutes.post('/schedules', createSchedule)
masterRoutes.put('/schedules/:id', updateSchedule)
masterRoutes.delete('/schedules/:id', deleteSchedule)

// Services
masterRoutes.get('/services', getServices)
masterRoutes.get('/services/next-code', getNextServiceCode)
masterRoutes.post('/services', createService)
masterRoutes.put('/services/:id', updateService)
masterRoutes.delete('/services/:id', deleteService)

// Service Categories
masterRoutes.get('/service-categories', getServiceCategories)
masterRoutes.post('/service-categories', createServiceCategory)
masterRoutes.put('/service-categories/:id', updateServiceCategory)
masterRoutes.delete('/service-categories/:id', deleteServiceCategory)

// Medicines
masterRoutes.get('/medicines', getMedicines)
masterRoutes.post('/medicines', upload.single('image'), createMedicine)
masterRoutes.post('/medicines/sync-master', syncMasterToMedicines)
masterRoutes.put('/medicines/:id', upload.single('image'), updateMedicine)
masterRoutes.delete('/medicines/:id', deleteMedicine)

// Expense Categories
masterRoutes.get('/expense-categories', getExpenseCategories)
masterRoutes.post('/expense-categories', createExpenseCategory)
masterRoutes.put('/expense-categories/:id', updateExpenseCategory)
masterRoutes.delete('/expense-categories/:id', deleteExpenseCategory)

// Product Master
masterRoutes.get('/products', getProductMasters)
masterRoutes.post('/products', upload.single('image'), createProductMaster)
masterRoutes.put('/products/:id', upload.single('image'), updateProductMaster)
masterRoutes.delete('/products/:id', deleteProductMaster)

// Clinics (Branches)
masterRoutes.get('/clinics', getClinics)
masterRoutes.get('/clinics/:id', getClinicById)
masterRoutes.post('/clinics', createClinic)
masterRoutes.put('/clinics/:id', updateClinic)
masterRoutes.delete('/clinics/:id', deleteClinic)

// Product Categories
masterRoutes.get('/product-categories', getProductCategories)
masterRoutes.post('/product-categories', createProductCategory)
masterRoutes.put('/product-categories/:id', updateProductCategory)
masterRoutes.delete('/product-categories/:id', deleteProductCategory)

// Assets
masterRoutes.get('/assets', getAssets)
masterRoutes.post('/assets', upload.single('image'), createAsset)
masterRoutes.put('/assets/:id', upload.single('image'), updateAsset)
masterRoutes.delete('/assets/:id', deleteAsset)

// Asset Maintenance
masterRoutes.get('/maintenance/all', getAllMaintenance)
masterRoutes.get('/assets/:id/maintenance', getAssetMaintenance)
masterRoutes.post('/assets/:id/maintenance', createAssetMaintenance)
masterRoutes.post('/assets/maintenance/:id/post', postMaintenanceToGL)
masterRoutes.put('/assets/maintenance/:maintenanceId', updateAssetMaintenance)
masterRoutes.delete('/assets/maintenance/:maintenanceId', deleteAssetMaintenance)

// Asset Transfers
masterRoutes.get('/assets/transfers/all', getAllAssetTransfers)
masterRoutes.get('/assets/:id/transfers', getAssetTransfers)
masterRoutes.post('/assets/:id/transfer', createAssetTransfer)
masterRoutes.put('/assets/transfer/:transferId/approve', approveAssetTransfer)
masterRoutes.put('/assets/transfer/:transferId/reject', rejectAssetTransfer)

// Asset Audit Logs
masterRoutes.get('/assets/:id/audit-logs', getAssetAuditLogs)

// Asset Insurance
masterRoutes.get('/assets/:id/insurance', getAssetInsurance)
masterRoutes.post('/assets/:id/insurance', upsertAssetInsurance)
masterRoutes.delete('/assets/:id/insurance', deleteAssetInsurance)
masterRoutes.post('/assets/:id/insurance/post-gl', postAssetInsuranceToGL)

// Asset Reports
masterRoutes.get('/assets/reports/maintenance-schedule', getMaintenanceSchedule)
masterRoutes.get('/assets/reports/expiring-insurance', getExpiringInsurance)

// Asset Finance
masterRoutes.post('/assets/:id/depreciate', depreciateAsset)
masterRoutes.post('/assets/depreciate-all', depreciateAllAssets)
masterRoutes.post('/assets/:id/dispose', disposeAsset)
masterRoutes.get('/assets/register', getAssetRegister)
masterRoutes.post('/assets/sync-opening-balance', syncAssetOpeningBalance)

// Inventory (Products)
masterRoutes.get('/inventory', getInventoryProducts)
masterRoutes.post('/inventory', upload.single('image'), createInventoryProduct)
masterRoutes.put('/inventory/:id', upload.single('image'), updateInventoryProduct)
masterRoutes.delete('/inventory/:id', deleteInventoryProduct)

// Patients
masterRoutes.get('/patients', getPatients)
masterRoutes.get('/patients/next-mr', getNextMRNo)
masterRoutes.post('/patients/import', uploadDocument.single('file'), importPatients)
masterRoutes.get('/patients/:id', getPatientById)
masterRoutes.post('/patients', createPatient)
masterRoutes.put('/patients/:id', updatePatient)
masterRoutes.delete('/patients/:id', deletePatient)

// Chart of Accounts (COA)
masterRoutes.get('/coa', getCOAs)
masterRoutes.get('/coa/balances', getCoaBalances)
masterRoutes.post('/coa', createCOA)
masterRoutes.put('/coa/:id', updateCOA)
masterRoutes.delete('/coa/:id', deleteCOA)

// Banks
masterRoutes.get('/banks', getBanks)
masterRoutes.post('/banks', createBank)
masterRoutes.put('/banks/:id', updateBank)
masterRoutes.delete('/banks/:id', deleteBank)

// System Accounts
masterRoutes.get('/system-accounts', getSystemAccounts)
masterRoutes.post('/system-accounts', updateSystemAccount)
masterRoutes.post('/system-accounts/seed', seedSystemAccounts)

export default masterRoutes
