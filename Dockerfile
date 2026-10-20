# Stage 1: build the front end.
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: the FastAPI app, serving the API and the built front end.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/server
COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server/app ./app
COPY data /app/data
COPY --from=web /app/web/dist /app/web/dist
# Render sets PORT; default for local `docker run`.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
