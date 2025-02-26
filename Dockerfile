# Use Node.js 20 base image (lightweight)
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for caching dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire project
COPY . .

