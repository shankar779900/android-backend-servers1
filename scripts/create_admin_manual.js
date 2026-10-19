const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function createId() {
  return crypto.randomBytes(16).toString('hex');
}

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Run this script in an interactive terminal.'));
      return;
    }

    let value = '';
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          input.setRawMode(false);
          input.pause();
          input.removeListener('data', onData);
          process.stdout.write('\n');
          reject(new Error('Password entry cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          input.setRawMode(false);
          input.pause();
          input.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (char >= ' ') {
          value += char;
          process.stdout.write('*');
        }
      }
    };

    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  try {
    const username = process.argv[2];
    if (!username) {
      console.error('Usage: node create_admin_manual.js <username>');
      process.exit(2);
    }

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      console.error('Admin already exists:', username);
      process.exit(1);
    }

    const plain = await promptHidden('New admin password (minimum 12 characters): ');
    if (plain.length < 12) {
      console.error('Password must be at least 12 characters.');
      process.exit(2);
    }

    const hashed = await bcrypt.hash(plain, 10);
    const secretKey = crypto.randomBytes(16).toString('hex');
    const admin = await prisma.admin.create({
      data: {
        id: createId(),
        username,
        password: hashed,
        secretKey,
      },
    });

    console.log('Created new admin account:');
    console.log(`username: ${admin.username}`);
    console.log('Password stored as a bcrypt hash. Keep the password you entered secure.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err.message || err);
    process.exit(1);
  }
}

main();
