import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // 1. Get all clinics
  const clinics = await prisma.clinic.findMany()
  console.log('--- CLINICS IN DATABASE ---')
  clinics.forEach(c => {
    console.log(`- ID: ${c.id}, Name: ${c.name}, Code: ${c.code}, isMain: ${c.isMain}`)
  })

  // 2. Let's find an Admin user or Super Admin user to see their role/clinic
  const users = await prisma.user.findMany({
    include: {
      clinics: {
        include: {
          clinic: true
        }
      }
    }
  })
  console.log('\n--- USERS IN DATABASE ---')
  users.forEach(u => {
    console.log(`- Username: ${u.username}, Role: ${u.role}, Clinics:`, u.clinics.map(uc => uc.clinic.name))
  })

  // 3. Let's simulate the query in getProductMasters
  // Let's assume clinicId = undefined (or first clinic)
  const targetClinicId = clinics[0]?.id
  console.log(`\n--- SIMULATING GET_PRODUCT_MASTERS FOR CLINIC: ${clinics[0]?.name} (${targetClinicId}) ---`)

  const where: any = {}
  
  const [total, results] = await Promise.all([
    prisma.productMaster.count({ where }),
    prisma.productMaster.findMany({
      where,
      include: { 
        productCategory: true,
        medicine: true,
        compoundFormula: true,
        products: { 
          where: targetClinicId ? { clinicId: targetClinicId } : {},
          include: { clinic: true }
        }
      },
      orderBy: { masterName: 'asc' },
      skip: 0,
      take: 10
    })
  ])

  console.log('Total masters matching where:', total)
  console.log('Fetched count in first page:', results.length)
  console.log('Sample fetched master names:', results.map(r => r.masterName))
}

main().catch(console.error).finally(() => prisma.$disconnect())
