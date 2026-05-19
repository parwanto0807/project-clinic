import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Finding all doctor commissions for consultations...')
  const commissions = await (prisma as any).doctorCommission.findMany({
    include: {
      doctor: true,
      invoice: true
    }
  })

  // Group by invoiceId / sourceId to find duplicates
  const grouped = new Map<string, any[]>()
  for (const c of commissions) {
    if (!c.invoiceId) continue
    const key = `${c.invoiceId}-${c.doctorId}`
    const list = grouped.get(key) || []
    list.push(c)
    grouped.set(key, list)
  }

  console.log('\nChecking for duplicates...')
  for (const [key, list] of grouped.entries()) {
    // If there is more than one consultation-like commission for the same doctor + invoice
    const consultComms = list.filter(c => 
      c.description.toLowerCase().includes('konsultasi') || 
      c.description.toLowerCase().includes('pemeriksaan')
    )

    if (consultComms.length > 1) {
      console.log(`\nDuplicate found for Invoice Key: ${key}`)
      for (const c of consultComms) {
        console.log(`- ID: ${c.id} | Desc: ${c.description} | Amount: ${c.amount} | Type: ${c.type} | Status: ${c.status}`)
      }

      // We should keep the AUTO_CONSULTATION and delete the duplicate INVOICE type
      const toDelete = consultComms.find(c => c.type === 'INVOICE')
      if (toDelete) {
        console.log(`  -> Deleting duplicate commission ID: ${toDelete.id}`)
        await (prisma as any).doctorCommission.delete({
          where: { id: toDelete.id }
        })
      }
    }
  }

  console.log('\nCleanup done.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
