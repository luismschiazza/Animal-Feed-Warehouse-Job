# Pin the runtime and base-image digest; refresh deliberately after validation.
FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS base
# Reviewed npm minor update within v11, used only by development/build stages.
RUN npm install --global npm@11.21.1 \
    && npm install --prefix /tmp/toolchain-patch --ignore-scripts --no-audit --no-fund --save-exact undici@6.29.1 ip-address@10.7.4 \
    && rm -rf /usr/local/lib/node_modules/npm/node_modules/undici /usr/local/lib/node_modules/npm/node_modules/ip-address \
    && mv /tmp/toolchain-patch/node_modules/undici /usr/local/lib/node_modules/npm/node_modules/undici \
    && mv /tmp/toolchain-patch/node_modules/ip-address /usr/local/lib/node_modules/npm/node_modules/ip-address \
    && rm -rf /tmp/toolchain-patch \
    && npm cache clean --force
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
# Runtime needs node, not global package managers or their vulnerable toolchains.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
