#!/usr/bin/env bash
set -euo pipefail

# Downloads JavaCV core jars into the project's libraries/ directory.
# Adjust versions below if you want a different JavaCV/OpenCV release.

LIB_DIR="libraries"
mkdir -p "$LIB_DIR"

# Versions (edit if necessary)
JAVACV_VER="1.5.8"
JAVACPP_VER="1.5.8"
OPENCV_PLATFORM_VER="4.5.1-1.5.8"

BASE="https://repo1.maven.org/maven2/org/bytedeco"

echo "Downloading JavaCV artifacts to $LIB_DIR"

download() {
  url="$1"
  out="$2"
  if [ -f "$out" ]; then
    echo "Already have $out"
    return 0
  fi
  echo "Fetching $url -> $out"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 2 -o "$out" "$url"
  else
    wget -q -O "$out" "$url"
  fi
}

download "$BASE/javacv/$JAVACV_VER/javacv-$JAVACV_VER.jar" "$LIB_DIR/javacv-$JAVACV_VER.jar"
download "$BASE/javacpp/$JAVACPP_VER/javacpp-$JAVACPP_VER.jar" "$LIB_DIR/javacpp-$JAVACPP_VER.jar"
download "$BASE/opencv-platform/$OPENCV_PLATFORM_VER/opencv-platform-$OPENCV_PLATFORM_VER.jar" "$LIB_DIR/opencv-platform-$OPENCV_PLATFORM_VER.jar"

echo "Download complete. Libraries placed in $LIB_DIR"
echo "You can add these jars to the Tracker classpath, e.g. javac -cp \"unused/osp.jar:$LIB_DIR/*\" ..."
