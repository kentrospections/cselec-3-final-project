FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml ./
RUN uv sync --no-dev
COPY . .
RUN chmod +x scripts/entrypoint.sh
CMD ["bash", "scripts/entrypoint.sh"]
