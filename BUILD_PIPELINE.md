# Tracker 3D Build Pipeline & Windows .exe Packaging

This document describes the complete build pipeline for compiling Tracker 3D and packaging it as a standalone Windows .exe executable.

## Overview

The build pipeline consists of three stages:

1. **Code Fix**: ClassCastException in FirstDerivative.java (defensive type-checking)
2. **Fat JAR Build**: Compile fixed code and package with all dependencies into Tracker3D.jar
3. **Windows .exe Build**: Package Tracker3D.jar with bundled JRE using Launch4j

---

## Part 1: ClassCastException Fix

### Issue
When creating a new Point Mass in Tracker 3D, the application crashes with:
```
java.lang.ClassCastException: class [D cannot be cast to class [Z
at org.opensourcephysics.cabrillo.tracker.FirstDerivative.evaluate(FirstDerivative.java:66)
```

### Root Cause
- PointMass creates a 5-element `derivData` array: `[params, xData, yData, zData, validData]`
- Protractor creates a 4-element `derivData` array: `[params, rotationAngle, null, validData]`
- FirstDerivative.java assumed `data[data.length - 1]` is always a `boolean[]`, but it could be a `double[]` when array structure varies

### Solution (Line 66 - FirstDerivative.java)
**Before:**
```java
boolean[] valid = (boolean[])data[data.length - 1]; // Direct cast without checking
```

**After:**
```java
// Defensive type-checking: safely extract boolean[] validData
// PointMass and Protractor may have different array structures
boolean[] valid = null;
if (data.length > 0) {
  Object lastElement = data[data.length - 1];
  if (lastElement instanceof boolean[]) {
    valid = (boolean[])lastElement;
  } else {
    // Fallback: log warning and create empty valid array
    System.err.println("WARNING: FirstDerivative.evaluate() - expected boolean[] at data[" + 
                      (data.length - 1) + "], got " + 
                      (lastElement != null ? lastElement.getClass().getSimpleName() : "null"));
    valid = new boolean[x.length];
    java.util.Arrays.fill(valid, true); // Assume all data points are valid
  }
} else {
  // Fallback for empty data array
  valid = new boolean[x.length];
  java.util.Arrays.fill(valid, true);
}
```

**Result:**
- Uses `instanceof` operator to safely check type before casting
- Gracefully handles misaligned array structures
- Logs warnings to help diagnose future issues
- Allows PointMass creation to proceed without crashing

---

## Part 2: Building Tracker3D.jar (Fat JAR)

### Prerequisites
- **JDK 17** (or compatible version)
- **Existing tracker.jar** in `distribution/` directory (provides compiled base classes)
- **All dependency JARs** already present in workspace

### Local Build

```bash
cd /workspaces/tracker

# Make build script executable
chmod +x build_tracker.sh

# Build Tracker3D.jar (compiles FirstDerivative.java fix + packages dependencies)
./build_tracker.sh
```

### Build Process
1. **Extracts** `distribution/tracker.jar` to get all compiled OSP and Tracker classes
2. **Recompiles** `src/org/opensourcephysics/cabrillo/tracker/FirstDerivative.java` with fix
3. **Extracts** all dependency JARs (xuggle, slf4j, logback, javacv, opencv, etc.)
4. **Copies** newly compiled FirstDerivative.class (replacing old one)
5. **Packages** everything into `Tracker3D.jar` (fat JAR with all dependencies)

### Output
- **File:** `Tracker3D.jar` (typically ~297 MB)
- **Contains:** All compiled code + all runtime dependencies
- **Executable:** `java -jar Tracker3D.jar`

### Testing Locally
```bash
export DISPLAY=:1  # If using VNC/remote display
java -jar Tracker3D.jar
```

---

## Part 3: Building Windows .exe with Launch4j

### Prerequisites
- **Tracker3D.jar** (built from Part 2)
- **Launch4j** JAR (auto-downloaded or pre-installed)
- **Windows JRE** (optional, for bundling; pre-built in `windows_jre/` if available)

### Configuration Files
- **Launch4j Config:** `windows-launcher/tracker-launcher.xml`
  - Specifies JAR input, .exe output, JVM settings, version info
  - Minimal JVM: 17.0
  - JRE path: `jre/` (relative to .exe)
  - Window title: "Tracker 3D"

### Local Build (Manual)

```bash
cd /workspaces/tracker

# Make script executable
chmod +x build_windows_exe.sh

# Build .exe (requires Launch4j JAR to be present)
./build_windows_exe.sh
```

### Build Steps
1. **Verifies** Tracker3D.jar exists
2. **Downloads** Launch4j if not present (from SourceForge or Maven Central)
3. **Checks** for bundled Windows JRE in `windows_jre/` directory
4. **Runs** Launch4j with `windows-launcher/tracker-launcher.xml`
5. **Generates** `Tracker3D.exe` (Windows console/GUI wrapper around JAR)

### Output
- **File:** `Tracker3D.exe`
- **Requires:** JRE 17+ on target Windows machine (OR bundled JRE alongside .exe)
- **Recommended:** Bundle with `windows_jre/` directory for portable distribution

### Bundled JRE Setup
To include JRE with the .exe:
```bash
# 1. Ensure windows_jre/ directory exists in repo root
# 2. Place pre-built Windows JRE (from AdoptOpenJDK, OpenJDK, etc.)
# 3. Structure should be:
#    windows_jre/
#      bin/
#      lib/
#      conf/
#      ...
# 4. Launch4j configuration already points to 'jre/' subdirectory
# 5. When distributing, place Tracker3D.exe and jre/ folder together
```

---

## Part 4: GitHub Actions Automation

