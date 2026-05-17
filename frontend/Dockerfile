# Railway-ready production Dockerfile for Next.js.
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

FROM node:20-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["sh", "-c", "npm start -- -p ${PORT:-3000}"]
