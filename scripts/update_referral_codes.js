// Load dotenv if available so the script can be run directly from the repo root.
const path = require('path');
const dotenvPaths = [path.resolve(__dirname, '..', '.env.local'), path.resolve(__dirname, '..', '.env')];
for (const envPath of dotenvPaths) {
  try {
    require('dotenv').config({ path: envPath });
    if (process.env.DATABASE_URL) break;
  } catch (err) {
    // ignore if dotenv not installed
  }
}

const { prisma } = require('../prisma');

if (!process.env.DATABASE_URL) {
  console.error('Environment variable DATABASE_URL is not set.');
  console.error('Create a `backend/.env` or `backend/.env.local` with DATABASE_URL or run the script with the env inline:');
  console.error('  DATABASE_URL="mysql://user:pass@host:3306/db" node backend/scripts/update_referral_codes.js');
  process.exit(1);
}

function cleanName(username) {
  return String(username || 'USER').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
}

function randomSix() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function generateUniqueCode(userId, namePart) {
  let tries = 0;
  while (tries < 12) {
    const candidate = `${namePart}${randomSix()}`.slice(0, 16);
    const exists = await prisma.user.findFirst({
      where: {
        referralCode: candidate,
        NOT: { id: userId }
      }
    });
    if (!exists) return candidate;
    tries += 1;
  }
  throw new Error('Unable to generate unique referral code after retries');
}

async function updateForUser(user) {
  const namePart = cleanName(user.username || user.email.split('@')[0]);
  const code = await generateUniqueCode(user.id, namePart);

  await prisma.user.update({ where: { id: user.id }, data: { referralCode: code } });
  console.log(`Updated ${user.email} -> ${code}`);
}

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, username: true, referralCode: true }
    });

    for (const user of users) {
      await updateForUser(user);
    }
  } catch (err) {
    console.error('Error updating referral codes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main();
