# Multi-stage build for optimized production image
FROM node:18-alpine AS base

# Install system dependencies needed for building
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (with better caching)
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    mysql-client \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy installed dependencies from base stage
COPY --from=base --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy application source code
COPY --chown=nextjs:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p uploads results logs && \
    chown -R nextjs:nodejs uploads results logs

# Switch to non-root user
USER nextjs


# Expose the port the app runs on
EXPOSE 8080

# Set production environment
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
