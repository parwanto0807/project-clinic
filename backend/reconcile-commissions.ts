import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(60))
  console.log('FIX REKONSILIASI KOMISI DOKTER')
  console.log('='.repeat(60))

  const allClinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true }
  })

  for (const clinic of allClinics) {
    console.log(`\n--- Klinik: ${clinic.name} (${clinic.code}) ---`)

    const coaList = await prisma.chartOfAccount.findMany({
      where: { code: { startsWith: '2-1102' }, OR: [{ clinicId: clinic.id }, { clinicId: null }] }
    })
    const coaIds = coaList.map(c => c.id)

    const journalDetails = await prisma.journalDetail.findMany({
      where: { coaId: { in: coaIds } }
    })

    let totalDebit = 0
    let totalCredit = 0
    for (const d of journalDetails) {
      totalDebit += Number(d.debit) || 0
      totalCredit += Number(d.credit) || 0
    }

    const ledgerBalance = totalCredit - totalDebit
    const difference = Math.round((0 - ledgerBalance) * 100) / 100
    const isBalanced = Math.abs(difference) < 0.01

    if (isBalanced) {
      console.log('  Sudah seimbang, tidak perlu perbaikan.')
      continue
    }

    console.log(`  GL Saldo Bersih:      Rp ${ledgerBalance.toLocaleString('id-ID')}`)
    console.log(`  Selisih (akan dikoreksi): Rp ${difference.toLocaleString('id-ID')}`)

    const adjustmentCoa = await prisma.chartOfAccount.findFirst({
      where: { code: { startsWith: '6-1' }, OR: [{ clinicId: clinic.id }, { clinicId: null }] },
      orderBy: { code: 'asc' }
    })
    const payableCoa = coaList[0]

    if (!payableCoa) {
      console.log('  ! Error: Akun 2-1102 tidak ditemukan')
      continue
    }

    if (!adjustmentCoa) {
      console.log('  ! Error: Akun Penyesuaian (6-1xx) tidak ditemukan')
      continue
    }

    if (difference > 0) {
      console.log(`  Membuat journal: Dr Adjustment Rp ${difference.toLocaleString('id-ID')}, Cr Payable Rp ${difference.toLocaleString('id-ID')}`)
      await prisma.journalEntry.create({
        data: {
          date: new Date(),
          description: `Rekonsiliasi Komisi - ${clinic.name}: Tambah Hutang Rp ${difference.toLocaleString('id-ID')}`,
          referenceNo: `RECONCILE-${clinic.id}-${Date.now()}`,
          entryType: 'SYSTEM',
          clinicId: clinic.id,
          details: {
            create: [
              { coaId: adjustmentCoa.id, debit: difference, credit: 0, description: 'Penyesuaian Beban Jasa Medik - Komisi' },
              { coaId: payableCoa.id, debit: 0, credit: difference, description: 'Penyesuaian Hutang Jasa Medik Dokter' }
            ]
          }
        }
      })
    } else {
      const absDiff = Math.abs(difference)
      console.log(`  Membuat journal: Dr Payable Rp ${absDiff.toLocaleString('id-ID')}, Cr Adjustment Rp ${absDiff.toLocaleString('id-ID')}`)
      await prisma.journalEntry.create({
        data: {
          date: new Date(),
          description: `Rekonsiliasi Komisi - ${clinic.name}: Kurangi Hutang Rp ${absDiff.toLocaleString('id-ID')}`,
          referenceNo: `RECONCILE-${clinic.id}-${Date.now()}`,
          entryType: 'SYSTEM',
          clinicId: clinic.id,
          details: {
            create: [
              { coaId: payableCoa.id, debit: absDiff, credit: 0, description: 'Penyesuaian Pengurangan Hutang Jasa Medik' },
              { coaId: adjustmentCoa.id, debit: 0, credit: absDiff, description: 'Penyesuaian Beban Jasa Medic - Selisih' }
            ]
          }
        }
      })
    }

    console.log('  Fix diterapkan ?')
  }

  console.log('\n' + '='.repeat(60))
  console.log('Rekonsiliasi selesai. Jalankan script find_diff.ts untuk memverifikasi.')
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
