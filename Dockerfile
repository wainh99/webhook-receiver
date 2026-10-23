FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
# Deplexo web services listen on 3000 and need a health endpoint
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
