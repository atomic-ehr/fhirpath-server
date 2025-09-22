# Use the official Bun image as base
FROM oven/bun:1 AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS production

WORKDIR /app

# Copy only necessary files
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY package.json ./

# Expose the port (default 4000, can be overridden)
EXPOSE 4000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun --eval "fetch('http://localhost:' + (process.env.PORT || 4000) + '/').then(() => process.exit(0)).catch(() => process.exit(1))"

# Run the server
CMD ["bun", "run", "dist/index.js"]