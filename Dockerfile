# IROC DataHub as a container, for a Linux server or NAS that hosts the shared instance.
#   docker build -t iroc-datahub .
#   docker run -d --name datahub -p 8765:8765 -v /srv/iroc_data:/data iroc-datahub
# The data root is mounted at /data. "Open folder" buttons do nothing inside a container;
# users open the paths shown in the UI on their own machines instead.

FROM node:22-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY requirements.lock pyproject.toml README.md ./
COPY vendor/ vendor/
RUN pip install --no-cache-dir -r requirements.lock \
 && pip install --no-cache-dir vendor/iroc_qa-*.whl --no-deps \
 && pip install --no-cache-dir "SimpleITK>=2.2" "nibabel>=4.0" "scipy>=1.7" "scikit-image>=0.19" "matplotlib>=3.5" rt-utils
COPY backend/ backend/
COPY --from=frontend /src/backend/iroc_datahub/static backend/iroc_datahub/static
RUN pip install --no-cache-dir -e . --no-deps
ENV IROC_DATAHUB_SETTINGS=/config/settings.json
VOLUME ["/data", "/config"]
EXPOSE 8765
CMD ["iroc-datahub", "serve", "--host", "0.0.0.0", "--port", "8765", "--root", "/data", "--no-browser"]
