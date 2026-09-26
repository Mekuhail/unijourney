# UniJourney — single container: Express API + built React client. Data (SQLite + uploads) lives in /data.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=8080 \
    DATA_DIR=/data \
    DEMO_MODE=true \
    DEMO_CLOCK=2026-09-27T09:00:00+03:00 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--import", "tsx", "server/index.ts"]
