// Backfill: create Doctor records for all guest doctors that have active assignments
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.guestDoctorAssignment.findMany({
    where: { status: { in: ['SCHEDULED', 'ACTIVE'] } },
    include: { guestDoctor: true }
  });

  for (const a of assignments) {
    const gd = a.guestDoctor;
    if (!a.userId) {
      console.log(`Skipping ${gd.name} - no userId`);
      continue;
    }

    const existing = await prisma.doctor.findUnique({ where: { licenseNumber: gd.licenseNumber } });
    if (existing) {
      console.log(`Doctor record already exists for ${gd.name}: ${existing.id}`);
      continue;
    }

    const doc = await prisma.doctor.create({
      data: {
        userId: a.userId,
        licenseNumber: gd.licenseNumber,
        name: gd.name,
        phone: gd.phone,
        specialization: gd.specialization,
        isActive: true
      }
    });
    console.log(`Created Doctor record for ${gd.name}: ${doc.id}`);
  }

  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
