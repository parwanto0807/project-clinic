import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const coas = await prisma.chartOfAccount.findMany({
    where: {
      code: { startsWith: '4-' }
    },
    orderBy: { code: 'asc' }
  })
  
  console.log('--- REVENUE COAS IN DB ---')
  for (const c of coas) {
    console.log(`Code: ${c.code} | Name: ${c.name} | ID: ${c.id}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
