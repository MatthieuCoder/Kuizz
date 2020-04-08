FROM node:current-alpine

ENV NODE_ENV=production

RUN mkdir /app
WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY dist .

CMD ["node", "loginService/LoginService.js"]
