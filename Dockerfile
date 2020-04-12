FROM node as tsbuild

WORKDIR /build

COPY . .
RUN yarn global add typescript && yarn && yarn build

FROM node
ENV NODE_ENV=production
COPY --from=tsbuild /build/dist .
COPY --from=tsbuild /build/node_modules ./node_modules

ENTRYPOINT ["node"]