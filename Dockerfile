FROM node:24-alpine

WORKDIR /app

# Install all deps (dev deps are needed for prisma generate + tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client into src/generated, then compile
COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build && npm prune --omit=dev

CMD ["node", "dist/index.js"]
