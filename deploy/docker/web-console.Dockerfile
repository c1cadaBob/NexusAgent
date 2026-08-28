FROM node:22-alpine AS build

WORKDIR /app/product/web-console

COPY product/web-console/package.json product/web-console/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY product/web-console ./
RUN pnpm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    STATIC_ROOT=/app/dist

COPY deploy/docker/web-console-server.mjs ./server.mjs
COPY --from=build /app/product/web-console/dist ./dist

RUN chown -R node:node /app

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "require('node:http').get({host:'127.0.0.1',port:Number(process.env.PORT||8080),path:'/health'},r=>process.exit(r.statusCode>=200&&r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.mjs"]
