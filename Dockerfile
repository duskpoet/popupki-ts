FROM node:21-alpine

WORKDIR /app
COPY . /app/
RUN yarn install --frozen-lockfile --production
RUN yarn prisma generate
RUN yarn build
CMD ["node", "dist/index.js"]
