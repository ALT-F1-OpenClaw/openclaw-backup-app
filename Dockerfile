FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public/ ./public/

FROM node:22-alpine
RUN apk add --no-cache git tini \
    && addgroup -S app && adduser -S app -G app \
    && mkdir /backup && chown app:app /backup
WORKDIR /app
COPY --from=build /app ./
USER app
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3100/api/status || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
