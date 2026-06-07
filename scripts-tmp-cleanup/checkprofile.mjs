import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const authUsers = await prisma.$queryRawUnsafe(
    `select id, email from auth.users where lower(email) = 'ilya21968@gmail.com'`,
  );
  console.log('AUTH users:', JSON.stringify(authUsers));
  for (const u of authUsers) {
    const p = await prisma.profile.findUnique({ where: { id: u.id }, select: { id: true, displayName: true } });
    console.log(`profile for ${u.id}:`, JSON.stringify(p));
  }
  const total = await prisma.profile.count();
  console.log('total profiles on prod:', total);
} catch (e) {
  console.log('ERR', e?.name, e?.code, String(e?.message).split('\n')[0]);
} finally {
  await prisma.$disconnect();
}
