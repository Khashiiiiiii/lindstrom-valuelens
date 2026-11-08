# Container image for the dashboard (Next.js standalone, Node 24). Ollama is not in the image: the app calls the model
# at OLLAMA_URL (with OLLAMA_HEADERS), or serves canned replies with ASSISTANT_STUB=1. Runs as any UID in group 0, as
# OpenShift requires.

FROM docker.io/library/node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM docker.io/library/node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Read at runtime with process.cwd(), so copied explicitly rather than trusting the file trace.
COPY --from=build /app/public ./public
COPY --from=build /app/data/processed ./data/processed
RUN chgrp -R 0 /app && chmod -R g=u /app
USER 1001
EXPOSE 8080
CMD ["node", "server.js"]
