import { PrismaClient } from '@prisma/client';
const url = 'postgresql://passflat:passflat@localhost:5433/passflat';
const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  const cols = await prisma.$queryRawUnsafe(
    `select column_name from information_schema.columns where table_name='cost_reports' and column_name in ('source','imported_email','claimed_at') order by 1`,
  );
  console.log('LOCAL cost_reports new cols:', JSON.stringify(cols));
  const city = await prisma.city.findUnique({ where: { slug: 'warsaw' } });
  console.log('LOCAL warsaw city:', city ? city.id : null, 'bounds:', JSON.stringify(city?.bounds));
  const mig = await prisma.$queryRawUnsafe(
    `select migration_name, finished_at from _prisma_migrations order by started_at`,
  );
  console.log('LOCAL migrations:', JSON.stringify(mig));
} catch (e) {
  console.log('LOCAL ERROR name:', e?.name, 'code:', e?.code);
  console.log('LOCAL ERROR message:', String(e?.message).split('\n')[0]);
} finally {
  await prisma.$disconnect();
}
