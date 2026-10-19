# Windows Desktop Executable (.exe) Packaging & GitHub Actions Resolution

A comprehensive solution to resolve the Chromium ICU data crash (`base\i18n\icu_util.cc:237`), configure robust Windows packaging for both an NSIS Setup Installer and a standalone Portable executable, and set up a reliable manual GitHub Actions workflow dispatch.

## User Review & Critical Decisions

> [!IMPORTANT]
> The source code under `src/` will remain completely untouched. All modifications are strictly restricted to packaging metadata (`package.json`), build orchestration (`build.js`), and CI/CD workflow configuration (`.github/workflows/build.yml`).

- **Packaging Targets (Confirmed)**: Deliver both **NSIS Setup Installer (`.exe`)** and **Self-contained Portable (`.exe`)**.
- **Execution Workflow (Confirmed)**: Controlled via **Manual `workflow_dispatch` trigger** in GitHub Actions (allowing intentional builds on demand without running actions on every intermediate commit).

---

## 1. Overview & Core Concept

### What It Does
This implementation resolves the missing ICU descriptor crash that occurs when launching an isolated Electron binary without its Chromium runtime assets. It configures `electron-builder` to package the Tracker Video Analysis web application into two enterprise-standard Windows executable formats:
1. **NSIS Setup Installer**: Installs the complete workstation with Start Menu and Desktop shortcuts, clean uninstallation, and bundled Chromium dependencies.
2. **Portable Single-File Executable**: A standalone `.exe` that unpacks all required runtime dependencies (including `icudtl.dat`, `resources.pak`, and V8 snapshots) into a temporary environment at runtime and launches immediately with zero installation.

### Root Cause of the Reported Error
When GitHub Actions compiled the application with `win: target: ["dir", "zip"]`, it output an unpacked directory at `dist-electron/win-unpacked/`. The previous workflow uploaded `dist-electron/**/*.exe`, which picked only `win-unpacked/Tracker Video Analysis.exe` in isolation. Chromium requires `icudtl.dat` and companion DLLs in the same directory; running the raw `.exe` without them triggers `Invalid file descriptor to ICU data received`.

---

## 2. User Experience & Workflow

### User Flow: Building and Running the Desktop App

```
┌─────────────────────────────────┐
│ AI Studio / Git Repository      │
│ (Push code to remote main)      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ GitHub Actions (Web UI)         │
│ Navigate to "Actions" tab       │
│ Select "Build Windows EXE"      │
│ Click "Run workflow"            │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Automated Runner (windows-latest)│
│ 1. Checkout & npm install       │
│ 2. Compile Vite web app (dist/) │
│ 3. Build NSIS & Portable .exe   │
│ 4. Package Artifacts            │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Download & Launch               │
│ - Tracker-Windows-Setup.exe OR  │
│ - Tracker-Windows-Portable.exe  │
│ Double-click -> Instant Launch! │
└─────────────────────────────────┘
```

1. **Pushing from AI Studio / Git**: Changes pushed to GitHub contain the validated configuration.
2. **Manual Dispatch**: Go to the GitHub repository > **Actions** > **Build Windows EXE** > click **Run workflow**.
3. **Artifact Download**: Under the completed run, download the artifact package containing both `Tracker Video Analysis Setup 1.0.0.exe` and `Tracker Video Analysis 1.0.0.exe`.
4. **Execution**: Both executables run directly on Windows 10/11 without ICU errors.

---

## 3. Key Technical Decisions & Trade-Offs

- **NSIS + Portable Dual Target**:
  - *Chosen Approach*: Configure `win.target: ["nsis", "portable"]` in `package.json`.
  - *Why*: NSIS provides traditional installation with desktop shortcuts and registry association, while Portable gives users an immediate zero-install single-file executable.
  - *Alternatives Considered*: Packaging only `dir` or `zip` required users to manually extract the entire directory and locate the inner `.exe`, which caused the ICU failure when users extracted only the executable.
- **Selective Artifact Matching in GitHub Actions**:
  - *Chosen Approach*: Target `dist-electron/*.exe` rather than recursive `dist-electron/**/*.exe`.
  - *Why*: `dist-electron/*.exe` captures only the finished setup and portable distribution executables and ignores the inner raw binaries inside `win-unpacked/`.
- **Manual `workflow_dispatch` vs. Automatic `push`**:
  - *Chosen Approach*: Set GitHub Actions to trigger via `workflow_dispatch` (manual) while maintaining optional `push` on main tags/releases if needed.
  - *Why*: Prevents GitHub Action runners from consuming quota unnecessarily on minor commits or documentation edits.

---

## 4. Technical Architecture & Configuration Specifications

### Packaging Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Application Build                    │
│                                                        │
│  src/ (React 18 + Vite) ───► npm run build ──► dist/   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Electron Builder Packaging               │
│                                                        │
│  ├── electron.js (Main Process)                        │
│  ├── dist/ (Compiled Frontend Assets)                  │
│  └── public/icon.ico                                   │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│   NSIS Setup Installer    │ │   Portable Executable    │
│  • Full Windows Installer │ │  • Standalone .exe       │
│  • Desktop / Start Menu   │ │  • Zero installation    │
│  • Embedded ICU & Pak     │ │  • Self-extracting ICU   │
└───────────────────────────┘ └──────────────────────────┘
```

### Proposed Changes:

1. **`package.json`**:
   - Update `build.win.target` to:
     ```json
     "win": {
       "target": ["nsis", "portable"],
       "icon": "public/icon.ico"
     }
     ```
   - Ensure `build.nsis` and `build.portable` definitions specify user-friendly product titles and clean binary naming.

2. **`.github/workflows/build.yml`**:
   - Configure `workflow_dispatch` as the primary operational trigger.
   - Update artifact collection path to `dist-electron/*.exe` and provide informative artifact bundle names.

3. **`build.js`**:
   - Ensure local packaging instructions and fallback commands reflect the dual NSIS + Portable target.

4. **Zero Impact on Source Code**:
   - Verification that no file in `src/` is touched or modified.
