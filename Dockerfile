FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src/ ./src/
COPY openapi.yaml ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/openapi.yaml ./
RUN mkdir -p /app/data
EXPOSE 4000
CMD ["node", "dist/src/index.js"]
