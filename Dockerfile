FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci
COPY tsconfig*.json ./
COPY src/ ./src/
COPY openapi.yaml ./
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/openapi.yaml ./
RUN mkdir -p /app/data
EXPOSE 4000
CMD ["node", "dist/src/index.js"]
