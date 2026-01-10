FROM node:20-bullseye-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run prisma:generate
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["sh","-lc","set -e; if [ -f dist/index.js ]; then ENTRY=dist/index.js; elif [ -f dist/src/index.js ]; then ENTRY=dist/src/index.js; else echo FATAL:compiled_entry_not_found; echo dist_contents:; ls -R dist || true; exit 1; fi; echo Starting:$ENTRY; npx prisma migrate deploy || true; node $ENTRY"]