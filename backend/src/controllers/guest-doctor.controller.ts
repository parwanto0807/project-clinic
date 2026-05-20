import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import bcrypt from 'bcrypt'
import { getPaginationOptions } from '../utils/pagination'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

// Generate random secure password
function generatePassword(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// ==================== GUEST DOCTOR PROFILES ====================

// Get all guest doctor profiles
export const getGuestDoctorProfiles = async (req: Request, res: Response) => {
  try {
    const { search, specialization, isActive } = req.query
    const currentClinicId = (req as any).clinicId
    const { skip, take, page } = getPaginationOptions(req.query)

    const [total, profiles] = await Promise.all([
      prisma.guestDoctorProfile.count({
        where: {
          clinicId: currentClinicId,
          ...(search ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { licenseNumber: { contains: String(search), mode: 'insensitive' } },
            ]
          } : {}),
          ...(specialization ? { specialization: String(specialization) } : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {})
        }
      }),
      prisma.guestDoctorProfile.findMany({
        where: {
          clinicId: currentClinicId,
          ...(search ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { licenseNumber: { contains: String(search), mode: 'insensitive' } },
            ]
          } : {}),
          ...(specialization ? { specialization: String(specialization) } : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {})
        },
        include: {
          assignments: {
            orderBy: { date: 'desc' },
            take: 5
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      })
    ])

    res.json({
      data: profiles,
      pagination: {
        page,
        limit: take,
        total,
        pages: Math.ceil(total / take)
      }
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Create guest doctor profile
export const createGuestDoctorProfile = async (req: Request, res: Response) => {
  try {
    const { name, licenseNumber, specialization, phone, email, address } = req.body
    const clinicId = (req as any).clinicId

    // Validate required fields
    if (!name || !licenseNumber || !specialization || !phone) {
      return res.status(400).json({ 
        message: 'Nama, SIP, spesialisasi, dan telepon wajib diisi' 
      })
    }

    // Check duplicate SIP
    const existing = await prisma.guestDoctorProfile.findUnique({
      where: { licenseNumber }
    })

    if (existing) {
      return res.status(400).json({ 
        message: 'SIP dokter sudah terdaftar' 
      })
    }

    const profile = await prisma.guestDoctorProfile.create({
      data: {
        name,
        licenseNumber,
        specialization,
        phone,
        email: email || null,
        address: address || null,
        clinicId
      }
    })

    res.status(201).json({
      message: 'Dokter tamu berhasil ditambahkan',
      data: profile
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Update guest doctor profile
export const updateGuestDoctorProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, specialization, phone, email, address, isActive } = req.body

    const profile = await prisma.guestDoctorProfile.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(specialization && { specialization }),
        ...(phone && { phone }),
        ...(email !== undefined && { email: email || null }),
        ...(address !== undefined && { address: address || null }),
        ...(isActive !== undefined && { isActive })
      }
    })

    res.json({
      message: 'Dokter tamu berhasil diperbarui',
      data: profile
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Delete guest doctor profile
export const deleteGuestDoctorProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.guestDoctorProfile.delete({
      where: { id }
    })

    res.json({ message: 'Dokter tamu berhasil dihapus' })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// ==================== GUEST DOCTOR ASSIGNMENTS ====================

// Get assignments for today or specific date
export const getGuestDoctorAssignments = async (req: Request, res: Response) => {
  try {
    const { date, status } = req.query
    const clinicId = (req as any).clinicId
    const { skip, take, page } = getPaginationOptions(req.query)

    // For @db.Date fields, Prisma expects a Date object at midnight UTC.
    // Build it from the YYYY-MM-DD string to avoid local-timezone shifts.
    const dateStr = date ? String(date) : new Date().toISOString().slice(0, 10)
    const queryDate = new Date(`${dateStr}T00:00:00.000Z`)

    const [total, assignments] = await Promise.all([
      prisma.guestDoctorAssignment.count({
        where: {
          clinicId,
          ...(status ? { status: String(status) } : {}),
          date: queryDate
        }
      }),
      prisma.guestDoctorAssignment.findMany({
        where: {
          clinicId,
          ...(status ? { status: String(status) } : {}),
          date: queryDate
        },
        include: {
          guestDoctor: true,
          user: {
            select: { id: true, username: true, email: true }
          }
        },
        skip,
        take,
        orderBy: { date: 'desc' }
      })
    ])

    res.json({
      data: assignments,
      pagination: {
        page,
        limit: take,
        total,
        pages: Math.ceil(total / take)
      }
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Create guest doctor assignment for today
export const createGuestDoctorAssignment = async (req: Request, res: Response) => {
  try {
    const { guestDoctorId, notes, date } = req.body
    const clinicId = (req as any).clinicId
    const adminId = (req as any).user.id

    // Validate
    if (!guestDoctorId) {
      return res.status(400).json({ message: 'Dokter tamu harus dipilih' })
    }

    const guestDoctor = await prisma.guestDoctorProfile.findUnique({
      where: { id: guestDoctorId }
    })

    if (!guestDoctor) {
      return res.status(404).json({ message: 'Dokter tamu tidak ditemukan' })
    }

    // For @db.Date fields Prisma expects UTC midnight. Build from the YYYY-MM-DD
    // string so the date is never shifted by the server's local timezone.
    const dateStr = date
      ? String(date).slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    const assignmentDate = new Date(`${dateStr}T00:00:00.000Z`)

    const existing = await prisma.guestDoctorAssignment.findUnique({
      where: {
        date_clinicId: {
          date: assignmentDate,
          clinicId
        }
      }
    })

    if (existing && existing.status !== 'CANCELLED') {
      return res.status(400).json({ 
        message: 'Sudah ada dokter tamu yang ditugaskan hari ini' 
      })
    }

    // Generate credentials untuk akun guest
    const username = guestDoctor.licenseNumber // Username dari SIP
    const password = generatePassword()
    const hashedPassword = await bcrypt.hash(password, 10)
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

    // Reuse existing user account if username already taken (e.g. from a previous cancelled assignment),
    // otherwise create a fresh one. Always reset password and expiry.
    const existingUser = await prisma.user.findUnique({ where: { username } })

    let user: { id: string; username: string }
    if (existingUser) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password: hashedPassword,
          name: guestDoctor.name,
          phone: guestDoctor.phone,
          isActive: true,
          isGuestAccount: true,
          guestExpiryDate: newExpiry
        },
        select: { id: true, username: true }
      })

      // Ensure clinic access exists
      await prisma.userClinic.upsert({
        where: { userId_clinicId: { userId: user.id, clinicId } },
        update: {},
        create: { userId: user.id, clinicId }
      })
    } else {
      const created = await prisma.user.create({
        data: {
          username,
          email: null,
          password: hashedPassword,
          name: guestDoctor.name,
          phone: guestDoctor.phone,
          role: 'DOCTOR',
          isActive: true,
          isGuestAccount: true,
          guestExpiryDate: newExpiry
        }
      })
      user = created

      // Add clinic access
      await prisma.userClinic.create({
        data: { userId: user.id, clinicId }
      })
    }

    // Upsert a Doctor record for the guest so they can be linked to Queue/Registration
    // as a proper doctorId FK. Uses licenseNumber as the stable unique key.
    await prisma.doctor.upsert({
      where: { licenseNumber: guestDoctor.licenseNumber },
      update: {
        userId: user.id,
        name: guestDoctor.name,
        phone: guestDoctor.phone,
        specialization: guestDoctor.specialization,
        isActive: true
      },
      create: {
        userId: user.id,
        licenseNumber: guestDoctor.licenseNumber,
        name: guestDoctor.name,
        phone: guestDoctor.phone,
        specialization: guestDoctor.specialization,
        isActive: true
      }
    })

    // Upsert assignment — handles the case where a CANCELLED record already exists
    // for this date+clinicId (unique constraint), replacing it with the new assignment.
    const assignment = await prisma.guestDoctorAssignment.upsert({
      where: {
        date_clinicId: {
          date: assignmentDate,
          clinicId
        }
      },
      update: {
        guestDoctorId,
        userId: user.id,
        createdByAdminId: adminId,
        status: 'SCHEDULED',
        notes: notes || null
      },
      create: {
        date: assignmentDate,
        guestDoctorId,
        userId: user.id,
        createdByAdminId: adminId,
        status: 'SCHEDULED',
        notes: notes || null,
        clinicId
      },
      include: {
        guestDoctor: true,
        user: {
          select: { id: true, username: true }
        }
      }
    })

    res.status(201).json({
      message: 'Dokter tamu berhasil ditugaskan',
      data: {
        ...assignment,
        credentials: {
          username,
          password // Return password sekali saja, harus disimpan admin
        }
      }
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Activate assignment (change status to ACTIVE)
export const activateGuestDoctorAssignment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const assignment = await prisma.guestDoctorAssignment.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: {
        guestDoctor: true,
        user: { select: { id: true, username: true } }
      }
    })

    res.json({
      message: 'Dokter tamu telah diaktifkan',
      data: assignment
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Complete assignment
export const completeGuestDoctorAssignment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const assignment = await prisma.guestDoctorAssignment.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: {
        guestDoctor: true
      }
    })

    // Deactivate associated user account
    if (assignment.userId) {
      await prisma.user.update({
        where: { id: assignment.userId },
        data: { isActive: false }
      })
    }

    res.json({
      message: 'Penugasan selesai, akun dokter tamu dinonaktifkan',
      data: assignment
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Cancel assignment
export const cancelGuestDoctorAssignment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const assignment = await prisma.guestDoctorAssignment.findUnique({
      where: { id }
    })

    if (!assignment) {
      return res.status(404).json({ message: 'Penugasan tidak ditemukan' })
    }

    // Update assignment
    const updated = await prisma.guestDoctorAssignment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: reason || assignment.notes
      },
      include: {
        guestDoctor: true
      }
    })

    // Delete associated user account
    if (assignment.userId) {
      await prisma.user.delete({
        where: { id: assignment.userId }
      })
    }

    res.json({
      message: 'Penugasan dibatalkan, akun dokter tamu dihapus',
      data: updated
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Get today's active guest doctor
export const getTodayActiveGuestDoctor = async (req: Request, res: Response) => {
  try {
    const clinicId = (req as any).clinicId
    const todayStr = new Date().toISOString().slice(0, 10)
    const today = new Date(`${todayStr}T00:00:00.000Z`)

    const assignment = await prisma.guestDoctorAssignment.findFirst({
      where: {
        clinicId,
        date: today,
        status: { in: ['SCHEDULED', 'ACTIVE'] }
      },
      include: {
        guestDoctor: true,
        user: {
          select: { id: true, username: true }
        }
      }
    })

    if (!assignment) {
      return res.json({ data: null })
    }

    res.json({ data: assignment })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}

// Get guest doctor history/statistics
export const getGuestDoctorStatistics = async (req: Request, res: Response) => {
  try {
    const clinicId = (req as any).clinicId
    const { startDate, endDate } = req.query

    let dateFilter: any = {}
    if (startDate) {
      dateFilter.gte = new Date(String(startDate))
    }
    if (endDate) {
      dateFilter.lte = new Date(String(endDate))
    }

    const [totalAssignments, completedAssignments, guestDoctorStats] = await Promise.all([
      prisma.guestDoctorAssignment.count({
        where: {
          clinicId,
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {})
        }
      }),
      prisma.guestDoctorAssignment.count({
        where: {
          clinicId,
          status: 'COMPLETED',
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {})
        }
      }),
      prisma.guestDoctorProfile.findMany({
        where: { clinicId },
        include: {
          _count: {
            select: { assignments: true, medicalRecords: true }
          }
        }
      })
    ])

    res.json({
      data: {
        totalAssignments,
        completedAssignments,
        guestDoctors: guestDoctorStats.map(doc => ({
          id: doc.id,
          name: doc.name,
          specialization: doc.specialization,
          licenseNumber: doc.licenseNumber,
          totalAssignments: doc._count.assignments,
          patientsHandled: doc._count.medicalRecords
        }))
      }
    })
  } catch (e: any) {
    res.status(500).json({ message: e.message })
  }
}
