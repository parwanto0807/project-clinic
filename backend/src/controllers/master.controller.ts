import { Request, Response } from 'express'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcrypt'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'
import { getPaginationOptions, PaginatedResult } from '../utils/pagination'
import { CacheService } from '../lib/cache'

import { prisma } from '../lib/prisma'

// ==================== USERS ====================
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { search, role, isActive } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const { skip, take, page, limit } = getPaginationOptions(req.query)

    const [total, users] = await Promise.all([
      prisma.user.count({ 
        where: {
          ...(search ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { email: { contains: String(search), mode: 'insensitive' } },
              { username: { contains: String(search), mode: 'insensitive' } },
            ]
          } : {}),
          ...(role ? { role: role as Role } : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
          ...(!isAdminView ? { clinics: { some: { clinicId: currentClinicId } } } : {})
        }
      }),
      prisma.user.findMany({
        where: {
          ...(search ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { email: { contains: String(search), mode: 'insensitive' } },
              { username: { contains: String(search), mode: 'insensitive' } },
            ]
          } : {}),
          ...(role ? { role: role as Role } : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
          ...(!isAdminView ? { clinics: { some: { clinicId: currentClinicId } } } : {})
        },
        select: {
          id: true, email: true, username: true, name: true,
          phone: true, role: true, isActive: true, lastLogin: true,
          createdAt: true, updatedAt: true,
          clinics: {
            select: {
              clinic: {
                select: { id: true, name: true, code: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ])

    const result: PaginatedResult<any> = {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, username, password, name, phone, role, clinicIds } = req.body
    const hashed = await bcrypt.hash(password, 10)
    
    // Default clinic if none provided (fall back to current context)
    const targetClinicIds = (clinicIds && Array.isArray(clinicIds) && clinicIds.length > 0) 
      ? clinicIds 
      : [(req as any).clinicId]

    const user = await prisma.user.create({
      data: { 
        email, username, password: hashed, name, phone, role: role as Role,
        clinics: {
          create: targetClinicIds.map((id: string) => ({ clinicId: id }))
        }
      },
      include: {
        clinics: { include: { clinic: true } }
      }
    })
    
    const { password: _, ...userNoPass } = user
    res.status(201).json(userNoPass)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Email atau username sudah digunakan' })
    res.status(500).json({ message: e.message })
  }
}

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { email, username, password, name, phone, role, isActive, clinicIds } = req.body
    const data: any = { email, username, name, phone, role: role as Role, isActive }
    if (password) data.password = await bcrypt.hash(password, 10)
    
    // Sync clinics if provided
    if (clinicIds && Array.isArray(clinicIds)) {
      await prisma.userClinic.deleteMany({ where: { userId: id } })
      data.clinics = {
        create: clinicIds.map((cid: string) => ({ clinicId: cid }))
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      include: {
        clinics: { include: { clinic: true } }
      }
    })
    
    const { password: _, ...userNoPass } = user
    res.json(userNoPass)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

export const deleteUser = async (req: Request, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ message: 'User berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const getUnlinkedDoctorUsers = async (req: Request, res: Response) => {
  try {
    const currentClinicId = (req as any).clinicId
    const currentUser = (req as any).user

    // Check if Pusat Admin or Super Admin
    let isAdminView = currentUser.role === 'SUPER_ADMIN'
    if (!isAdminView && currentUser.role === 'ADMIN') {
      const currentClinic = await prisma.clinic.findUnique({ where: { id: currentClinicId } })
      if (currentClinic?.isMain) {
        isAdminView = true
      }
    }

    const users = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        doctor: null, // Filter for users NOT yet in doctors table
        ...(!isAdminView ? { clinics: { some: { clinicId: currentClinicId } } } : {})
      },
      select: { id: true, name: true, username: true }
    })
    res.json(users)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// Recursive helper function for hierarchical department sorting
const flattenDepartments = (depts: any[], parentId: string | null = null): any[] => {
  let result: any[] = []
  const currentLevel = depts.filter(d => d.parentId === parentId)
  
  // Sort siblings by sortOrder then name
  currentLevel.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))

  for (const dept of currentLevel) {
    result.push(dept)
    const children = flattenDepartments(depts, dept.id)
    result = [...result, ...children]
  }
  return result
}

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const { search, parentId, allClinics, clinicId, minimal } = req.query
    const currentClinicId = (req as any).clinicId
    const currentUser = (req as any).user

    // Check if Pusat Admin or Super Admin
    let isAdminView = currentUser.role === 'SUPER_ADMIN'
    if (!isAdminView && currentUser.role === 'ADMIN') {
      const currentClinic = await prisma.clinic.findUnique({ where: { id: currentClinicId } })
      if (currentClinic?.isMain) {
        isAdminView = true
      }
    }

    // Determine target clinic:
    // 1. Explicit clinicId in query takes precedence
    // 2. Otherwise use currentClinicId if NOT in Admin View
    // 3. undefined if Admin View and no clinicId provided (shows all)
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)

    // Overrule if allClinics explicitly requested by admin
    const shouldShowAllClinics = isAdminView && (allClinics === 'true' || !clinicId)

    const isMinimal = minimal === 'true' || minimal === '1'

    // Fetch all needed data
    let departments = await prisma.department.findMany({
      where: {
        ...(targetClinicId ? { 
           OR: [
             { clinicId: targetClinicId },
             { clinicId: null }
           ] 
        } : {}),
        ...(search ? { name: { contains: String(search), mode: 'insensitive' } } : {}),
        ...(parentId !== undefined && parentId !== 'all' ? { parentId: parentId === 'null' ? null : String(parentId) } : {}),
      },
      ...((isMinimal
        ? { select: { id: true, name: true, clinicId: true, parentId: true, level: true, sortOrder: true } }
        : {
            include: {
              clinic: { select: { id: true, name: true, code: true } },
              parent: { select: { id: true, name: true } },
              head: { select: { id: true, name: true } },
              _count: { select: { children: true } }
            }
          }) as any)
    })

    // If not searching, sort hierarchically
    if (!search && (parentId === undefined || parentId === 'all')) {
      departments = flattenDepartments(departments)
    } else {
      // Basic sort for searched results
      departments.sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    }

    res.json(departments)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { name, description, isActive, parentId, sortOrder, code, location, phone, email, headId, color, icon, operatingHours } = req.body
    
    let level = 0
    const parsedParentId = (parentId === 'null' || parentId === '') ? null : parentId
    
    if (parsedParentId) {
      const parent = await prisma.department.findUnique({ where: { id: parsedParentId } })
      if (parent) level = parent.level + 1
    }

    const parsedHeadId = (headId === 'null' || headId === '') ? null : headId

    const dept = await prisma.department.create({ 
      data: { 
        name, description, 
        isActive: isActive === 'true' || isActive === true,
        parentId: parsedParentId, 
        level, 
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        code, location, phone, email, 
        headId: parsedHeadId, 
        color, icon, operatingHours,
        clinicId: req.body.clinicId === '' ? null : (req.body.clinicId || (req as any).clinicId)
      } 
    })
    res.status(201).json(dept)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, description, isActive, parentId, sortOrder, code, location, phone, email, headId, color, icon, operatingHours } = req.body
    
    let level = 0
    const parsedParentId = (parentId === 'null' || parentId === '') ? null : parentId

    if (parsedParentId) {
      const parent = await prisma.department.findUnique({ where: { id: parsedParentId } })
      if (parent) level = parent.level + 1
    }

    const parsedHeadId = (headId === 'null' || headId === '') ? null : headId

    const dept = await prisma.department.update({ 
      where: { id }, 
      data: { 
        name, description, 
        isActive: isActive === 'true' || isActive === true, 
        parentId: parsedParentId, 
        level, 
        sortOrder: sortOrder ? Number(sortOrder) : 0, 
        code, location, phone, email, 
        headId: parsedHeadId, 
        color, icon, operatingHours,
        clinicId: req.body.clinicId === '' ? null : (req.body.clinicId || undefined)
      } 
    })
    res.json(dept)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } })
    res.json({ message: 'Departemen berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== DOCTORS ====================
export const getDoctors = async (req: Request, res: Response) => {
  try {
    const { search, specialization, isActive, departmentId, clinicId, minimal } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    // If clinicId is explicitly passed in query, use it. 
    // Otherwise, if not admin view, use the session's currentClinicId.
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)

    const isMinimal = minimal === 'true' || minimal === '1'

    const doctors = await prisma.doctor.findMany({
      where: {
        ...(targetClinicId ? { 
          OR: [
            { departments: { some: { clinicId: targetClinicId } } },
            { user: { clinics: { some: { clinicId: targetClinicId } } } }
          ]
        } : {}),
        ...(search ? {
          OR: [
            { name: { contains: String(search), mode: 'insensitive' } },
            { specialization: { contains: String(search), mode: 'insensitive' } },
            { licenseNumber: { contains: String(search), mode: 'insensitive' } },
          ]
        } : {}),
        ...(specialization ? { specialization: { contains: String(specialization), mode: 'insensitive' } } : {}),
        ...(departmentId ? { departments: { some: { id: String(departmentId) } } } : {}),
        ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      },
      ...((isMinimal
        ? {
            select: {
              id: true,
              name: true,
              specialization: true,
              departments: { select: { id: true, name: true } }
            }
          }
        : {
            include: {
              departments: { include: { clinic: true } },
              user: { select: { id: true, username: true } }
            }
          }) as any),
      orderBy: { name: 'asc' },
    })
    res.json(doctors)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// Helper to process and save doctor photo as WebP
const processDoctorPhoto = async (file: Express.Multer.File): Promise<string> => {
  const fileName = `doctor-${Date.now()}.webp`
  const uploadDir = path.join(process.cwd(), 'public/uploads/doctors')
  
  // Ensure directory exists
  await fs.mkdir(uploadDir, { recursive: true })
  
  const filePath = path.join(uploadDir, fileName)
  
  await sharp(file.buffer)
    .resize(500, 500, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(filePath)
    
  return `/uploads/doctors/${fileName}`
}

export const createDoctor = async (req: Request, res: Response) => {
  try {
    const { userId, licenseNumber, name, email, phone, specialization, departmentIds, clinicIds, bio, yearsOfExperience, isActive, queueCode } = req.body
    
    let profilePicture = null
    if (req.file) {
      profilePicture = await processDoctorPhoto(req.file)
    }

    const deptIds = Array.isArray(departmentIds) ? departmentIds : (departmentIds ? JSON.parse(departmentIds) : [])
    const cIds = Array.isArray(clinicIds) ? clinicIds : (clinicIds ? JSON.parse(clinicIds) : [])

    const doctor = await prisma.doctor.create({ 
      data: { 
        userId, licenseNumber, name, email, phone, specialization, bio, profilePicture,
        yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined, 
        isActive: isActive === 'true' || isActive === true,
        queueCode,
        departments: {
          connect: deptIds.map((id: string) => ({ id }))
        }
      } 
    })

    // Sync UserClinic
    if (cIds.length > 0) {
      await prisma.userClinic.deleteMany({ where: { userId } })
      await prisma.userClinic.createMany({
        data: cIds.map((cid: string) => ({ userId, clinicId: cid })),
        skipDuplicates: true
      })
    }

    res.status(201).json(doctor)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Nomor SIP atau email dokter sudah terdaftar' })
    res.status(500).json({ message: e.message })
  }
}

export const updateDoctor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { licenseNumber, name, email, phone, specialization, departmentIds, clinicIds, bio, yearsOfExperience, isActive, queueCode } = req.body
    
    let updateData: any = { 
      licenseNumber, name, email, phone, specialization, bio, 
      yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined, 
      isActive: isActive === 'true' || isActive === true,
      queueCode
    }

    if (req.file) {
      updateData.profilePicture = await processDoctorPhoto(req.file)
    }

    const deptIds = Array.isArray(departmentIds) ? departmentIds : (departmentIds ? JSON.parse(departmentIds) : [])
    const cIds = Array.isArray(clinicIds) ? clinicIds : (clinicIds ? JSON.parse(clinicIds) : [])

    if (deptIds.length > 0 || Array.isArray(departmentIds)) {
      updateData.departments = {
        set: deptIds.map((id: string) => ({ id }))
      }
    }

    const doctor = await prisma.doctor.update({ 
      where: { id }, 
      data: updateData 
    })

    // Sync UserClinic
    if (cIds.length > 0 || Array.isArray(clinicIds)) {
      await prisma.userClinic.deleteMany({ where: { userId: doctor.userId } })
      await prisma.userClinic.createMany({
        data: cIds.map((cid: string) => ({ userId: doctor.userId, clinicId: cid })),
        skipDuplicates: true
      })
    }

    res.json(doctor)
  } catch (e: any) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteDoctor = async (req: Request, res: Response) => {
  try {
    await prisma.doctor.delete({ where: { id: req.params.id } })
    res.json({ message: 'Dokter berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== DOCTOR SCHEDULES ====================
export const getSchedules = async (req: Request, res: Response) => {
  try {
    const { doctorId, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    // Explicit clinicId from query takes precedence, otherwise use session-based clinicId for non-admins
    const targetClinicId = clinicId ? String(clinicId) : (isAdminView ? undefined : currentClinicId)

    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        ...(targetClinicId ? { clinicId: targetClinicId } : {}),
        ...(doctorId ? { doctorId: String(doctorId) } : {}),
      },
      include: { 
        doctor: { select: { name: true, specialization: true, profilePicture: true } },
        clinic: { select: { name: true, code: true } }
      },
      orderBy: { dayOfWeek: 'asc' },
    })
    res.json(schedules)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createSchedule = async (req: Request, res: Response) => {
  try {
    const schedule = await prisma.doctorSchedule.create({
      data: {
        ...req.body,
        clinicId: (req as any).clinicId
      },
      include: { doctor: { select: { name: true, specialization: true } } },
    })
    res.status(201).json(schedule)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const updateSchedule = async (req: Request, res: Response) => {
  try {
    const schedule = await prisma.doctorSchedule.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        clinicId: (req as any).clinicId
      },
      include: { doctor: { select: { name: true, specialization: true } } },
    })
    res.json(schedule)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteSchedule = async (req: Request, res: Response) => {
  try {
    await prisma.doctorSchedule.delete({ where: { id: req.params.id } })
    res.json({ message: 'Jadwal berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== SERVICES ====================
export const getServices = async (req: Request, res: Response) => {
  try {
    const { search, categoryId, isActive, clinicId, allClinics } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const targetClinicId = clinicId ? String(clinicId) : currentClinicId
    const shouldShowAllClinics = allClinics === 'true'

    const services = await prisma.service.findMany({
      where: {
        ...(!isAdminView && !shouldShowAllClinics ? {
          OR: [
            { clinicId: targetClinicId },
            { clinic: { isMain: true } },
            { clinicId: null }
          ]
        } : {}),
        ...(search ? {
          OR: [
            { serviceName: { contains: String(search), mode: 'insensitive' } },
            { serviceCode: { contains: String(search), mode: 'insensitive' } },
          ]
        } : {}),
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
        ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      },
      include: { serviceCategory: true, coa: true },
      orderBy: { serviceName: 'asc' },
    })
    res.json(services)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createService = async (req: Request, res: Response) => {
  try {
    const { coaId, categoryId, ...rest } = req.body
    const service = await prisma.service.create({ 
      data: { 
        ...rest,
        coaId: coaId || null,
        categoryId: categoryId || null,
        clinicId: (req as any).clinicId
      } 
    })
    res.status(201).json(service)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Kode layanan sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { coaId, categoryId, ...rest } = req.body
    const service = await prisma.service.update({ 
      where: { id }, 
      data: {
        ...rest,
        coaId: coaId || null,
        categoryId: categoryId || null
      } 
    })
    res.json(service)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteService = async (req: Request, res: Response) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id } })
    res.json({ message: 'Layanan berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const getNextServiceCode = async (req: Request, res: Response) => {
  try {
    const lastService = await prisma.service.findFirst({
      where: { clinicId: (req as any).clinicId },
      orderBy: { serviceCode: 'desc' },
    })

    let nextNumber = 1
    if (lastService && lastService.serviceCode) {
      const match = lastService.serviceCode.match(/(\d+)$/)
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1
      }
    }

    const nextCode = `SVC-${nextNumber.toString().padStart(4, '0')}`
    res.json({ nextCode })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== SERVICE CATEGORIES ====================
export const getServiceCategories = async (req: Request, res: Response) => {
  try {
    const { search } = req.query
    const cats = await prisma.serviceCategory.findMany({
      where: search ? { categoryName: { contains: String(search), mode: 'insensitive' } } : {},
      include: { 
        _count: { 
          select: { services: { where: { clinicId: (req as any).clinicId } } } 
        } 
      },
      orderBy: { categoryName: 'asc' },
    })
    res.json(cats)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createServiceCategory = async (req: Request, res: Response) => {
  try {
    const cat = await prisma.serviceCategory.create({ data: req.body })
    res.status(201).json(cat)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Nama kategori sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updateServiceCategory = async (req: Request, res: Response) => {
  try {
    const cat = await prisma.serviceCategory.update({ where: { id: req.params.id }, data: req.body })
    res.json(cat)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteServiceCategory = async (req: Request, res: Response) => {
  try {
    await prisma.serviceCategory.delete({ where: { id: req.params.id } })
    res.json({ message: 'Kategori berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== MEDICINES ====================
// Helper to process and save medicine photo as WebP
const processMedicinePhoto = async (file: Express.Multer.File): Promise<string> => {
  const fileName = `medicine-${Date.now()}.webp`
  const uploadDir = path.join(process.cwd(), 'public/uploads/medicines')
  
  // Ensure directory exists
  await fs.mkdir(uploadDir, { recursive: true })
  
  const filePath = path.join(uploadDir, fileName)
  
  await sharp(file.buffer)
    .resize(500, 500, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(filePath)
    
  return `/uploads/medicines/${fileName}`
}

export const getMedicines = async (req: Request, res: Response) => {
  try {
    const { search, isActive, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const targetClinicId = isAdminView
      ? (clinicId === 'all' ? undefined : (clinicId ? String(clinicId) : undefined))
      : currentClinicId

    const medicines = await prisma.medicine.findMany({
      where: {
        AND: [
          ...(targetClinicId ? [{
            OR: [
              { clinicId: targetClinicId },
              { clinicId: null }
            ]
          }] : []),
          ...(search ? [{
            OR: [
              { medicineName: { contains: String(search), mode: 'insensitive' as "insensitive" } },
              { genericName: { contains: String(search), mode: 'insensitive' as "insensitive" } },
              { description: { contains: String(search), mode: 'insensitive' as "insensitive" } },
            ]
          }] : []),
          ...(isActive !== undefined ? [{ isActive: isActive === 'true' }] : []),
        ]
      },
      include: { 
        clinic: true,
        productMaster: {
          include: {
            products: {
              where: targetClinicId ? { clinicId: targetClinicId } : {},
              include: { clinic: true }
            }
          }
        } 
      },
      orderBy: { medicineName: 'asc' },
    })

    // Map to unified stock format using synced quantity field and reserved calculation
    const allProdIds = medicines.flatMap(m => m.productMaster?.products?.map(p => p.id) || [])
    const stockRecs = await prisma.inventoryStock.findMany({
      where: { 
         productId: { in: allProdIds },
         branchId: targetClinicId || undefined
      }
    })
    const reservedByProduct = stockRecs.reduce((acc, s) => {
      acc[s.productId] = (acc[s.productId] || 0) + (s.reservedQty || 0)
      return acc
    }, {} as Record<string, number>)

    const data = medicines.map(m => {
      const products = m.productMaster?.products || []
      const physicalStock = products.reduce((sum, p) => sum + (p.quantity || 0), 0)
      const reservedStock = products.reduce((sum, p) => sum + (reservedByProduct[p.id] || 0), 0)
      const totalAvailable = Math.max(0, physicalStock - reservedStock)
      const primaryProduct = products[0]
      
      const primaryReserved = primaryProduct ? (reservedByProduct[primaryProduct.id] || 0) : 0
      
      return {
        ...m,
        totalStock: physicalStock,
        stock: targetClinicId && primaryProduct ? Math.max(0, primaryProduct.quantity - primaryReserved) : totalAvailable,
        availableStock: totalAvailable,
        unit: primaryProduct?.usedUnit || primaryProduct?.unit || 'Unit'
      }
    })

    res.json(data)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createMedicine = async (req: Request, res: Response) => {
  try {
    const { isActive, masterProductId, ...rest } = req.body
    
    let image = null
    if (req.file) {
      image = await processMedicinePhoto(req.file)
    }

    const med = await prisma.medicine.create({ 
      data: { 
        ...rest, 
        image,
        isActive: isActive === 'true' || isActive === true,
        clinicId: req.body.clinicId || (req as any).clinicId
      } 
    })
    
    // LINK TO MASTER: If masterProductId is provided, link it. Otherwise create one.
    try {
      if (masterProductId) {
        await prisma.productMaster.update({
          where: { id: masterProductId },
          data: { medicineId: med.id }
        })
      } else {
        // Fallback: Create Product Master entry for this medicine if none provided
        let category = await prisma.productCategory.findUnique({ where: { categoryName: 'Medicine' } })
        if (!category) {
          category = await prisma.productCategory.create({ 
            data: { categoryName: 'Medicine', description: 'Kategori otomatis untuk obat-obatan klinis' } 
          })
        }

        await prisma.productMaster.create({
          data: {
            masterCode: `MED-${Date.now().toString().slice(-6)}`,
            masterName: med.medicineName,
            description: med.description,
            image: med.image,
            categoryId: category.id,
            medicineId: med.id,
            isActive: med.isActive
          }
        })
      }
    } catch (syncError) {
      console.error('Failed to link/sync medicine to product master:', syncError)
    }

    res.status(201).json(med)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const updateMedicine = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { 
      isActive, 
      masterProductId, 
      medicineCode, // Strip 
      clinic, 
      productMaster, 
      createdAt, 
      updatedAt, 
      ...rest 
    } = req.body
    
    let image = req.body.image
    if (req.file) {
      image = await processMedicinePhoto(req.file)
    }

    const med = await prisma.medicine.update({ 
      where: { id }, 
      data: {
        ...rest,
        image,
        isActive: isActive === 'true' || isActive === true
      } 
    })

    // AUTO-SYNC: Update linked Product Master and propagate to clinic products
    try {
      const pm = await prisma.productMaster.findFirst({ where: { medicineId: id } })
      if (pm) {
        await prisma.productMaster.update({
          where: { id: pm.id },
          data: {
            masterName: med.medicineName,
            description: med.description,
            image: med.image,
            isActive: med.isActive
          }
        });

        await prisma.product.updateMany({
          where: { masterProductId: pm.id },
          data: {
            productName: med.medicineName,
            description: med.description,
            isActive: med.isActive
          }
        });
      }
    } catch (syncError) {
      console.error('Failed to sync medicine update:', syncError)
    }

    res.json(med)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteMedicine = async (req: Request, res: Response) => {
  try {
    await prisma.medicine.delete({ where: { id: req.params.id } })
    res.json({ message: 'Obat berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== EXPENSE CATEGORIES ====================
export const getExpenseCategories = async (req: Request, res: Response) => {
  try {
    const { search } = req.query
    const cats = await prisma.expenseCategory.findMany({
      where: search ? { categoryName: { contains: String(search), mode: 'insensitive' } } : {},
      include: { 
        coa: true,
        _count: { 
          select: { expenses: { where: { clinicId: (req as any).clinicId } } } 
        } 
      },
      orderBy: { categoryName: 'asc' },
    })
    res.json(cats)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createExpenseCategory = async (req: Request, res: Response) => {
  try {
    const { categoryName, description, coaId } = req.body
    if (!categoryName) return res.status(400).json({ message: 'Nama kategori wajib diisi' })
    if (!coaId) return res.status(400).json({ message: 'Akun COA wajib dipilih agar pengeluaran bisa masuk ke Buku Besar' })

    const cat = await prisma.expenseCategory.create({
      data: { categoryName, description, coaId, isActive: true },
      include: { coa: { select: { code: true, name: true } } }
    })
    res.status(201).json(cat)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Nama kategori sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updateExpenseCategory = async (req: Request, res: Response) => {
  try {
    const cat = await prisma.expenseCategory.update({ where: { id: req.params.id }, data: req.body })
    res.json(cat)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteExpenseCategory = async (req: Request, res: Response) => {
  try {
    await prisma.expenseCategory.delete({ where: { id: req.params.id } })
    res.json({ message: 'Kategori berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== PRODUCT MASTER ====================
export const getProductMasters = async (req: Request, res: Response) => {
  try {
    const { search, categoryId, isActive, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    // SECURITY: Enforce clinic filtering for non-authorized users
    const targetClinicId = isAdminView
      ? (clinicId === 'all' ? undefined : (clinicId ? String(clinicId) : undefined))
      : currentClinicId

    const { skip, take, page, limit } = getPaginationOptions(req.query)

    const where: any = {
      ...(search ? {
        OR: [
          { masterName: { contains: String(search), mode: 'insensitive' } },
          { masterCode: { contains: String(search), mode: 'insensitive' } },
          { sku: { contains: String(search), mode: 'insensitive' } }
        ]
      } : {}),
      ...(categoryId ? { categoryId: String(categoryId) } : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    }

    const [total, results] = await Promise.all([
      prisma.productMaster.count({ where }),
      prisma.productMaster.findMany({
        where,
        include: { 
          productCategory: true,
          medicine: true,
          compoundFormula: true, // Include compound formula info
          products: { 
            where: targetClinicId ? { clinicId: targetClinicId } : {},
            include: { clinic: true }
          }
        },
        orderBy: [
          { productCategory: { categoryName: 'asc' } },
          { masterName: 'asc' }
        ],
        skip,
        take
      })
    ])
    
    // Aggregation of physical and available stock (Reserved subtraction)
    const allProdIds = results.flatMap(p => p.products?.map(bp => bp.id) || [])
    const stockRecs = await prisma.inventoryStock.findMany({
      where: { 
        productId: { in: allProdIds },
        branchId: targetClinicId || undefined
      }
    })
    const reservedByProduct = stockRecs.reduce((acc, s) => {
      acc[s.productId] = (acc[s.productId] || 0) + (s.reservedQty || 0)
      return acc
    }, {} as Record<string, number>)

    const data = results.map(p => {
      const branchProducts = p.products || []
      const physicalStock = branchProducts.reduce((sum, bp) => sum + (bp.quantity || 0), 0)
      const reservedStock = branchProducts.reduce((sum, bp) => sum + (reservedByProduct[bp.id] || 0), 0)
      const totalAvailable = Math.max(0, physicalStock - reservedStock)
      const primaryProduct = branchProducts[0]

      const primaryReserved = primaryProduct ? (reservedByProduct[primaryProduct.id] || 0) : 0
      
      return {
        ...p,
        compoundFormulaId: p.compoundFormulaId || null, // Explicitly include for frontend
        totalStock: physicalStock,
        stock: targetClinicId && primaryProduct ? Math.max(0, primaryProduct.quantity - primaryReserved) : totalAvailable,
        availableStock: totalAvailable,
        unit: primaryProduct?.usedUnit || primaryProduct?.unit || p.defaultUnit || 'Unit'
      }
    })

    const result: PaginatedResult<any> = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createProductMaster = async (req: Request, res: Response) => {
  try {
    const data = { ...req.body }
    
    // 1. Handle Image
    if (req.file) {
      data.image = `/uploads/${req.file.filename}`
    }

    // 2. Parse Numbers
    if (data.purchasePrice) data.purchasePrice = parseFloat(data.purchasePrice)
    if (data.sellingPrice) data.sellingPrice = parseFloat(data.sellingPrice)
    if (data.minStock) data.minStock = parseInt(data.minStock)
    if (data.reorderPoint) data.reorderPoint = parseInt(data.reorderPoint)
    
    // 3. Handle Boolean
    if (data.isActive !== undefined) {
      data.isActive = data.isActive === 'true' || data.isActive === true
    }

    const product = await prisma.productMaster.create({ 
      data,
      include: { productCategory: true }
    })
    res.status(201).json(product)
  } catch (e: any) {
    console.error('Create Product Master Error:', e)
    if (e.code === 'P2002') return res.status(400).json({ message: 'Kode master atau SKU sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updateProductMaster = async (req: Request, res: Response) => {
  try {
    const data = { ...req.body }
    
    // 1. Handle Image
    if (req.file) {
      data.image = `/uploads/${req.file.filename}`
    }

    // 2. Parse Numbers
    if (data.purchasePrice) data.purchasePrice = parseFloat(data.purchasePrice)
    if (data.sellingPrice) data.sellingPrice = parseFloat(data.sellingPrice)
    if (data.minStock) data.minStock = parseInt(data.minStock)
    if (data.reorderPoint) data.reorderPoint = parseInt(data.reorderPoint)

    // 3. Handle Boolean
    if (data.isActive !== undefined) {
      data.isActive = data.isActive === 'true' || data.isActive === true
    }

    const product = await prisma.productMaster.update({ 
      where: { id: req.params.id }, 
      data,
      include: { productCategory: true }
    })

    // AUTO-SYNC: Push changes to all linked branch products
    try {
      const syncData: any = {}
      if (data.purchasePrice !== undefined) syncData.purchasePrice = data.purchasePrice
      if (data.sellingPrice !== undefined) syncData.sellingPrice = data.sellingPrice
      if (data.masterName !== undefined) syncData.productName = data.masterName
      if (data.description !== undefined) syncData.description = data.description
      if (data.isActive !== undefined) syncData.isActive = data.isActive

      if (Object.keys(syncData).length > 0) {
        await prisma.product.updateMany({
          where: { masterProductId: product.id },
          data: syncData
        })
      }
    } catch (syncError) {
      console.error('Failed to sync ProductMaster changes to branch products:', syncError)
    }

    res.json(product)
  } catch (e: any) {
    console.error('Update Product Master Error:', e)
    res.status(500).json({ message: e.message })
  }
}

export const deleteProductMaster = async (req: Request, res: Response) => {
  try {
    await prisma.productMaster.delete({ where: { id: req.params.id } })
    res.json({ message: 'Master produk berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== CLINICS (BRANCHES) ====================
export const getClinics = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query
    const cacheKey = `clinics:${JSON.stringify(req.query)}`

    const result = await CacheService.getOrSet(cacheKey, async () => {
      return await prisma.clinic.findMany({
        where: {
          ...(search ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { code: { contains: String(search), mode: 'insensitive' } },
              { address: { contains: String(search), mode: 'insensitive' } },
            ]
          } : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
        },
        include: {
          _count: {
            select: {
              users: true,
              departments: true,
            }
          }
        },
        orderBy: { code: 'asc' }
      })
    }, 600) // 10 minutes cache

    res.json(result)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

export const createClinic = async (req: Request, res: Response) => {
  try {
    const { code } = req.body
    const existing = await prisma.clinic.findUnique({ where: { code } })
    if (existing) {
      return res.status(400).json({ message: `Kode Cabang "${code}" sudah digunakan.` })
    }

    const clinic = await prisma.clinic.create({ data: req.body })

    // CLONE DEPARTMENTS: Use the first clinic as template
    try {
      const templateClinic = await prisma.clinic.findFirst({
        where: { id: { not: clinic.id } },
        orderBy: { createdAt: 'asc' }
      })

      if (templateClinic) {
        const templateDepts = await prisma.department.findMany({
          where: { clinicId: templateClinic.id },
          orderBy: { level: 'asc' }
        })

        const idMap = new Map<string, string>()
        
        for (const dept of templateDepts) {
          const newDept = await prisma.department.create({
            data: {
              name: dept.name,
              description: dept.description,
              isActive: dept.isActive,
              sortOrder: dept.sortOrder,
              level: dept.level,
              clinicId: clinic.id,
              parentId: dept.parentId ? idMap.get(dept.parentId) : null
            }
          })
          idMap.set(dept.id, newDept.id)
        }
      }
    } catch (cloneError) {
      console.error('Failed to clone departments for new clinic:', cloneError)
      // We don't return 500 here because the clinic was already created successfully
    }

    CacheService.del('clinics:*'); // Invalidate all clinic caches
    res.status(201).json(clinic)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

export const updateClinic = async (req: Request, res: Response) => {
  try {
    const { code, isMain } = req.body
    
    if (code) {
      const existing = await prisma.clinic.findFirst({
        where: { code, NOT: { id: req.params.id } }
      })
      if (existing) {
        return res.status(400).json({ message: `Kode Cabang "${code}" sudah digunakan oleh cabang lain.` })
      }
    }

    // If setting as Main Clinic, unset others
    if (isMain) {
      await prisma.clinic.updateMany({
        where: { NOT: { id: req.params.id } },
        data: { isMain: false }
      })
    }

    const clinic = await prisma.clinic.update({
      where: { id: req.params.id },
      data: req.body
    })
    CacheService.del('clinics:*');
    res.json(clinic)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

export const deleteClinic = async (req: Request, res: Response) => {
  try {
    // Check for departments first
    const deptCount = await prisma.department.count({ where: { clinicId: req.params.id } })
    if (deptCount > 0) {
      return res.status(400).json({ message: 'Tidak dapat menghapus cabang yang masih memiliki departemen aktif.' })
    }

    await prisma.clinic.delete({ where: { id: req.params.id } })
    CacheService.del('clinics:*');
    res.json({ message: 'Cabang berhasil dihapus' })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

export const getClinicById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    console.log(`[Master Clinic] Fetching Clinic by ID: "${id}"`)
    const clinic = await prisma.clinic.findUnique({
      where: { id }
    })
    if (!clinic) {
      console.warn(`[Master Clinic] Clinic NOT FOUND: "${id}"`)
      return res.status(404).json({ message: 'Klinik tidak ditemukan' })
    }
    res.json(clinic)
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// ==================== ASSETS ====================

/**
 * Resolve COA akun aset berdasarkan assetType
 * equipment/clinical-device → 1-2101 Peralatan Medis
 * furniture/computer/other  → 1-2201 Inventaris & Furnitur
 * vehicle                   → 1-2201 Inventaris (atau bisa tambah COA kendaraan)
 * land/building             → 1-2301 Tanah & Bangunan
 */
async function resolveAssetCOA(assetType: string, clinicId: string) {
  let key = 'ASSET_INVENTORY' // default
  if (assetType === 'equipment' || assetType === 'clinical-device') key = 'ASSET_EQUIPMENT'
  if (assetType === 'land' || assetType === 'building') key = 'ASSET_LAND_BUILDING'

  const mapping = await prisma.systemAccount.findFirst({
    where: { key, OR: [{ clinicId }, { clinicId: null }] },
    include: { coa: true },
    orderBy: { clinicId: 'desc' }
  })
  const coa = mapping?.coa || null

  const depMapping = await prisma.systemAccount.findFirst({
    where: { key: 'ACCUM_DEP_GENERAL', OR: [{ clinicId }, { clinicId: null }] },
    include: { coa: true },
    orderBy: { clinicId: 'desc' }
  })
  const accumDep = depMapping?.coa || null

  return { coa, accumDep }
}

// Helper to process and save asset photo as WebP
const processAssetPhoto = async (file: Express.Multer.File): Promise<string> => {
  const fileName = `asset-${Date.now()}.webp`
  const uploadDir = path.join(process.cwd(), 'public/uploads/assets')
  
  // Ensure directory exists
  await fs.mkdir(uploadDir, { recursive: true })
  
  const filePath = path.join(uploadDir, fileName)
  
  await sharp(file.buffer)
    .resize(500, 500, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(filePath)
    
  return `/uploads/assets/${fileName}`
}

export const getAssets = async (req: Request, res: Response) => {
  try {
    const { search, category, status, clinicId } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    // 'all' means show everything (only for admins).
    // If clinicId is not provided, default to currentClinicId (sidebar).
    const targetClinicId = isAdminView
      ? (clinicId === 'all' ? undefined : (clinicId ? String(clinicId) : currentClinicId))
      : currentClinicId

    const assets = await prisma.asset.findMany({
      where: {
        ...(targetClinicId ? { clinicId: targetClinicId } : {}),
        ...(search ? {
          OR: [
            { assetName: { contains: String(search), mode: 'insensitive' } },
            { assetCode: { contains: String(search), mode: 'insensitive' } },
            { manufacturer: { contains: String(search), mode: 'insensitive' } },
          ]
        } : {}),
        ...(category ? { category: String(category) } : {}),
        ...(status ? { status: String(status) } : {}),
      },
      include: {
        clinic: {
          select: { name: true, code: true }
        },
        masterProduct: {
          select: { id: true, masterName: true, masterCode: true, categoryId: true }
        },
        insurance: true
      },
      orderBy: { assetCode: 'asc' },
    })
    res.json(assets)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createAsset = async (req: Request, res: Response) => {
  try {
    const { purchasePrice, purchaseDate, currentValue, salvageValue, usefulLifeYears,
            depreciationMethod, clinic, masterProduct, id, createdAt, updatedAt, ...otherData } = req.body
    const clinicId = req.body.clinicId || (req as any).clinicId

    let image = null
    if (req.file) {
      image = await processAssetPhoto(req.file)
    }

    const price = purchasePrice ? Number(purchasePrice) : 0
    const salvage = salvageValue ? Number(salvageValue) : 0
    const lifeYears = usefulLifeYears ? Number(usefulLifeYears) : 5

    // Resolve COA berdasarkan tipe aset
    const { coa: assetCoa, accumDep: accumDepCoa } = await resolveAssetCOA(otherData.assetType || 'equipment', clinicId)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Buat record aset
      const asset = await tx.asset.create({
        data: {
          ...otherData,
          image,
          purchasePrice: price,
          salvageValue: salvage,
          usefulLifeYears: lifeYears,
          depreciationMethod: depreciationMethod || 'STRAIGHT_LINE',
          currentValue: req.body.currentValue ? Number(req.body.currentValue) : price,
          totalDepreciated: req.body.totalDepreciated ? Number(req.body.totalDepreciated) : 0,
          coaAssetId: assetCoa?.id || null,
          coaAccumDepId: accumDepCoa?.id || null,
          purchaseDate: (() => {
            if (!purchaseDate) return new Date()
            const d = new Date(purchaseDate)
            return isNaN(d.getTime()) ? new Date() : d
          })(),
          clinicId,
          masterProductId: req.body.masterProductId || undefined
        } as any,
        include: { masterProduct: true, clinic: true }
      })

      // 2. Buat jurnal GL pembelian aset (jika ada COA dan harga > 0)
      if (assetCoa && price > 0) {
        // Resolve sumber dana (default: Kas Kecil, bisa dikonfigurasi)
        const cashCoa = await tx.systemAccount.findFirst({
          where: { key: 'CASH_ACCOUNT', OR: [{ clinicId }, { clinicId: null }] },
          include: { coa: true },
          orderBy: { clinicId: 'desc' }
        })
        const creditCoa = cashCoa?.coa || await tx.chartOfAccount.findFirst({
          where: { code: '1-1101', OR: [{ clinicId }, { clinicId: null }] }
        })

        if (creditCoa) {
          await tx.journalEntry.create({
            data: {
              date: purchaseDate ? new Date(`${purchaseDate}T00:00:00+07:00`) : new Date(),
              description: `Pembelian Aset: ${otherData.assetName} (${asset.assetCode})`,
              referenceNo: `ASSET-${asset.assetCode}`,
              entryType: 'SYSTEM',
              clinicId,
              details: {
                create: [
                  {
                    coaId: assetCoa.id,
                    debit: price,
                    credit: 0,
                    description: `Aset Tetap: ${otherData.assetName}`
                  },
                  {
                    coaId: creditCoa.id,
                    debit: 0,
                    credit: price,
                    description: `Pembayaran Aset: ${asset.assetCode}`
                  }
                ]
              }
            }
          })
        }
      }

      return asset
    })

    res.status(201).json(result)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Kode aset sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updateAsset = async (req: Request, res: Response) => {
  try {
    const { 
      purchasePrice, purchaseDate, currentValue, salvageValue, usefulLifeYears, totalDepreciated,
      clinic, masterProduct, id, createdAt, updatedAt, clinicId, ...otherData 
    } = req.body
    
    let image = req.body.image
    if (req.file) {
      image = await processAssetPhoto(req.file)
    }

    const asset = await prisma.asset.update({ 
      where: { id: req.params.id }, 
      data: {
        ...otherData,
        image,
        clinicId: clinicId || undefined,
        purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
        currentValue: currentValue ? Number(currentValue) : undefined,
        salvageValue: salvageValue ? Number(salvageValue) : undefined,
        usefulLifeYears: usefulLifeYears ? Number(usefulLifeYears) : undefined,
        totalDepreciated: totalDepreciated ? Number(totalDepreciated) : undefined,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
      },
      include: { masterProduct: true, clinic: true }
    })
    res.json(asset)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteAsset = async (req: Request, res: Response) => {
  try {
    await prisma.asset.delete({ where: { id: req.params.id } })
    res.json({ message: 'Aset berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== PRODUCT CATEGORIES ====================
export const getProductCategories = async (req: Request, res: Response) => {
  try {
    const { search } = req.query
    const cats = await prisma.productCategory.findMany({
      where: search ? { categoryName: { contains: String(search), mode: 'insensitive' } } : {},
      include: { 
        _count: { 
          select: { productMasters: true } 
        } 
      },
      orderBy: { categoryName: 'asc' },
    })
    res.json(cats)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createProductCategory = async (req: Request, res: Response) => {
  try {
    const cat = await prisma.productCategory.create({ data: req.body })
    res.status(201).json(cat)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Nama kategori sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updateProductCategory = async (req: Request, res: Response) => {
  try {
    const cat = await prisma.productCategory.update({ where: { id: req.params.id }, data: req.body })
    res.json(cat)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteProductCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // 1. Safety Check: Is it being used by any products?
    const productCount = await prisma.productMaster.count({
      where: { categoryId: id }
    })

    if (productCount > 0) {
      return res.status(400).json({ 
        message: `Kategori tidak dapat dihapus karena masih digunakan oleh ${productCount} produk. Silakan pindahkan atau hapus produk terlebih dahulu.` 
      })
    }

    await prisma.productCategory.delete({ where: { id } })
    res.json({ message: 'Kategori berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== INVENTORY (PRODUCTS) ====================
export const getInventoryProducts = async (req: Request, res: Response) => {
  try {
    const { search, categoryId, clinicId, isActive } = req.query
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    const masters = await prisma.productMaster.findMany({
      where: {
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
        ...(search ? {
          OR: [
            { masterName: { contains: String(search), mode: 'insensitive' } },
            { masterCode: { contains: String(search), mode: 'insensitive' } },
          ]
        } : {}),
        ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      },
      include: {
        productCategory: true,
        medicine: true,
      },
      orderBy: { masterName: 'asc' },
    })
    res.json(masters)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// Helper for inventory product image processing
const processProductPhoto = async (file: Express.Multer.File): Promise<string> => {
  const fileName = `product-${Date.now()}.webp`
  const uploadDir = path.join(process.cwd(), 'public/uploads/products')
  await fs.mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, fileName)
  await sharp(file.buffer).resize(500, 500, { fit: 'cover' }).webp({ quality: 80 }).toFile(filePath)
  return `/uploads/products/${fileName}`
}

export const createInventoryProduct = async (req: Request, res: Response) => {
  try {
    const { clinicIds, sku, productCode, ...rest } = req.body
    
    // 1. Fetch Master Info for Name Synchronization
    let masterName = rest.productName
    if (rest.masterProductId) {
      const pm = await prisma.productMaster.findUnique({ where: { id: rest.masterProductId } })
      if (pm) masterName = pm.masterName
    }

    // Process image if uploaded
    let imagePath = null
    if (req.file) {
      imagePath = await processProductPhoto(req.file)
      
      // Update ProductMaster image
      if (rest.masterProductId) {
        const pm = await prisma.productMaster.update({
          where: { id: rest.masterProductId },
          data: { image: imagePath },
          include: { medicine: true }
        })
        
        // If linked to medicine, update medicine image too
        if (pm.medicineId) {
          await prisma.medicine.update({
            where: { id: pm.medicineId },
            data: { image: imagePath }
          })
        }
      }
    }
    
    // helper to prepare data with branch suffixes
    const prepareData = async (cid: string) => {
      const clinic = await prisma.clinic.findUnique({ where: { id: cid }, select: { code: true } })
      const suffix = clinic?.code || ''
      return {
        ...rest,
        productName: masterName, // Enforce Master Name
        clinicId: cid,
        sku: sku.includes(`-${suffix}`) ? sku : `${sku}-${suffix}`,
        productCode: productCode.includes(`-${suffix}`) ? productCode : `${productCode}-${suffix}`
      }
    }

    if (Array.isArray(clinicIds) && clinicIds.length > 0) {
      // Bulk creation for multiple clinics
      const products = await Promise.all(clinicIds.map(async (cid) => {
        const data = await prepareData(cid)
        return prisma.product.create({
          data,
          include: { masterProduct: true, clinic: true }
        })
      }))
      return res.status(201).json(products[0])
    }

    // Single creation
    const cid = req.body.clinicId || (req as any).clinicId
    const data = await prepareData(cid)
    const product = await prisma.product.create({ 
      data,
      include: { 
        masterProduct: true,
        clinic: true
      }
    })
    res.status(201).json(product)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Kode produk atau SKU sudah ada di cabang ini' })
    res.status(500).json({ message: e.message })
  }
}

export const updateInventoryProduct = async (req: Request, res: Response) => {
  try {
    const { clinicIds, masterProduct, clinic, ...rest } = req.body

    // Sync Name from Master if linked
    if (rest.masterProductId) {
      const pm = await prisma.productMaster.findUnique({ where: { id: rest.masterProductId } })
      if (pm) rest.productName = pm.masterName
    }
    
    // Process image if uploaded
    if (req.file) {
      const imagePath = await processProductPhoto(req.file)
      
      // Find the master product id
      const currentProduct = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: { masterProductId: true }
      })
      
      if (currentProduct?.masterProductId) {
        const pm = await prisma.productMaster.update({
          where: { id: currentProduct.masterProductId },
          data: { image: imagePath },
          include: { medicine: true }
        })
        
        // Sync to medicine if linked
        if (pm.medicineId) {
          await prisma.medicine.update({
            where: { id: pm.medicineId },
            data: { image: imagePath }
          })
        }
      }
    }

    const product = await prisma.product.update({ 
      where: { id: req.params.id }, 
      data: rest,
      include: { 
        masterProduct: true,
        clinic: true
      }
    })
    res.json(product)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteInventoryProduct = async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } })
    res.json({ message: 'Item inventaris berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== PATIENTS ====================
export const getPatientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const currentUser = (req as any).user
    const isAdminView = (req as any).isAdminView
    const isDoctor = currentUser?.role === 'DOCTOR'
    const doctorProfileId = currentUser?.doctor?.id

    const patient = await prisma.patient.findUnique({
      where: { id },
    })

    if (!patient) return res.status(404).json({ message: 'Pasien tidak ditemukan' })

    // Security Filter: Doctors only see their own patients
    if (isDoctor && !isAdminView) {
      if (!doctorProfileId) {
        return res.status(403).json({ message: 'Akses ditolak: Profil dokter tidak ditemukan' })
      }

      const hasAccess = await prisma.patient.findFirst({
        where: {
          id,
          OR: [
            { medicalRecords: { some: { doctorId: doctorProfileId } } },
            { queueNumbers: { some: { doctorId: doctorProfileId } } },
            { registrations: { some: { doctorId: doctorProfileId } } },
            { appointments: { some: { doctorId: doctorProfileId } } }
          ]
        }
      })

      if (!hasAccess) {
        return res.status(403).json({ message: 'Akses ditolak: Anda tidak memiliki akses ke data pasien ini' })
      }
    }

    res.json(patient)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const getPatients = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query
    const currentUser = (req as any).user
    const currentClinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView

    // Security Filter: Doctors only see their own patients
    const isDoctor = currentUser?.role === 'DOCTOR'
    const doctorProfileId = currentUser?.doctor?.id

    // Fallback security: If user is a DOCTOR but has no Doctor profile, return empty
    if (isDoctor && !isAdminView && !doctorProfileId) {
      console.warn(`[getPatients] Doctor ${currentUser?.email} has no doctor profile record. Blocking patient access.`)
      return res.json([])
    }

    const page = req.query.page ? Number(req.query.page) : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 10
    const skip = page ? (page - 1) * limit : undefined

    const where = {
      AND: [
        // Clinic filter: Non-admins only see patients related to their clinic
        ...(!isAdminView ? [{
          OR: [
            { registrations: { some: { clinicId: currentClinicId } } },
            { medicalRecords: { some: { clinicId: currentClinicId } } },
            { appointments: { some: { clinicId: currentClinicId } } },
            { queueNumbers: { some: { clinicId: currentClinicId } } }
          ]
        }] : []),
        
        // STRICT Doctor filter: Doctors further restricted to their own assignments
        ...(isDoctor && !isAdminView && doctorProfileId ? [{
          OR: [
            { medicalRecords: { some: { doctorId: doctorProfileId } } },
            { queueNumbers: { some: { doctorId: doctorProfileId } } },
            { registrations: { some: { doctorId: doctorProfileId } } },
            { appointments: { some: { doctorId: doctorProfileId } } }
          ]
        }] : []),
        
        // Other filters
        ...(isActive !== undefined ? [{ isActive: isActive === 'true' }] : []),
        ...(search ? [{
          OR: [
            { name: { contains: String(search), mode: 'insensitive' as any } },
            { medicalRecordNo: { contains: String(search), mode: 'insensitive' as any } },
            { phone: { contains: String(search), mode: 'insensitive' as any } },
            { identityNumber: { contains: String(search), mode: 'insensitive' as any } },
          ]
        }] : [])
      ]
    }

    if (page) {
      const [total, patients] = await Promise.all([
        prisma.patient.count({ where }),
        prisma.patient.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' }
        })
      ])

      return res.json({
        data: patients,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      })
    }

    const patients = await prisma.patient.findMany({
      where,
      orderBy: { name: 'asc' },
    })
    
    res.json(patients)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const getNextMRNo = async (req: Request, res: Response) => {
  try {
    const today = new Date()
    const prefix = `RM-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`
    
    const count = await prisma.patient.count({
      where: { medicalRecordNo: { startsWith: prefix } }
    })
    
    const nextCode = `${prefix}-${(count + 1).toString().padStart(4, '0')}`
    res.json({ nextCode })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createPatient = async (req: Request, res: Response) => {
  try {
    const { dateOfBirth, ...rest } = req.body
    
    // Safer date parsing to prevent Prisma errors
    let dob = null
    if (dateOfBirth && dateOfBirth !== '') {
      const parsedDate = new Date(dateOfBirth)
      if (!isNaN(parsedDate.getTime())) {
        dob = parsedDate
      }
    }

    const patient = await prisma.patient.create({
      data: {
        ...rest,
        dateOfBirth: dob
      }
    })
    res.status(201).json(patient)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'Nomor Rekam Medis atau nomor identitas sudah ada' })
    res.status(500).json({ message: e.message })
  }
}

export const updatePatient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { dateOfBirth, ...rest } = req.body

    // Safer date parsing
    let dob = null
    if (dateOfBirth && dateOfBirth !== '') {
      const parsedDate = new Date(dateOfBirth)
      if (!isNaN(parsedDate.getTime())) {
        dob = parsedDate
      }
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...rest,
        dateOfBirth: dob
      }
    })
    res.json(patient)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deletePatient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await prisma.patient.delete({ where: { id } })
    res.json({ message: 'Data pasien berhasil dihapus' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}
