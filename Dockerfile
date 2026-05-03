FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

RUN mkdir -p data temp session

EXPOSE 5000

CMD ["node", "index.js"]
