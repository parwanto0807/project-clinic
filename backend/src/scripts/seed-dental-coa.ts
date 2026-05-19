import { PrismaClient, AccountCategory, AccountType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed process for Dental Treatment COA...')

  // 1. Find the main clinic or first clinic
  const clinic = await prisma.clinic.findFirst({ where: { isMain: true } }) || await prisma.clinic.findFirst()
  if (!clinic) {
    throw new Error('Clinic not found.')
  }
  const clinicId = clinic.id

  // 2. Find the parent account "PENDAPATAN MEDIS" (code: "4-1000")
  const parentAccount = await prisma.chartOfAccount.findFirst({
    where: { code: '4-1000' }
  })
  if (!parentAccount) {
    throw new Error('Parent Account 4-1000 (PENDAPATAN MEDIS) not found.')
  }
  const parentId = parentAccount.id

  // 3. Upsert the new Dental Treatment COA "4-1202-K001"
  const dentalCoa = await prisma.chartOfAccount.upsert({
    where: { code: '4-1202-K001' },
    update: {
      name: 'Jasa Tindakan Medis Gigi - Pusat',
      category: AccountCategory.REVENUE,
      accountType: AccountType.DETAIL,
      parentId: parentId,
      clinicId: clinicId
    },
    create: {
      code: '4-1202-K001',
      name: 'Jasa Tindakan Medis Gigi - Pusat',
      category: AccountCategory.REVENUE,
      accountType: AccountType.DETAIL,
      parentId: parentId,
      clinicId: clinicId
    }
  })

  console.log(`Dental COA created/updated: [${dentalCoa.code}] ${dentalCoa.name} (ID: ${dentalCoa.id})`)

  // 4. Find all dental services (services belonging to the 8 dental categories)
  const dentalCategories = [
    'Konservasi (Penambalan Gigi) - BASIC',
    'Konservasi (Penambalan Gigi) - GIC & KOMPOSIT',
    'Konservasi (Perawatan Saluran Akar)',
    'Konservasi (Estetik)',
    'Oral Surgery (Bedah Mulut)',
    'Periodontia (Jaringan Penyangga Gigi)',
    'Prosthodontia (Gigi Palsu)',
    'Orthodontic (Braces / Kawat Gigi)'
  ]

  const dbCategories = await prisma.serviceCategory.findMany({
    where: {
      categoryName: { in: dentalCategories }
    }
  })
  const categoryIds = dbCategories.map(cat => cat.id)

  if (categoryIds.length === 0) {
    console.log('No dental service categories found. Skipping service COA mapping.')
    return
  }

  // Update all services in these categories to link to the new dental COA
  const updateResult = await prisma.service.updateMany({
    where: {
      categoryId: { in: categoryIds }
    },
    data: {
      coaId: dentalCoa.id
    }
  })

  console.log(`Successfully mapped ${updateResult.count} dental services to the new COA: [4-1202-K001]`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
