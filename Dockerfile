FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV WOOD_DB_FILE=/app/data/wood.sqlite

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public
COPY docs ./docs

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/session').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
