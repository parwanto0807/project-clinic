import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(60))
  console.log('REKONSILIASI KOMISI DOKTER vs LEDGER 2-1102')
  console.log('='.repeat(60))

  const allClinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true }
  })

  for (const clinic of allClinics) {
    console.log(`\n--- Klinik: ${clinic.name} (${clinic.code}) ---`)

    const unpaidCommissions = await prisma.doctorCommission.findMany({
      where: { status: 'unpaid', clinicId: clinic.id },
      include: { invoice: { select: { invoiceNo: true, total: true } } }
    })

    const totalUnpaid = unpaidCommissions.reduce((sum, c) => sum + Number(c.amount), 0)

    const coaList = await prisma.chartOfAccount.findMany({
      where: { code: { startsWith: '2-1102' }, OR: [{ clinicId: clinic.id }, { clinicId: null }] }
    })
    const coaIds = coaList.map(c => c.id)

    const journalDetails = await prisma.journalDetail.findMany({
      where: { coaId: { in: coaIds } },
      include: { journalEntry: { select: { referenceNo: true, date: true } } }
    })

    let ledgerBalance = 0
    for (const detail of journalDetails) {
      ledgerBalance += (Number(detail.credit) - Number(detail.debit))
    }

    const difference = Math.round((totalUnpaid - ledgerBalance) * 100) / 100
    const isBalanced = Math.abs(difference) < 0.01

    console.log(`  Jumlah komisi belum dibayar (DoctorCommission): Rp ${totalUnpaid.toLocaleString('id-ID')}`)
    console.log(`  Saldo Ledger 2-1102 (Hutang Jasa Medik):      Rp ${ledgerBalance.toLocaleString('id-ID')}`)
    console.log(`  Selisih (seharusnya nol):                       Rp ${difference.toLocaleString('id-ID')}`)
    console.log(`  Status: ${isBalanced ? 'SEIMBANG ?' : 'TIDAK SEIMBANG ?'}`)
    console.log(`  Jumlah record komisi: ${unpaidCommissions.length}`)
    console.log(`  Jumlah entry ledger: ${journalDetails.length}`)

    if (!isBalanced) {
      console.log(`  ? PERLU PERBAIKAN: Selisih Rp ${difference.toLocaleString('id-ID')}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Rekonsiliasi selesai. Jalankan fix reconcile-commissions untuk memperbaiki ketidakseimbangan.')
  console.log('Endpoint: POST /finance/reconcile-commissions (dryRun=true untuk preview)')
  console.log('='.repeat(60))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
