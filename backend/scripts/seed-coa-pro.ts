import { PrismaClient, AccountCategory, AccountType } from '@prisma/client'

const prisma = new PrismaClient()

const coaData = [
  // 1. ASSETS
  { code: '1-0000', name: 'AKTIVA', category: AccountCategory.ASSET, accountType: AccountType.HEADER },
  { code: '1-1000', name: 'AKTIVA LANCAR', category: AccountCategory.ASSET, accountType: AccountType.HEADER, parentCode: '1-0000' },
  { code: '1-1101', name: 'Kas Kecil (Petty Cash)', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000', isReconciled: true },
  { code: '1-1102', name: 'Bank Mandiri (IDR)', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000', isReconciled: true },
  { code: '1-1103', name: 'Bank BCA (IDR)', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000', isReconciled: true },
  { code: '1-1201', name: 'Piutang Pasien Umum', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000' },
  { code: '1-1202', name: 'Piutang Asuransi / Swasta', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000' },
  { code: '1-1301', name: 'Persediaan Obat-obatan', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000', isReconciled: true },
  { code: '1-1302', name: 'Persediaan Alat Kesehatan', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000', isReconciled: true },
  { code: '1-1303', name: 'Persediaan Produk Skin Care', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-1000', isReconciled: true },
  
  { code: '1-2000', name: 'AKTIVA TETAP', category: AccountCategory.ASSET, accountType: AccountType.HEADER, parentCode: '1-0000' },
  { code: '1-2101', name: 'Peralatan Medis Modern', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-2000' },
  { code: '1-2102', name: 'Akumulasi Penyusutan Alat Medis', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-2000' },
  { code: '1-2201', name: 'Inventaris & Furnitur Klinik', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-2000' },
  { code: '1-2301', name: 'Tanah & Bangunan', category: AccountCategory.ASSET, accountType: AccountType.DETAIL, parentCode: '1-2000' },

  // 2. LIABILITIES
  { code: '2-0000', name: 'KEWAJIBAN', category: AccountCategory.LIABILITY, accountType: AccountType.HEADER },
  { code: '2-1000', name: 'KEWAJIBAN JANGKA PENDEK', category: AccountCategory.LIABILITY, accountType: AccountType.HEADER, parentCode: '2-0000' },
  { code: '2-1101', name: 'Hutang Dagang (Supplier)', category: AccountCategory.LIABILITY, accountType: AccountType.DETAIL, parentCode: '2-1000' },
  { code: '2-1201', name: 'Hutang Gaji & Tunjangan', category: AccountCategory.LIABILITY, accountType: AccountType.DETAIL, parentCode: '2-1000' },
  { code: '2-1202', name: 'Hutang Jasa Medis Dokter', category: AccountCategory.LIABILITY, accountType: AccountType.DETAIL, parentCode: '2-1000' },
  { code: '2-1301', name: 'Titipan Uang Muka Pasien', category: AccountCategory.LIABILITY, accountType: AccountType.DETAIL, parentCode: '2-1000' },

  // 3. EQUITY
  { code: '3-0000', name: 'MODAL / EKUITAS', category: AccountCategory.EQUITY, accountType: AccountType.HEADER },
  { code: '3-1001', name: 'Modal Disetor Pemilik', category: AccountCategory.EQUITY, accountType: AccountType.DETAIL, parentCode: '3-0000' },
  { code: '3-2001', name: 'Laba Ditahan', category: AccountCategory.EQUITY, accountType: AccountType.DETAIL, parentCode: '3-0000' },
  { code: '3-3001', name: 'Laba Tahun Berjalan', category: AccountCategory.EQUITY, accountType: AccountType.DETAIL, parentCode: '3-0000' },

  // 4. REVENUE
  { code: '4-0000', name: 'PENDAPATAN', category: AccountCategory.REVENUE, accountType: AccountType.HEADER },
  { code: '4-1000', name: 'PENDAPATAN MEDIS', category: AccountCategory.REVENUE, accountType: AccountType.HEADER, parentCode: '4-0000' },
  { code: '4-1101', name: 'Jasa Konsultasi Dokter Umum', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },
  { code: '4-1102', name: 'Jasa Konsultasi Dokter Spesialis', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },
  { code: '4-1201', name: 'Jasa Tindakan Medis & Bedah', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },
  { code: '4-1202', name: 'Jasa Tindakan Medis Gigi', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },
  { code: '4-1301', name: 'Penjualan Obat-obatan', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },
  { code: '4-1401', name: 'Pendapatan cek Lab / Diagnostik', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },
  { code: '4-1501', name: 'Biaya Administrasi & Kartu', category: AccountCategory.REVENUE, accountType: AccountType.DETAIL, parentCode: '4-1000' },

  // 5. EXPENSES
  { code: '5-0000', name: 'HARGA POKOK PENJUALAN', category: AccountCategory.EXPENSE, accountType: AccountType.HEADER },
  { code: '5-1101', name: 'HPP Obat-obatan', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '5-0000' },
  { code: '5-1102', name: 'HPP Bahan Habis Pakai (BHP)', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '5-0000' },

  { code: '6-0000', name: 'BEBAN OPERASIONAL', category: AccountCategory.EXPENSE, accountType: AccountType.HEADER },
  { code: '6-1101', name: 'Beban Gaji & Bonus Staf', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
  { code: '6-1102', name: 'Beban Jasa Medis Dokter', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
  { code: '6-1201', name: 'Beban Listrik, Air & Telepon', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
  { code: '6-1301', name: 'Beban Marketing & Social Media', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
  { code: '6-1401', name: 'Beban Maintenance Alat Medis', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
  { code: '6-1501', name: 'Beban Penyusutan Aset Tetap', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
  { code: '6-1601', name: 'Beban Perijinan & Legal', category: AccountCategory.EXPENSE, accountType: AccountType.DETAIL, parentCode: '6-0000' },
]

async function main() {
  console.log('--- Seeding Chart of Accounts for High-End Clinic ---')
  
  // Get first clinic to associate with (or keep null for global)
  const firstClinic = await prisma.clinic.findFirst()
  const clinicId = firstClinic ? firstClinic.id : null

  if (!clinicId) {
    console.log('No clinic found. Accounts will be created as global accounts (clinicId: null).')
  } else {
    console.log(`Associating accounts with clinic: ${firstClinic?.name}`)
  }

  // Create accounts in order (Headers first, then children)
  // We'll use a map to find parents
  const createdAccounts: Record<string, string> = {}

  for (const acc of coaData) {
    const parentId = acc.parentCode ? createdAccounts[acc.parentCode] : null
    
    const created = await prisma.chartOfAccount.upsert({
      where: { code: acc.code },
      update: {
        name: acc.name,
        category: acc.category,
        accountType: acc.accountType,
        parentId: parentId,
        clinicId: clinicId,
        isReconciled: (acc as any).isReconciled || false
      },
      create: {
        code: acc.code,
        name: acc.name,
        category: acc.category,
        accountType: acc.accountType,
        parentId: parentId,
        clinicId: clinicId,
        isReconciled: (acc as any).isReconciled || false
      }
    })
    
    createdAccounts[acc.code] = created.id
    console.log(`[${acc.code}] ${acc.name} - ${acc.accountType} created/updated.`)
  }

  console.log('--- Seeding Completed Successfully ---')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
