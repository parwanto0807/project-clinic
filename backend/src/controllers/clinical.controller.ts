import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import path from 'path'
import fs from 'fs/promises'

// ==================== REFERRALS ====================

export const createReferral = async (req: Request, res: Response) => {
  try {
    const { medicalRecordId, type, toClinicId, toDepartmentId, toHospitalName, notes } = req.body
    
    const referral = await prisma.referral.create({
      data: {
        medicalRecordId,
        type,
        toClinicId,
        toDepartmentId,
        toHospitalName,
        notes,
        referralDate: new Date(),
        status: 'pending'
      },
      include: {
        toClinic: { select: { name: true } },
        toDepartment: { select: { name: true } }
      }
    })
    
    res.status(201).json(referral)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const getReferralsByMedicalRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const referrals = await prisma.referral.findMany({
      where: { medicalRecordId: id },
      include: {
        toClinic: { select: { name: true } },
        toDepartment: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(referrals)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== CLINICAL TEMPLATES ====================

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { type } = req.query
    const currentClinicId = (req as any).clinicId
    const doctorId = (req as any).user.doctor?.id

    const templates = await prisma.clinicalTemplate.findMany({
      where: {
        isActive: true,
        ...(type ? { type: String(type) } : {}),
        OR: [
          { doctorId: doctorId }, // Personal templates
          { clinicId: currentClinicId }, // Clinic-wide templates
          { doctorId: null, clinicId: null } // System-wide global templates
        ]
      },
      orderBy: { name: 'asc' }
    })
    res.json(templates)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { name, type, content, isGlobal } = req.body
    const currentClinicId = (req as any).clinicId
    const doctorId = (req as any).user.doctor?.id

    const template = await prisma.clinicalTemplate.create({
      data: {
        name,
        type,
        content,
        doctorId: isGlobal ? null : doctorId,
        clinicId: isGlobal ? null : currentClinicId
      }
    })
    res.status(201).json(template)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

// ==================== ATTACHMENTS ====================

export const uploadAttachment = async (req: Request, res: Response) => {
  try {
    const { medicalRecordId } = req.body
    if (!req.file) {
      return res.status(400).json({ message: 'Tidak ada file yang diunggah' })
    }

    const fileName = `${Date.now()}-${req.file.originalname}`
    const uploadDir = path.join(__dirname, '../../public/uploads/records')
    await fs.mkdir(uploadDir, { recursive: true })
    
    const filePath = path.join(uploadDir, fileName)
    await fs.writeFile(filePath, req.file.buffer)

    const attachment = await prisma.medicalRecordAttachment.create({
      data: {
        medicalRecordId,
        fileUrl: `/uploads/records/${fileName}`,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size
      }
    })

    res.status(201).json(attachment)
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}

export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const attachment = await prisma.medicalRecordAttachment.findUnique({
      where: { id }
    })

    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' })
    }

    // Attempt to delete physical file
    try {
      if (attachment.fileUrl.startsWith('/uploads/records/')) {
        const fileName = attachment.fileUrl.replace('/uploads/records/', '')
        const filePath = path.join(__dirname, '../../public/uploads/records', fileName)
        await fs.unlink(filePath)
      }
    } catch (fsError) {
      console.warn('Failed to delete physical file:', fsError)
      // Continue to delete from DB even if file is missing
    }

    await prisma.medicalRecordAttachment.delete({
      where: { id }
    })

    res.json({ message: 'Attachment deleted successfully' })
  } catch (e) {
    res.status(500).json({ message: (e as Error).message })
  }
}
