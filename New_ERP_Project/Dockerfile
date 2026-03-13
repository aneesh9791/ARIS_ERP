# Multi-stage build for production optimization
FROM node:18-alpine AS frontend-builder

# Set working directory
WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Backend stage
FROM node:18-alpine AS backend-builder

# Set working directory
WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Build backend (if needed)
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built applications
COPY --from=frontend-builder /app/frontend/build ./frontend/build/
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules/
COPY --from=frontend-builder /app/frontend/package.json ./frontend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules/
COPY --from=backend-builder /app/backend/package.json ./backend/
COPY --from=backend-builder /app/backend/dist ./backend/dist/  # if backend has dist
COPY --from=backend-builder /app/backend/src ./backend/src/

# Copy environment files
COPY docker-compose.yml ./
COPY nginx.conf ./
COPY .env.example ./.env

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 5000 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start command
CMD ["npm", "start"]
