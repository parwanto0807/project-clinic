import { Request, Response } from 'express'
import { AuthService } from '../services/auth.service'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'
import path from 'path'
import sharp from 'sharp'
import { promises as fs } from 'fs'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Access token cookie — short-lived (15 min), HttpOnly
const getCookieOptions = (req: Request, isRefresh: boolean = false) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1'
  return {
    httpOnly: true,
    secure: IS_PRODUCTION && !isLocalhost,
    sameSite: 'lax' as const,
    maxAge: isRefresh ? 7 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000,
    path: isRefresh ? '/api/auth' : '/',
  }
}

const clearCookieOptions = { path: '/' }
const clearRefreshCookieOptions = { path: '/api/auth' }

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body
      if (!email || !password) {
        return res.status(400).json({ message: 'Email dan password harus diisi' })
      }

      const result = await AuthService.login(email, password)
      
      // Set both tokens as HttpOnly cookies using the dynamic options
      res.cookie('auth_token', result.accessToken, getCookieOptions(req))
      res.cookie('refresh_token', result.refreshToken, getCookieOptions(req, true))

      // Return user data only — no tokens in response body
      res.status(200).json({ user: result.user })
    } catch (error) {
      res.status(401).json({ message: (error as Error).message })
    }
  }

  // Called automatically by frontend when access token expires (401)
  static async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refresh_token
      if (!refreshToken) {
        return res.status(401).json({ message: 'Sesi berakhir. Silakan login kembali.', code: 'REFRESH_MISSING' })
      }

      const result = await AuthService.refreshAccessToken(refreshToken)

      // Issue new access token cookie
      res.cookie('auth_token', result.accessToken, getCookieOptions(req))

      res.status(200).json({ message: 'Token diperbarui' })
    } catch (error) {
      // Refresh token invalid/expired — force full logout
      res.clearCookie('auth_token', clearCookieOptions)
      res.clearCookie('refresh_token', clearRefreshCookieOptions)
      res.status(401).json({ message: 'Sesi berakhir. Silakan login kembali.', code: 'SESSION_EXPIRED' })
    }
  }

  // Explicit logout — clears BOTH cookies server-side
  static async logout(_req: Request, res: Response) {
    res.clearCookie('auth_token', clearCookieOptions)
    res.clearCookie('refresh_token', clearRefreshCookieOptions)
    res.status(200).json({ message: 'Logout berhasil' })
  }

  static async me(req: any, res: Response) {
    try {
      res.status(200).json(req.user)
    } catch (error) {
      res.status(401).json({ message: (error as Error).message })
    }
  }

  static async changePassword(req: any, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Password saat ini dan password baru harus diisi' })
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password baru minimal harus terdiri dari 6 karakter' })
      }

      const userId = req.user.id
      const user = await prisma.user.findUnique({ where: { id: userId } })

      if (!user) {
        return res.status(404).json({ message: 'Pengguna tidak ditemukan' })
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Password saat ini yang Anda masukkan salah' })
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10)
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword }
      })

      res.status(200).json({ message: 'Password berhasil diperbarui' })
    } catch (error) {
      res.status(500).json({ message: (error as Error).message })
    }
  }

  static async updateAvatar(req: any, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file foto yang dikirimkan' })
      }

      const userId = req.user.id
      const user = await prisma.user.findUnique({ 
        where: { id: userId },
        include: {
          doctor: true,
          clinics: { include: { clinic: true } }
        }
      })

      if (!user) {
        return res.status(404).json({ message: 'Pengguna tidak ditemukan' })
      }

      const fileName = `avatar-${userId}-${Date.now()}.webp`
      const uploadDir = path.join(process.cwd(), 'public/uploads/avatars')
      await fs.mkdir(uploadDir, { recursive: true })
      const filePath = path.join(uploadDir, fileName)

      // Use sharp to optimize to a clean 300x300 Cover WebP image
      await sharp(req.file.buffer)
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(filePath)

      const avatarUrl = `/uploads/avatars/${fileName}`

      // Update User Image in Database
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { image: avatarUrl },
        include: {
          clinics: {
            include: {
              clinic: true
            }
          },
          doctor: true
        }
      })

      // Fetch permissions for the user's role
      const permissions = await prisma.rolePermission.findMany({
        where: { role: updatedUser.role, canAccess: true },
        select: { module: true }
      })
      const allowedModules = permissions.map(p => p.module)

      const formattedUser = {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        name: updatedUser.name,
        phone: updatedUser.phone,
        role: updatedUser.role,
        image: updatedUser.image,
        doctor: updatedUser.doctor,
        permissions: allowedModules,
        clinics: updatedUser.clinics.map(uc => ({
          id: uc.clinic.id,
          name: uc.clinic.name,
          code: uc.clinic.code,
          address: uc.clinic.address,
          phone: uc.clinic.phone,
          isMain: uc.clinic.isMain
        }))
      }

      res.status(200).json({ 
        message: 'Foto profil berhasil diperbarui', 
        user: formattedUser 
      })
    } catch (error) {
      res.status(500).json({ message: (error as Error).message })
    }
  }
}
