import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const command = process.argv[2];

try {
  if (command === 'reset-usage') {
    const usage = await prisma.usageRecord.deleteMany({});
    const chats = await prisma.chatMessage.deleteMany({});
    console.log(`Deleted ${usage.count} usage records and ${chats.count} chat messages`);
  } else if (command === 'make-due') {
    const past = new Date(Date.now() - 60_000);
    const result = await prisma.subscription.updateMany({
      where: { status: 'active' },
      data: { renewalDate: past, endDate: past },
    });
    console.log(`Made ${result.count} active subscription(s) due for renewal`);
  } else if (command === 'show') {
    const subs = await prisma.subscription.findMany({
      select: { id: true, tier: true, status: true, autoRenew: true, usedMessages: true, endDate: true },
      orderBy: { createdAt: 'asc' },
    });
    const payments = await prisma.paymentAttempt.findMany({
      select: { succeeded: true, reason: true, amountCents: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log('Subscriptions:');
    console.table(subs);
    console.log('Payment attempts:');
    console.table(payments);
  } else {
    console.log('Usage: node --env-file=.env scripts/db.mjs <reset-usage | make-due | show>');
  }
} finally {
  await prisma.$disconnect();
}