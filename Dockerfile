# Pin the runtime and base-image digest; refresh deliberately after validation.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
# Align the container npm with the reviewed local toolchain.
RUN npm install --global npm@11.19.1 && npm cache clean --force
WORKDIR /usr/src/app

FROM base AS development
ENV NODE_ENV=development
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY --chown=node:node . .
RUN chown -R node:node /usr/src/app
USER node
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM development AS build
USER root
RUN npm run build

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS production
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
