import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const buildingId = 'fbb82390-6b98-4717-9acf-d814ff9386b1';
const authorId = '53a6d550-7acf-467e-9355-89875d9a1e84';

const rent = '4700', adminFee = '800', deposit = '6000', otherCosts = '600',
  rooms = '3', areaM2 = '64', floor = '6', rentalType = 'apartment';
const totalMonthlyAvg = (parseFloat(rent) || 0) + (parseFloat(adminFee) || 0) + (parseFloat(otherCosts) || 0);

try {
  await prisma.$transaction(async (tx) => {
    const cr = await tx.costReport.create({
      data: {
        buildingId,
        authorId,
        source: 'user',
        importedEmail: null,
        claimedAt: null,
        currency: 'PLN',
        rent: rent ? parseFloat(rent) : null,
        adminFee: adminFee ? parseFloat(adminFee) : null,
        depositAmount: deposit ? parseFloat(deposit) : null,
        otherCosts: otherCosts ? parseFloat(otherCosts) : null,
        totalMonthlyAvg: totalMonthlyAvg || null,
        rooms: rooms ? parseInt(rooms, 10) : null,
        areaM2: areaM2 ? parseFloat(areaM2) : null,
        floor: floor ? parseInt(floor, 10) : null,
        rentalType: rentalType || null,
        isCurrentTenant: true,
        isVisible: true,
        verificationStatus: 'unverified',
        periodicCharges: undefined,
      },
      include: { building: true, periodicCharges: true },
    });
    console.log('CREATE OK id:', cr.id);
    throw new Error('__ROLLBACK__');
  });
} catch (e) {
  if (e instanceof Error && e.message === '__ROLLBACK__') {
    console.log('Rolled back as planned. No real insert.');
  } else {
    console.log('CAUGHT ERROR:');
    console.log('name:', e?.name);
    console.log('code:', e?.code);
    console.log('message:', e?.message);
  }
} finally {
  await prisma.$disconnect();
}
