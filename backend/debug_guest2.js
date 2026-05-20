const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const clinicId = '46176c91-1355-4fb9-acfe-1a753e296fd5';

  // Simulate getDoctors query
  const doctors = await prisma.doctor.findMany({
    where: {
      OR: [
        { departments: { some: { clinicId } } },
        { user: { clinics: { some: { clinicId } } } }
      ]
    },
    select: { id: true, name: true, specialization: true, departments: { select: { id: true, name: true } } }
  });
  console.log('Doctors from regular query:', JSON.stringify(doctors, null, 2));

  // Simulate guest assignment lookup
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  console.log('\nDate range:', startOfDay.toISOString(), '->', endOfDay.toISOString());

  const guestAssignment = await prisma.guestDoctorAssignment.findFirst({
    where: {
      clinicId,
      status: { in: ['SCHEDULED', 'ACTIVE'] },
      date: { gte: startOfDay, lte: endOfDay }
    },
    include: { guestDoctor: true }
  });
  console.log('\nGuest assignment found:', guestAssignment ? { name: guestAssignment.guestDoctor.name, date: guestAssignment.date.toISOString(), status: guestAssignment.status } : null);

  if (guestAssignment) {
    const gd = guestAssignment.guestDoctor;
    const doctorRecord = await prisma.doctor.findUnique({
      where: { licenseNumber: gd.licenseNumber },
      select: { id: true, name: true }
    });
    console.log('\nDoctor record for guest:', doctorRecord);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
