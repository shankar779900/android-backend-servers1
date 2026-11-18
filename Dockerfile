FROM node:20-alpine

WORKDIR /usr/src/app

# Install dependencies, including Prisma CLI for migration deploy during startup.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

ENV NODE_ENV=production

# Expose app port
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy --schema backend/prisma/schema.prisma && node backend/server.js"]
