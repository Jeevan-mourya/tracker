#!/bin/bash
set -e

echo "====== Building Tracker3D (Full Build) ======"

TRACKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$TRACKER_DIR"

echo "1. Cleaning previous build artifacts..."
rm -rf staging_dir Tracker3D.jar Manifest.txt source_files.txt build-src.log
mkdir -p staging_dir

echo "2. Extracting base tracker.jar & all dependency JARs..."
if [ -f "distribution/tracker.jar" ]; then
    unzip -q distribution/tracker.jar -d staging_dir
else
    echo "ERROR: distribution/tracker.jar not found!"
    exit 1
fi

# Extract all third-party libraries so the compiler can see them
find . -type f -name '*.jar' ! -name 'Tracker3D.jar' ! -name 'tracker.jar' \
    -exec bash -c 'unzip -qo {} -d staging_dir/' \;
echo "   ✓ Extracted base and dependencies"

echo "3. Compiling custom source code..."
# Find all java files in src, but ignore the src/test/ folder to prevent duplicate class errors
find src -name "*.java" | grep -v "/test/" > source_files.txt

# Compile using staging_dir as both the classpath and the output destination
javac -d staging_dir \
      -encoding UTF-8 \
      -source 17 \
      -target 17 \
      -Xlint:-serial \
      -cp "staging_dir" \
      @source_files.txt 2>&1 | tee build-src.log

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "   ERROR: Compilation failed!"
    cat build-src.log
    exit 1
fi
echo "   ✓ Custom code compiled successfully!"

echo "4. Cleaning up security signatures from dependencies..."
rm -f staging_dir/META-INF/*.SF staging_dir/META-INF/*.DSA staging_dir/META-INF/*.RSA
chmod -R u+r,u+w staging_dir/ 2>/dev/null || true

echo "5. Packaging Tracker3D.jar..."
cat > Manifest.txt << 'INNER_EOF'
Manifest-Version: 1.0
Main-Class: org.opensourcephysics.cabrillo.tracker.Tracker
Implementation-Title: Tracker 3D
Implementation-Version: 6.0
INNER_EOF

jar cfm Tracker3D.jar Manifest.txt -C staging_dir/ .

SIZE=$(du -h Tracker3D.jar | cut -f1)
echo ""
echo "====== BUILD SUCCESSFUL ======"
echo "✓ Tracker3D.jar created (size: $SIZE)"

rm -rf staging_dir Manifest.txt source_files.txt build-src.log
