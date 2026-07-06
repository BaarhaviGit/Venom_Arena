# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm install

# Production stage
FROM node:18-alpine
WORKDIR /app
# Run as non-root user
USER node

# Copy dependencies and application code
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server/ ./

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start application
CMD ["node", "server.js"]
