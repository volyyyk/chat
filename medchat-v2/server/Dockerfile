# Образ сервера MedChat (прод-контур — ../deploy/DEPLOY.md).
# Node 22 (server/package.json engines), Alpine. Нативный bcrypt собирается
# с python3/make/g++ и инструменты удаляются после install (musl-пребилдов нет).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache python3 make g++ \
 && npm install --omit=dev --no-audit --no-fund \
 && apk del python3 make g++ \
 && rm -rf /root/.npm

COPY . .

# Живность: /health отвечает при готовом Express; nginx пробрасывает /health дальше.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

EXPOSE 3000
CMD ["node", "src/index.js"]