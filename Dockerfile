FROM node as build

WORKDIR /build

COPY . .

RUN npm i -g typescript && yarn && yarn build

FROM node

COPY --from=build /build/dist .
COPY --from=build /build/node_modules ./node_modules

ENTRYPOINT ["node", "index"]