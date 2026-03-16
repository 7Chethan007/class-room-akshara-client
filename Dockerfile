# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Build the application
COPY . .
RUN npm run build

# Runtime stage - use nginx to serve
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Simple nginx config - just serve static files
RUN echo 'server {
    listen 3000;
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}' > /etc/nginx/conf.d/default.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
