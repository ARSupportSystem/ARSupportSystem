#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERT_DIR="${BACKEND_DIR}/certs"

mkdir -p "${CERT_DIR}"

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "${CERT_DIR}/key.pem" \
  -out "${CERT_DIR}/cert.pem" \
  -subj "/C=GB/ST=Dorset/L=Bournemouth/O=ARSupportSystem/OU=Development/CN=localhost"

echo "Generated certificate: ${CERT_DIR}/cert.pem"
echo "Generated private key: ${CERT_DIR}/key.pem"
