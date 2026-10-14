# Build stage: compile the Angular app
FROM node:26-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

# Runtime stage: nginx serves the app and proxies /api to the backend
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist/staffsync-frontend/browser /usr/share/nginx/html
EXPOSE 80
