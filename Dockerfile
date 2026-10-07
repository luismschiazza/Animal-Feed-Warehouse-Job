# Use a Node.js base image
FROM node:24.16.0-alpine AS development

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the entire project to the working directory
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application in development mode
CMD ["sh", "-c", "npm run console seed && npm run start:dev"]

###################
# Build for production
###################
FROM node:24.16.0-alpine AS build

# Set the working directory
WORKDIR /usr/src/app

# Copy dependencies and source files from development stage
COPY --from=development /usr/src/app ./

# Build project
RUN npm run build

# Install production-safe deps (rebuild consistency)
RUN npm install --production=false --package-lock-only && npm cache clean --force

# Set environment
ENV NODE_ENV=production

###################
# Production
###################
FROM node:24.16.0-alpine AS production

# Set working directory
WORKDIR /usr/src/app

# Copy build result
COPY --from=build /usr/src/app ./

# Expose port
EXPOSE 3000

# Start production server
CMD ["node", "dist/main"]