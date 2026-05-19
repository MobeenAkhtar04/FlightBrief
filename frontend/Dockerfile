FROM node:20-alpine

WORKDIR /app

# copy package files first
COPY frontend/package.json ./

RUN npm install

COPY frontend/ .

EXPOSE 5173

# vite dev server
CMD ["npm", "run", "dev"]
