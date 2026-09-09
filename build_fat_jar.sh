#!/bin/bash
echo "1. Creating staging directory..."
mkdir -p staging_dir

echo "2. Extracting dependency JARs (this may take 2-3 minutes)..."
find . -type f -name '*.jar' ! -name 'Tracker3D.jar' -exec unzip -qo {} -d staging_dir/ \;

echo "3. Cleaning up security signatures..."
rm -f staging_dir/META-INF/*.SF staging_dir/META-INF/*.DSA staging_dir/META-INF/*.RSA

echo "4. Copying compiled Tracker classes..."
cp -r src/* staging_dir/
find staging_dir/ -name "*.java" -type f -delete

echo "5. Writing Manifest..."
echo "Main-Class: org.opensourcephysics.cabrillo.tracker.Tracker" > Manifest.txt

echo "6. Packaging Tracker3D.jar (this will take a while, please wait)..."
jar cfm Tracker3D.jar Manifest.txt -C staging_dir/ .

echo "7. Cleaning up temporary files..."
rm -rf staging_dir/ Manifest.txt

echo "DONE! Tracker3D.jar is ready."
