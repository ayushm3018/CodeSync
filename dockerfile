# Build the frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY ./Frontend/package*.json ./
RUN npm ci
COPY ./Frontend ./
RUN npm run build

# Build the backend
FROM node:22-alpine AS backend
WORKDIR /app
COPY ./Backend/package*.json ./
RUN npm ci --omit=dev
COPY ./Backend ./
COPY --from=frontend-builder /app/dist ./public
EXPOSE 3000
CMD ["node", "server.js"]
