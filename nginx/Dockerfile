FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

# bake in a self-signed cert for local dev
# for production, mount real certs to /etc/nginx/certs/ — they'll override these
RUN mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/certs/server.key \
        -out    /etc/nginx/certs/server.crt \
        -subj   "/C=US/ST=Dev/L=Local/O=FlightBrief/CN=localhost" 2>/dev/null

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
