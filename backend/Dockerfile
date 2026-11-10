FROM node:24-bookworm-slim AS compilacao
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
RUN node node_modules/prisma/build/index.js generate
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

FROM compilacao AS migrations
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=compilacao /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
