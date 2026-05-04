#Build the frontend
FROM node:22-alpine AS frontend-builder

COPY ./Frontend /app

WORKDIR /app

RUN npm install

RUN npm run build 


#better way is  : COPY ./Frontend/package*.json /app/    ← changes only when deps change
# WORKDIR /app
# RUN npm install                        ← cached unless package.json changed
# COPY ./Frontend /app                   ← copies the rest of the source
# RUN npm run build                      ← only this re-runs when you edit code



#Build the backend
FROM node:22-alpine AS backend-builder

COPY ./Backend /app

WORKDIR /app

RUN npm install

COPY --from=frontend-builder /app/dist /app/public

CMD ["node", "server.js"]

