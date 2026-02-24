FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public/ ./public/
COPY scripts/ ./scripts/

FROM node:22-alpine
RUN apk add --no-cache git tini openssh-client bash gnupg tar coreutils
WORKDIR /app
COPY --from=build /app ./
RUN chmod +x /app/scripts/backup-openclaw.sh || true
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3100/api/status || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
