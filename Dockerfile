# Use official Node.js runtime as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p uploads results logs



# Install Redis for the BullMQ queue
RUN apk add --no-cache redis

# Expose the application port
EXPOSE 3000

# Start both Redis and the application
CMD redis-server --daemonize yes && npm start