# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client and build the application
RUN npm run db:generate && npm run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]