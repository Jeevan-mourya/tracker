#!/bin/bash
set -e

echo "====== Building Tracker3D with Fixed ClassCastException ======"
echo ""

TRACKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$TRACKER_DIR"

# Directories
TEMP_CLASSES="temp-fix-classes"
OLD_JAR="distribution/tracker.jar"

echo "1. Cleaning previous build artifacts..."
rm -rf "$TEMP_CLASSES" staging_dir Tracker3D.jar Manifest.txt
mkdir -p "$TEMP_CLASSES"

echo ""
echo "2. Extracting existing tracker.jar (base for the fix)..."
if [ -f "$OLD_JAR" ]; then
    unzip -q "$OLD_JAR" -d "$TEMP_CLASSES"
    echo "   ✓ Extracted $OLD_JAR (contains OSP + Tracker classes)"
else
    echo "   ERROR: $OLD_JAR not found!"
    exit 1
fi

echo "3. Compiling ALL custom source code (including Stereo3D UI and fixes)..."
echo "   (using extracted classes as classpath)"

# Find all java files in your src directory
find src -name "*.java" > source_files.txt

# Compile all of them, overwriting the base classes with your custom code
javac -d "$TEMP_CLASSES" \
      -encoding UTF-8 \
      -source 17 \
      -target 17 \
      -Xlint:-serial \
      -cp "$TEMP_CLASSES" \
      @source_files.txt 2>&1 | tee build-src.log

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "   ERROR: Compilation failed!"
    cat build-src.log
    exit 1
fi

echo "   ✓ All custom code compiled successfully!"

echo ""
echo "4. Extracting all dependency JARs for fat JAR..."
mkdir -p staging_dir
find . -type f -name '*.jar' ! -name 'Tracker3D.jar' ! -name 'tracker.jar' \
    -exec bash -c 'echo "   Extracting: $(basename {})" && unzip -qo {} -d staging_dir/' \;

echo ""
echo "5. Copying all compiled classes (including fixed FirstDerivative)..."
cp -r "$TEMP_CLASSES"/* staging_dir/
echo "   ✓ Copied classes to staging directory"

echo ""
echo "6. Fixing file permissions..."
chmod -R u+r,u+w staging_dir/ 2>/dev/null || true
find staging_dir/ -type d -exec chmod u+rwx {} \; 2>/dev/null || true
echo "   ✓ Fixed permissions"

echo ""
echo "7. Cleaning up security signatures from dependencies..."
rm -f staging_dir/META-INF/*.SF staging_dir/META-INF/*.DSA staging_dir/META-INF/*.RSA
echo "   ✓ Removed certificate files"

echo ""
echo "8. Writing Manifest..."
cat > Manifest.txt << 'EOF'
Manifest-Version: 1.0
Main-Class: org.opensourcephysics.cabrillo.tracker.Tracker
Implementation-Title: Tracker 3D
Implementation-Version: 6.0
Created-By: Tracker Build Script
Build-Date: 2026-09-09
EOF

echo ""
echo "9. Packaging Tracker3D.jar (fat JAR with all dependencies and fix)..."
jar cfm Tracker3D.jar Manifest.txt -C staging_dir/ .

if [ -f "Tracker3D.jar" ]; then
    SIZE=$(du -h Tracker3D.jar | cut -f1)
    echo ""
    echo "====== BUILD SUCCESSFUL ======"
    echo "✓ Tracker3D.jar created (size: $SIZE)"
    echo "  Location: $TRACKER_DIR/Tracker3D.jar"
    echo ""
    echo "Changes made:"
    echo "  - Fixed FirstDerivative.java line 66 with defensive type-checking"
    echo "  - boolean[] cast now validates instanceof before casting"
    echo "  - Graceful fallback to empty boolean[] if type mismatch occurs"
    echo ""
    echo "To test the build locally:"
    echo "  export DISPLAY=:1"  
    echo "  java -jar Tracker3D.jar"
else
    echo "ERROR: Tracker3D.jar was not created!"
    exit 1
fi

echo ""
echo "Cleaning up temporary files..."
rm -rf "$TEMP_CLASSES" staging_dir Manifest.txt
rm -f build-src.log source_files.txt

echo "Done!"
