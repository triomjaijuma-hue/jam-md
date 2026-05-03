FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ffmpeg wget curl git ca-certificates unzip \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Allow git to clone GitHub deps via HTTPS (no SSH keys in Docker)
RUN git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"    && \
    git config --global http.sslVerify false

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

RUN mkdir -p data temp session

EXPOSE 5000

CMD ["npm", "run", "start:optimized"]
