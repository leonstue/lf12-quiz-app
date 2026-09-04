# syntax=docker/dockerfile:1

############################
# 1) Dependencies (cached) #
############################
FROM node:22-alpine AS deps
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

############################
# 2) Build                 #
############################
FROM node:22-alpine AS build
WORKDIR /app
ENV npm_config_update_notifier=false
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.node.json vite.config.ts svelte.config.js ./
COPY index.html ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
RUN npm run build

############################
# 3) Production deps only  #
############################
FROM node:22-alpine AS prod-deps
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

############################
# 4) Runtime               #
############################
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST_BIND=0.0.0.0

# Kleines Signal-Handling fuer sauberes Herunterfahren
RUN apk add --no-cache dumb-init

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Quizze mitliefern, damit das Image auch ohne Volume spielbar ist.
# Die Compose-Datei mountet zusaetzlich ./quizzes -- dann gewinnt der Host.
COPY --chown=node:node quizzes ./quizzes
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>r.json()).then(d=>process.exit(d.status==='ok'?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]
