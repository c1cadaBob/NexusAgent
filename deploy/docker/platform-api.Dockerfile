FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    NODE_OPTIONS=--experimental-strip-types

COPY platform ./platform
COPY product/api ./product/api

RUN chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "require('node:http').get({host:'127.0.0.1',port:Number(process.env.PORT||8080),path:'/v1/health'},r=>process.exit(r.statusCode>=200&&r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "product/api/server.mjs"]
