FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://localhost:10000
ARG VITE_REALTIME_URL=http://localhost:10001
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
