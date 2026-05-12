import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LAB_CATEGORY_ID = '2bad9d8f-bac6-48ae-94ec-009b3d21d3a2' // Laboratorium Klinik

const labData = [
  // HEMATOLOGI
  { name: 'DARAH RUTIN 1 (Hb,Ht,Leu,Trom)', price: 90000, category: 'Hematologi', code: 'LAB-HMT-01' },
  { name: 'DARAH RUTIN 2 (Hb,Ht,Leu,Trom, Eri,Diff)', price: 95000, category: 'Hematologi', code: 'LAB-HMT-02' },
  { name: 'DARAH LENGKAP', price: 135000, category: 'Hematologi', code: 'LAB-HMT-03' },
  { name: 'GOLONGAN DARAH', price: 50000, category: 'Hematologi', code: 'LAB-HMT-04' },
  { name: 'LED', price: 50000, category: 'Hematologi', code: 'LAB-HMT-05' },
  { name: 'HEMOGLOBIN', price: 50000, category: 'Hematologi', code: 'LAB-HMT-06' },
  { name: 'TROMBOSIT', price: 50000, category: 'Hematologi', code: 'LAB-HMT-07' },
  { name: 'LEUKOSIT', price: 50000, category: 'Hematologi', code: 'LAB-HMT-08' },
  { name: 'HEMATOKRIT', price: 40000, category: 'Hematologi', code: 'LAB-HMT-09' },
  { name: 'HITUNG JENIS LEUKOSIT', price: 40000, category: 'Hematologi', code: 'LAB-HMT-10' },
  { name: 'WAKTU PENDARAHAN', price: 40000, category: 'Hematologi', code: 'LAB-HMT-11' },
  { name: 'WAKTU PEMBEKUAN', price: 40000, category: 'Hematologi', code: 'LAB-HMT-12' },

  // IMUNOSEROLOGI
  { name: 'WIDAL', price: 80000, category: 'Imunoserologi', code: 'LAB-IMU-01' },
  { name: 'HbSAg', price: 100000, category: 'Imunoserologi', code: 'LAB-IMU-02' },

  // KIMIA - METABOLISME LEMAK
  { name: 'KOLESTEROL LENGKAP (Chol,Tg,HDL,LDL)', price: 160000, category: 'Kimia Darah', code: 'LAB-KIM-L01' },
  { name: 'KOLESTEROL TOTAL', price: 50000, category: 'Kimia Darah', code: 'LAB-KIM-L02' },
  { name: 'TRIGLISERIDA', price: 50000, category: 'Kimia Darah', code: 'LAB-KIM-L03' },
  { name: 'HDL KOLESTEROL', price: 50000, category: 'Kimia Darah', code: 'LAB-KIM-L04' },
  { name: 'LDL KOLESTEROL', price: 100000, category: 'Kimia Darah', code: 'LAB-KIM-L05' },

  // KIMIA - METABOLISME GULA
  { name: 'GULA DARAH PUASA', price: 30000, category: 'Kimia Darah', code: 'LAB-KIM-G01' },
  { name: 'GULA DARAH 2PP', price: 30000, category: 'Kimia Darah', code: 'LAB-KIM-G02' },
  { name: 'GULA DARAH SEWAKTU', price: 30000, category: 'Kimia Darah', code: 'LAB-KIM-G03' },

  // KIMIA - METABOLISME FAAL HATI
  { name: 'SGOT', price: 45000, category: 'Kimia Darah', code: 'LAB-KIM-H01' },
  { name: 'SGPT', price: 45000, category: 'Kimia Darah', code: 'LAB-KIM-H02' },

  // KIMIA - METABOLISME FAAL GINJAL
  { name: 'ASAM URAT', price: 40000, category: 'Kimia Darah', code: 'LAB-KIM-F01' },
  { name: 'UREUM', price: 50000, category: 'Kimia Darah', code: 'LAB-KIM-F02' },
  { name: 'CREATININ', price: 50000, category: 'Kimia Darah', code: 'LAB-KIM-F03' },

  // URINALISA
  { name: 'URIN LENGKAP', price: 75000, category: 'Urinalisa', code: 'LAB-URN-01' },
  { name: 'TES KEHAMILAN', price: 45000, category: 'Urinalisa', code: 'LAB-URN-02' },

  // PAKET LABORATORIUM
  { name: 'CEK STICK JARI (Kolesterol,Gula,Asam Urat)', price: 90000, category: 'Paket Lab', code: 'LAB-PKT-01' },
  { name: 'CEK ALAT VENA (Kolesterol,Gula,Asam Urat)', price: 120000, category: 'Paket Lab', code: 'LAB-PKT-02' },
  { name: 'PAKET LENGKAP (Koles.Lengkap,GP,2PP,AU)', price: 250000, category: 'Paket Lab', code: 'LAB-PKT-03' },
]

async function main() {
  console.log('--- SEEDING LABORATORY SERVICES AND TEST MASTERS ---')

  const clinic = await prisma.clinic.findFirst({ where: { code: 'K001' } })
  if (!clinic) {
    console.error('Clinic K001 not found!')
    return
  }

  for (const item of labData) {
    console.log(`Processing: ${item.name}...`)

    // 1. Create/Update Service (for Billing)
    await prisma.service.upsert({
      where: { serviceCode: item.code },
      update: {
        serviceName: item.name,
        price: item.price,
        categoryId: LAB_CATEGORY_ID,
        isActive: true,
        clinicId: clinic.id
      },
      create: {
        serviceCode: item.code,
        serviceName: item.name,
        price: item.price,
        categoryId: LAB_CATEGORY_ID,
        isActive: true,
        clinicId: clinic.id,
        unit: 'session'
      }
    })

    // 2. Create/Update LabTestMaster (for Clinical Results)
    // For packages, we might want to split them, but for now we'll just add the main item
    await prisma.labTestMaster.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        category: item.category,
        price: item.price,
        isActive: true
      },
      create: {
        code: item.code,
        name: item.name,
        category: item.category,
        price: item.price,
        isActive: true
      }
    })
  }

  console.log('--- SEEDING COMPLETED ---')
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())
