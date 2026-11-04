FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY . .
# the source files were uploaded as .ts.txt / .tsx.txt (the GitHub web uploader refuses .ts): put the real names back
RUN find . -path ./node_modules -prune -o -type f \( -name '*.ts.txt' -o -name '*.tsx.txt' \) -print | while read f; do mv "$f" "${f%.txt}"; done
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
