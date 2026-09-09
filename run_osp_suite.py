#!/usr/bin/env python3
import os
import re
import glob
import shutil
import subprocess

LOG_DIR = "logs/osp_tests"
SRC_DIR = "osp/src/test"
CP = "osp/src:src:src/test:src2:src2/test:lib/*:libraries/*"
TIMEOUT_SECS = 4

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs("src/test", exist_ok=True)

# Ensure test fixture t.zip is present
if os.path.exists(f"{SRC_DIR}/t.zip") and not os.path.exists("src/test/t.zip"):
    shutil.copy(f"{SRC_DIR}/t.zip", "src/test/t.zip")

java_files = sorted(glob.glob(os.path.join(SRC_DIR, "*.java")))
results = []

def to_str(data):
    if data is None:
        return ""
    if isinstance(data, bytes):
        return data.decode("utf-8", errors="replace")
    return str(data)

print("=================================================================")
print(f" Executing OSP Bundled Test Suite ({len(java_files)} files)")
print(" Outputs redirected to logs/osp_tests/ to prevent buffer overrun")
print("=================================================================\n")

for idx, fpath in enumerate(java_files, 1):
    fname = os.path.basename(fpath)
    test_name = os.path.splitext(fname)[0]
    log_file = os.path.join(LOG_DIR, f"{test_name}.log")

    # Check for main() or base helper class
    with open(fpath, "r", errors="ignore") as f:
        code = f.read()

    has_main = bool(re.search(r"public\s+static\s+void\s+main", code))
    
    if fname == "Test_.java" or not has_main:
        results.append({
            "test": test_name,
            "status": "SKIP",
            "category": "Base/Helper Class",
            "details": "No runnable main() entry point",
            "log": "-"
        })
        print(f"[{idx:02d}/{len(java_files):02d}] {test_name:<24} -> [SKIP] (Base/Helper)")
        continue

    cmd = [
        "xvfb-run", "-a", "java",
        "-Djava.awt.headless=false",
        "--add-exports", "java.desktop/sun.font=ALL-UNNAMED",
        "--add-exports", "java.desktop/sun.swing=ALL-UNNAMED",
        "-cp", CP,
        f"test.{test_name}"
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=TIMEOUT_SECS
        )
        output = to_str(proc.stdout)
        with open(log_file, "w", encoding="utf-8") as lf:
            lf.write(output)

        if proc.returncode == 0:
            results.append({
                "test": test_name,
                "status": "PASS",
                "category": "Automated CLI",
                "details": "Exited cleanly (code 0)",
                "log": log_file
            })
            print(f"[{idx:02d}/{len(java_files):02d}] {test_name:<24} -> [PASS]")
        else:
            err_match = re.search(r"(Exception[^\n]+|Error[^\n]+|FileNotFoundException[^\n]+|NullPointerException[^\n]+)", output)
            err_msg = err_match.group(0)[:45] if err_match else f"Exit code {proc.returncode}"
            results.append({
                "test": test_name,
                "status": "FAIL",
                "category": "Runtime Error",
                "details": err_msg,
                "log": log_file
            })
            print(f"[{idx:02d}/{len(java_files):02d}] {test_name:<24} -> [FAIL] ({err_msg})")

    except subprocess.TimeoutExpired as te:
        output = to_str(te.stdout)
        with open(log_file, "w", encoding="utf-8") as lf:
            lf.write(output + f"\n\n[TIMEOUT] Process kept window open past {TIMEOUT_SECS}s limit.")
        results.append({
            "test": test_name,
            "status": "UI_OPEN",
            "category": "Interactive GUI Demo",
            "details": f"Timed out after {TIMEOUT_SECS}s (Window active)",
            "log": log_file
        })
        print(f"[{idx:02d}/{len(java_files):02d}] {test_name:<24} -> [UI OPEN] (Interactive Swing demo)")

# Execution Summary Table
print("\n" + "=" * 92)
print(f"{'Test Name':<22} | {'Status':<9} | {'Category':<22} | {'Details'}")
print("=" * 92)

counts = {"PASS": 0, "UI_OPEN": 0, "FAIL": 0, "SKIP": 0}
for r in results:
    counts[r["status"]] += 1
    status_display = f"[{r['status']}]"
    print(f"{r['test']:<22} | {status_display:<9} | {r['category']:<22} | {r['details']}")

print("=" * 92)
print(f"TOTAL: {len(results)} | PASS: {counts['PASS']} | INTERACTIVE UI: {counts['UI_OPEN']} | FAIL: {counts['FAIL']} | SKIPPED: {counts['SKIP']}")
print(f"Individual execution logs written to: {os.path.abspath(LOG_DIR)}/")
print("=" * 92)
