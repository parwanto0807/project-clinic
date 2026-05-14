import multer from 'multer'
import path from 'path'

// Use memory storage to process with Sharp later
const storage = multer.memoryStorage()

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|webp/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)

  if (extname && mimetype) {
    return cb(null, true)
  } else {
    cb(new Error('Hanya file gambar (JPEG, PNG, WEBP) yang diizinkan!'))
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter
})

export const uploadDocument = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = /xlsx|xls|csv/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    if (extname) {
      return cb(null, true)
    } else {
      cb(new Error('Hanya file dokumen (XLSX, XLS, CSV) yang diizinkan!'))
    }
  }
})
