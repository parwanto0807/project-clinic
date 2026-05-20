const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  console.log('Now:', now.toISOString());
  console.log('startOfDay:', startOfDay.toISOString());
  console.log('endOfDay:', endOfDay.toISOString());

  // All assignments last 5
  const all = await prisma.guestDoctorAssignment.findMany({
    orderBy: { date: 'desc' },
    take: 5,
    include: { guestDoctor: true }
  });
  console.log('\nLast 5 assignments:');
  all.forEach(a => console.log({ id: a.id, date: a.date.toISOString(), status: a.status, clinicId: a.clinicId, name: a.guestDoctor.name }));

  // Today filter
  const todayAssignments = await prisma.guestDoctorAssignment.findMany({
    where: {
      status: { in: ['SCHEDULED', 'ACTIVE'] },
      date: { gte: startOfDay, lte: endOfDay }
    },
    include: { guestDoctor: true }
  });
  console.log('\nActive today (no clinicId filter):', todayAssignments.length);
  todayAssignments.forEach(a => console.log({ id: a.id, date: a.date.toISOString(), status: a.status, clinicId: a.clinicId, name: a.guestDoctor.name }));

  // Check Doctor records for guest doctors
  const doctors = await prisma.doctor.findMany({
    where: { licenseNumber: { in: all.map(a => a.guestDoctor.licenseNumber) } },
    select: { id: true, name: true, licenseNumber: true, userId: true }
  });
  console.log('\nDoctor records for guest doctors:', doctors);

  // Check clinics
  const clinics = await prisma.clinic.findMany({ select: { id: true, name: true, isMain: true } });
  console.log('\nClinics:', clinics);
}
main().catch(console.error).finally(() => prisma.$disconnect());
