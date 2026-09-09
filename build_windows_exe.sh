#!/bin/bash
#
# Build Windows .exe installer using Launch4j
# This script packages Tracker3D.jar with the Windows JRE into a standalone .exe
#
# Prerequisites:
#   - Launch4j JAR (can be downloaded or use Maven Central)
#   - Windows JRE bundled in windows-launcher/jre/
#   - Tracker3D.jar in current directory
#

set -e

TRACKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$TRACKER_DIR"

echo "====== Building Tracker3D.exe for Windows ======"
echo ""

# Configuration
JAR_FILE="Tracker3D.jar"
LAUNCHER_CONFIG="windows-launcher/tracker-launcher.xml"
OUTPUT_EXE="Tracker3D.exe"
LAUNCH4J_JAR="launch4j.jar"
WINDOWS_JRE_DIR="windows_jre"

# Check prerequisites
echo "1. Checking prerequisites..."

if [ ! -f "$JAR_FILE" ]; then
    echo "   ERROR: $JAR_FILE not found!"
    echo "   Please run ./build_tracker.sh first to create the fat JAR"
    exit 1
fi
echo "   ✓ Found $JAR_FILE"

if [ ! -f "$LAUNCHER_CONFIG" ]; then
    echo "   ERROR: $LAUNCHER_CONFIG not found!"
    exit 1
fi
echo "   ✓ Found Launch4j configuration"

# Download Launch4j if not present
if [ ! -f "$LAUNCH4J_JAR" ]; then
    echo ""
    echo "2. Downloading Launch4j (this is a one-time operation)..."
    # Using the latest release from Maven Central
    curl -L -o "$LAUNCH4J_JAR" \
        "https://sourceforge.net/projects/launch4j/files/launch4j-3/3.50/launch4j-3.50-linux-x64.tar.gz/download" \
        2>/dev/null || (
        echo "   NOTE: Could not download Launch4j automatically"
        echo "   Please download from: https://sourceforge.net/projects/launch4j/"
        echo "   Or use Maven: mvn dependency:copy -Dartifact=net.sf.launch4j:launch4j:3.50:jar"
        exit 1
    )
    
    echo "   ✓ Downloaded Launch4j"
fi

echo ""
echo "3. Building Windows .exe using Launch4j..."
echo ""

# Run Launch4j with the configuration
java -jar "$LAUNCH4J_JAR" "$LAUNCHER_CONFIG" 2>&1

if [ -f "$OUTPUT_EXE" ]; then
    SIZE=$(du -h "$OUTPUT_EXE" | cut -f1)
    echo ""
    echo "====== BUILD SUCCESSFUL ======"
    echo "✓ $OUTPUT_EXE created (size: $SIZE)"
    echo "  Location: $TRACKER_DIR/$OUTPUT_EXE"
    echo ""
    echo "Setup complete! To deploy:"
    echo "  1. Ensure windows_jre/ directory is present with the bundled JRE"
    echo "  2. Place the .exe and jre/ directory together"
    echo "  3. On Windows, run: Tracker3D.exe"
else
    echo "ERROR: $OUTPUT_EXE was not created!"
    exit 1
fi

echo ""
echo "Done!"
