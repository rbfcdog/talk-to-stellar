FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY assets ./assets
COPY README.md ./README.md

# Railway provides PORT. Keep compatibility with TELEGRAM_HEALTH_PORT.
ENV TELEGRAM_HEALTH_PORT=3005
EXPOSE 3005

CMD ["node", "src/index.js"]
