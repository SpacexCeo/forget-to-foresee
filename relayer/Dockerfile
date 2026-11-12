FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY api ./api
COPY lib ./lib
COPY scripts ./scripts
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server.js"]
