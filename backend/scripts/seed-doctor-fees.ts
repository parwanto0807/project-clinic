import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Seeding Doctor Fee Settings ---')

  const settings = [
    {
      key: 'fee_doctor_regular',
      value: '70000',
      description: 'Biaya Jasa Konsultasi Dokter (Hari Biasa)'
    },
    {
      key: 'fee_doctor_holiday',
      value: '80000',
      description: 'Biaya Jasa Konsultasi Dokter (Minggu / Tanggal Merah)'
    },
    {
      key: 'fee_doctor_control',
      value: '35000',
      description: 'Biaya Jasa Konsultasi Dokter (Pasien Kontrol)'
    }
  ]

  for (const s of settings) {
    await prisma.siteSetting.upsert({
      where: { key: s.key },
      update: {}, // Don't overwrite if already exists
      create: {
        key: s.key,
        value: s.value,
        description: s.description
      }
    })
    console.log(`Setting created/verified: ${s.key}`)
  }

  console.log('✔ Done!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
