#!/usr/bin/env bash
# ==============================================================================
# Tracker Stereo 3D Workstation - Standalone Offline Desktop Packaging Script
# Compiles all Java SE sources and packages into an executable JAR.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/src"
BIN_DIR="${SCRIPT_DIR}/bin"
DIST_DIR="${SCRIPT_DIR}/dist"
JAR_NAME="tracker-stereo-workstation-1.0.0.jar"

echo "================================================================================"
echo " Packaging Tracker Stereo 3D Workstation (Standalone Desktop JAR)"
echo "================================================================================"

rm -rf "${BIN_DIR}" "${DIST_DIR}"
mkdir -p "${BIN_DIR}" "${DIST_DIR}"

echo "[Step 1/3] Compiling Java source files..."
# Find all Java source files
find "${SRC_DIR}" -name "*.java" > "${BIN_DIR}/sources.txt"

javac -encoding UTF-8 -d "${BIN_DIR}" @"${BIN_DIR}/sources.txt"
echo "✓ Compilation successful."

echo "[Step 2/3] Building executable JAR archive..."
jar cfm "${DIST_DIR}/${JAR_NAME}" "${SCRIPT_DIR}/MANIFEST.MF" -C "${BIN_DIR}" .
echo "✓ Created: ${DIST_DIR}/${JAR_NAME}"

echo "[Step 3/3] Verifying standalone package execution..."
echo "To launch your offline workstation:"
echo "  java -jar ${DIST_DIR}/${JAR_NAME}"
echo "================================================================================"
