# Dinner Spinner: one Node server that serves the built app and the shared household data.
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
# Mount a persistent disk here so the fridge, shopping list and recipe book survive restarts.
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8080
CMD ["npm", "start"]
