/**
 * Upload middleware untuk Bon/Invoice Supplier procurement
 * Support: JPEG, PNG, WEBP, PDF
 * Simpan langsung ke disk: public/uploads/procurement/
 */
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const uploadDir = path.join(process.cwd(), 'public/uploads/procurement')

// Pastikan direktori ada
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const uniqueName = `bon-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`
    cb(null, uniqueName)
  },
})

const fileFilter = (_req: any, file: any, cb: any) => {
  const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
  if (allowedMime.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Hanya file gambar (JPEG, PNG, WEBP) atau PDF yang diizinkan!'))
  }
}

export const uploadBon = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
})
