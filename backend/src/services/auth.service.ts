import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

// JWT_SECRET must be set in environment variables for security
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not defined in environment variables!')
  console.error('Please set JWT_SECRET in your .env file')
  console.error('Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"')
  process.exit(1)
}

// Type assertion since we've validated JWT_SECRET exists
const jwtSecret: string = JWT_SECRET

const ACCESS_TOKEN_EXPIRY  = '15m'   // Short-lived — rotated via refresh
const REFRESH_TOKEN_EXPIRY = '7d'    // Long-lived — stored in separate HttpOnly cookie

export class AuthService {
  static generateTokens(payload: { id: string; email: string; role: string; clinics: string[] }) {
    const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY })
    const refreshToken = jwt.sign({ id: payload.id }, jwtSecret, { expiresIn: REFRESH_TOKEN_EXPIRY })
    return { accessToken, refreshToken }
  }
  static async login(email: string, password: string) {
    // Support both EMAIL and USERNAME login
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email }, // Standard email login
          { username: email } // Allow username login (for guest doctor with SIP)
        ]
      },
      include: {
        doctor: true
      }
    })

    // Generic error message to prevent email enumeration
    if (!user) {
      throw new Error('Email/Username atau password salah')
    }

    if (!user.isActive) {
      throw new Error('Akun Anda dinonaktifkan. Hubungi administrator.')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      throw new Error('Email/Username atau password salah')
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    const userClinics = await prisma.userClinic.findMany({
      where: { userId: user.id },
      include: { clinic: true },
    })

    const clinics = userClinics.map((uc) => uc.clinic)

    const { accessToken, refreshToken } = AuthService.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      clinics: clinics.map(c => c.id),
    })

    const { password: _, doctor, ...userWithoutPassword } = user as any
    const profileImage = userWithoutPassword.image || doctor?.profilePicture || null

    const permissions = await prisma.rolePermission.findMany({
      where: { role: user.role, canAccess: true },
      select: { module: true }
    })
    const allowedModules = permissions.map(p => p.module)

    return {
      user: { ...userWithoutPassword, image: profileImage, clinics, permissions: allowedModules },
      accessToken,
      refreshToken,
    }
  }

  static async refreshAccessToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, jwtSecret) as any

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          clinics: { include: { clinic: true } },
        },
      })

      if (!user || !user.isActive) {
        throw new Error('Sesi tidak valid')
      }

      const clinics = user.clinics.map((uc: any) => uc.clinic)

      // Issue a new access token — refresh token stays the same
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, clinics: clinics.map((c: any) => c.id) },
        jwtSecret,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      )

      return { accessToken }
    } catch (error) {
      throw new Error('Refresh token tidak valid atau sudah kadaluarsa. Silakan login kembali.')
    }
  }

  static async verifyToken(token: string) {
    try {
      const decoded = jwt.verify(token, jwtSecret) as any
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          doctor: true,
          clinics: {
            include: { clinic: true }
          }
        }
      })

      if (!user || !user.isActive) {
        throw new Error('Sesi tidak valid')
      }

      const { password: _, doctor, clinics: userClinics, ...userWithoutPassword } = user as any
      const profileImage = userWithoutPassword.image || doctor?.profilePicture || null
      
      // Map clinics to flat array
      const clinics = userClinics.map((uc: any) => uc.clinic)

      const permissions = await prisma.rolePermission.findMany({
        where: { role: user.role, canAccess: true },
        select: { module: true }
      })
      const allowedModules = permissions.map(p => p.module)

      return {
        ...userWithoutPassword,
        image: profileImage,
        clinics,
        permissions: allowedModules
      }
    } catch (error) {
      throw new Error('Token tidak valid')
    }
  }
}
