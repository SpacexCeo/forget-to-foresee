FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
ENV PORT=8788 NODE_ENV=production
EXPOSE 8788
USER node
CMD ["node", "server.js"]
