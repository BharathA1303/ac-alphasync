# ============================================================================
#  AlphaSync Real — Backend image (FastAPI + Gunicorn/Uvicorn)
#  Build context: ./backend   Built ON the server via compose up -d --build.
# ============================================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# curl is used by the compose healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY . .

# Non-root runtime user; owns uploads dir (mounted as a named volume).
RUN addgroup --system app && adduser --system --ingroup app app \
    && mkdir -p /app/uploads/avatars \
    && chown -R app:app /app
USER app

EXPOSE 8000
CMD ["gunicorn", "main:app", "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
