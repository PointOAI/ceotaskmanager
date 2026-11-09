FROM node:22-slim
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm install --prefix server --omit=dev && npm install --prefix client
COPY . .
RUN npm run build --prefix client
ENV PORT=4000 DATA_DIR=/data
VOLUME /data
EXPOSE 4000
CMD ["node", "server/index.js"]