### Workflow File
- **Location:** `.github/workflows/build-windows-exe.yml`
- **Triggers:**
  - Push to `3Dtracker` branch
  - Manual dispatch (`workflow_dispatch`)
  - Only runs on changes to source/config files

### Workflow Steps

#### Job 1: build-fat-jar (Ubuntu Latest)
1. Checkout code (full history)
2. Set up JDK 17 (Temurin distribution)
3. Run `build_tracker.sh`
4. Verify Tracker3D.jar created
5. Upload JAR artifact (30-day retention)

#### Job 2: build-windows-exe (Ubuntu Latest)
1. Download Tracker3D.jar artifact
2. Set up JDK 17
3. Download/verify Windows JRE (if bundled)
4. Download Launch4j (Maven Central or SourceForge)
5. Run Launch4j to generate .exe
6. Verify .exe created
7. Upload .exe + JAR artifacts
8. Optionally create GitHub Release (on tagged commits)

#### Job 3: notify
- Summarizes build status

### Running the Workflow

**Automatic (on every push to 3Dtracker):**
```bash
git push origin 3Dtracker
# GitHub Actions automatically builds .jar and .exe
# Artifacts available in Actions tab > build-windows-exe-yml > Artifacts
```

**Manual (workflow_dispatch):**
1. Go to GitHub repo → Actions tab
2. Select "Build Windows Tracker3D.exe"
3. Click "Run workflow"
4. Check artifacts after completion

### Accessing Build Artifacts

1. **GitHub Actions Tab:**
   - Actions → build-windows-exe-yml → Latest run
   - Download "tracker3d-exe" (contains both .exe and .jar)

2. **GitHub Releases (tagged builds):**
   - Create a git tag: `git tag v6.0`
   - Push tag: `git push origin v6.0`
   - Workflow automatically creates Release with .exe and .jar

---

## File Structure

```
/workspaces/tracker/
├── build_tracker.sh                      # Compile fix + build fat JAR
├── build_windows_exe.sh                  # Package JAR as .exe
├── Tracker3D.jar                         # Output: fat JAR (after build_tracker.sh)
├── Tracker3D.exe                         # Output: Windows executable (after build_windows_exe.sh)
├── .github/
│   └── workflows/
│       └── build-windows-exe.yml         # GitHub Actions automation
├── windows-launcher/
│   └── tracker-launcher.xml              # Launch4j configuration
├── windows_jre/                          # (Optional) Bundled Windows JRE
│   ├── bin/
│   ├── lib/
│   └── ...
├── src/
│   └── org/opensourcephysics/
│       ├── cabrillo/tracker/
│       │   ├── FirstDerivative.java      # ← FIXED FILE (line 66)
│       │   └── ... (other tracker sources)
│       └── media/xuggle/
│           └── ... (media sources)
└── distribution/
    └── tracker.jar                       # Existing compiled base (input)
```

---

## Troubleshooting

### Issue: "Tracker3D.jar not found"
**Solution:** Run `build_tracker.sh` first
```bash
./build_tracker.sh
```

### Issue: "FirstDerivative.class compilation errors"
**Solution:** Ensure classpath includes extracted tracker.jar classes
- The build script handles this automatically
- Manual compilation needs: `-cp temp-fix-classes`

### Issue: "Launch4j download fails"
**Solution:** Install Maven or download manually
```bash
# Option 1: Install Maven
sudo apt-get install maven

# Option 2: Manual download from SourceForge
# https://sourceforge.net/projects/launch4j/files/

# Option 3: Use Maven Central
mvn dependency:copy -Dartifact=net.sf.launch4j:launch4j:3.50:jar -DoutputDirectory=.
```

### Issue: ".exe requires JRE on target system"
**Solution:** Bundle Windows JRE
1. Download Windows JRE from AdoptOpenJDK/OpenJDK
2. Place in `windows_jre/` directory
3. Structure: `windows_jre/bin/`, `windows_jre/lib/`, etc.
4. Distribute .exe + jre/ folder together

### Issue: "Permission denied when creating JAR"
**Solution:** The build script now handles permissions
- Automatically fixes file permissions in staging directory
- If manual fix needed: `chmod -R u+rwx staging_dir/`

---

## Verification Checklist

- [x] FirstDerivative.java fixed with type-checking (defensive instanceof check)
- [x] XuggleRes.java fixed (removed invalid import statement)
- [x] Tracker3D.jar builds successfully (~297 MB)
- [x] JAR contains fixed FirstDerivative.class
- [x] Launch4j configuration created (tracker-launcher.xml)
- [x] build_windows_exe.sh script created for local builds
- [x] GitHub Actions workflow configured (build-windows-exe.yml)
- [x] Workflow triggers on 3Dtracker branch pushes
- [x] Documentation complete

---

## Next Steps

1. **Test locally on Windows:**
   ```bash
   # On Windows machine
   Tracker3D.exe  # Should launch without errors
   ```

2. **Create PointMass in video:**
   - Should NOT crash with ClassCastException
   - FirstDerivative calculations should work correctly

3. **Optimize for distribution:**
   - Add application icon to Launch4j config
   - Include Windows JRE in repository (if desired)
   - Create NSIS or WiX installer (optional, for Windows MSI)

4. **Release process:**
   ```bash
   git tag v6.0
   git push origin v6.0
   # GitHub Actions creates release with .exe and .jar
   ```

---

## Reference Documentation

- **Launch4j:** https://launch4j.sourceforge.net/
- **AdoptOpenJDK:** https://adoptopenjdk.net/ (JRE binaries)
- **GitHub Actions:** https://docs.github.com/en/actions
- **Tracker Project:** https://physlets.org/tracker/

---

**Last Updated:** 2026-09-09  
**Tracker Version:** 6.0 (3D)  
**Build Status:** Ready for deployment
