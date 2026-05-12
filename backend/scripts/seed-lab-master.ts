import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding LabTestMaster...')

  const labTests = [
    // Hematologi Lengkap (Complete Blood Count)
    { code: 'HEMATO-01', name: 'Hemoglobin (Hb)', category: 'Hematologi', unit: 'g/dL', normalRangeText: 'L: 13.0-18.0, P: 12.0-16.0' },
    { code: 'HEMATO-02', name: 'Leukosit (WBC)', category: 'Hematologi', unit: '/uL', normalRangeText: '4000 - 10000' },
    { code: 'HEMATO-03', name: 'Eritrosit (RBC)', category: 'Hematologi', unit: 'juta/uL', normalRangeText: 'L: 4.5-5.5, P: 4.0-5.0' },
    { code: 'HEMATO-04', name: 'Hematokrit (Ht)', category: 'Hematologi', unit: '%', normalRangeText: 'L: 40-50, P: 36-46' },
    { code: 'HEMATO-05', name: 'Trombosit (PLT)', category: 'Hematologi', unit: '/uL', normalRangeText: '150000 - 400000' },
    { code: 'HEMATO-06', name: 'MCV', category: 'Hematologi', unit: 'fL', normalRangeText: '80 - 100' },
    { code: 'HEMATO-07', name: 'MCH', category: 'Hematologi', unit: 'pg', normalRangeText: '26 - 34' },
    { code: 'HEMATO-08', name: 'MCHC', category: 'Hematologi', unit: 'g/dL', normalRangeText: '32 - 36' },
    
    // Hitung Jenis (Differential Count)
    { code: 'DIFF-01', name: 'Basofil', category: 'Hitung Jenis Leukosit', unit: '%', normalRangeText: '0 - 1' },
    { code: 'DIFF-02', name: 'Eosinofil', category: 'Hitung Jenis Leukosit', unit: '%', normalRangeText: '1 - 3' },
    { code: 'DIFF-03', name: 'Netrofil Batang', category: 'Hitung Jenis Leukosit', unit: '%', normalRangeText: '2 - 6' },
    { code: 'DIFF-04', name: 'Netrofil Segmen', category: 'Hitung Jenis Leukosit', unit: '%', normalRangeText: '50 - 70' },
    { code: 'DIFF-05', name: 'Limfosit', category: 'Hitung Jenis Leukosit', unit: '%', normalRangeText: '20 - 40' },
    { code: 'DIFF-06', name: 'Monosit', category: 'Hitung Jenis Leukosit', unit: '%', normalRangeText: '2 - 8' },

    // Kimia Klinik (Clinical Chemistry)
    { code: 'KIMIA-01', name: 'Gula Darah Puasa (GDP)', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '70 - 110' },
    { code: 'KIMIA-02', name: 'Gula Darah 2 Jam PP', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '< 140' },
    { code: 'KIMIA-03', name: 'Gula Darah Sewaktu (GDS)', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '< 200' },
    { code: 'KIMIA-04', name: 'Kolesterol Total', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '< 200' },
    { code: 'KIMIA-05', name: 'Trigliserida', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '< 150' },
    { code: 'KIMIA-06', name: 'HDL Kolesterol', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '> 40' },
    { code: 'KIMIA-07', name: 'LDL Kolesterol', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '< 100' },
    { code: 'KIMIA-08', name: 'Ureum', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: '15 - 40' },
    { code: 'KIMIA-09', name: 'Kreatinin', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: 'L: 0.6-1.2, P: 0.5-1.1' },
    { code: 'KIMIA-10', name: 'Asam Urat', category: 'Kimia Klinik', unit: 'mg/dL', normalRangeText: 'L: 3.4-7.0, P: 2.4-5.7' },
    { code: 'KIMIA-11', name: 'SGOT (AST)', category: 'Kimia Klinik', unit: 'U/L', normalRangeText: '< 35' },
    { code: 'KIMIA-12', name: 'SGPT (ALT)', category: 'Kimia Klinik', unit: 'U/L', normalRangeText: '< 41' },

    // Imunologi / Serologi
    { code: 'IMUN-01', name: 'Widal S. Typhi O', category: 'Imunologi', unit: 'Titer', normalRangeText: 'Negatif' },
    { code: 'IMUN-02', name: 'Widal S. Typhi H', category: 'Imunologi', unit: 'Titer', normalRangeText: 'Negatif' },
    { code: 'IMUN-03', name: 'HBsAg', category: 'Imunologi', unit: '', normalRangeText: 'Non Reaktif' },
    { code: 'IMUN-04', name: 'Anti-HIV', category: 'Imunologi', unit: '', normalRangeText: 'Non Reaktif' },
    { code: 'IMUN-05', name: 'NS1 Dengue', category: 'Imunologi', unit: '', normalRangeText: 'Negatif' },
    { code: 'IMUN-06', name: 'IgG/IgM Dengue', category: 'Imunologi', unit: '', normalRangeText: 'Negatif' },

    // Urinalisa
    { code: 'URIN-01', name: 'Warna Urin', category: 'Urinalisa', unit: '', normalRangeText: 'Kuning Muda' },
    { code: 'URIN-02', name: 'Kejernihan', category: 'Urinalisa', unit: '', normalRangeText: 'Jernih' },
    { code: 'URIN-03', name: 'pH Urin', category: 'Urinalisa', unit: '', normalRangeText: '4.8 - 7.4' },
    { code: 'URIN-04', name: 'Berat Jenis', category: 'Urinalisa', unit: '', normalRangeText: '1.015 - 1.025' },
    { code: 'URIN-05', name: 'Protein Urin', category: 'Urinalisa', unit: '', normalRangeText: 'Negatif' },
    { code: 'URIN-06', name: 'Glukosa Urin', category: 'Urinalisa', unit: '', normalRangeText: 'Negatif' },
    { code: 'URIN-07', name: 'Keton', category: 'Urinalisa', unit: '', normalRangeText: 'Negatif' },
    { code: 'URIN-08', name: 'Bilirubin Urin', category: 'Urinalisa', unit: '', normalRangeText: 'Negatif' },
    { code: 'URIN-09', name: 'Eritrosit Urin', category: 'Urinalisa', unit: '/LPB', normalRangeText: '0 - 1' },
    { code: 'URIN-10', name: 'Leukosit Urin', category: 'Urinalisa', unit: '/LPB', normalRangeText: '0 - 3' }
  ]

  for (const test of labTests) {
    const testWithPrice = { ...test, price: 0 }
    await prisma.labTestMaster.upsert({
      where: { code: test.code },
      update: testWithPrice,
      create: testWithPrice
    })
    console.log(`Upserted ${test.name}`)
  }

  console.log('Seeding LabTestMaster finished.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
