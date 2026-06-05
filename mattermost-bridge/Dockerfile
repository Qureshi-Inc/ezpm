FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
# Drop root: the bridge writes nothing to disk and needs no privileges.
USER node
CMD ["node", "index.js"]
