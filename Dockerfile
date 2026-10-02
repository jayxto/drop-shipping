FROM node:24-bookworm-slim
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/browsers HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY package.json ./
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
    && npm install --omit=dev && npx playwright install --with-deps chromium \
    && mkdir -p /data && chown node:node /data
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
