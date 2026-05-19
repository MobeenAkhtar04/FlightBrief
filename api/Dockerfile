FROM python:3.12-slim

WORKDIR /app

# install build tools for the C++ extension
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    g++ \
    git \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# install python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# install pybind11
RUN pip install --no-cache-dir pybind11

# copy C++ source and build the extension
# pybind11 installed via pip puts its cmake config in a non-standard place,
# so we ask python where it is and pass it to cmake explicitly
COPY cpp/ /cpp/
RUN PYBIND11_CMAKE=$(python3 -m pybind11 --cmakedir) && \
    mkdir -p /cpp/build && \
    cd /cpp/build && \
    cmake .. \
      -DCMAKE_BUILD_TYPE=Release \
      -Dpybind11_DIR="$PYBIND11_CMAKE" && \
    cmake --build . -- -j$(nproc) && \
    echo "C++ extension built successfully"

# install the .so into python site-packages so the ./api:/app volume
# mount in docker-compose can't wipe it at runtime
RUN SITE=$(python3 -c "import site; print(site.getsitepackages()[0])") && \
    find /cpp /api -name "navengine_ext*.so" | tee /dev/stderr | \
    xargs -I{} cp {} "$SITE/" && \
    echo "installed navengine_ext to $SITE"

# copy api source
COPY api/ /app/

# copy db schema for init_db
COPY db/ /db/

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
