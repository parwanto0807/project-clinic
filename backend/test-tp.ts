import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tps = await prisma.treatmentPlan.findMany({
    where: {
      patientId: '2a890b90-baf8-4220-97c0-3763cd791442',
      status: 'ACTIVE'
    },
    include: { items: true, patient: true }
  })
  
  console.dir(tps, { depth: null })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
