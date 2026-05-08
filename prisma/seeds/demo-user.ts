/**
 * Seeds demo institution, subscription, and user.
 * Run with: npx tsx prisma/seeds/demo-user.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getPrismaClient } from '../_neon-http-prisma';

const prisma: PrismaClient = await getPrismaClient();
const DEMO_PASSWORD = process.env['DEMO_PASSWORD'] ?? 'demo12345';

async function main() {
  console.log('Seeding demo user...');

  const demoInstitution = await prisma.institution.upsert({
    where: { slug: 'demo-university' },
    update: {},
    create: {
      name: 'Demo University',
      slug: 'demo-university',
      country: 'UK',
      tier: 'professional',
    },
  });
  console.log(`Institution: ${demoInstitution.name} (${demoInstitution.id})`);

  await prisma.subscription.upsert({
    where: { institutionId: demoInstitution.id },
    update: {},
    create: {
      institutionId: demoInstitution.id,
      tier: 'PROFESSIONAL',
      status: 'active',
    },
  });
  console.log('Subscription: Professional tier created');

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@demo-university.ac.uk' },
    update: {},
    create: {
      email: 'demo@demo-university.ac.uk',
      name: 'Demo Admin',
      passwordHash: hash,
      role: 'INSTITUTION_ADMIN',
      institutionId: demoInstitution.id,
    },
  });
  console.log(`User: ${user.email} (role: ${user.role})`);
  console.log('\nDemo credentials:');
  console.log('  Email:    demo@demo-university.ac.uk');
  console.log('  Password: set via DEMO_PASSWORD (defaults to documented demo password for local testing)');
}

main().catch(console.error).finally(() => prisma.$disconnect());
