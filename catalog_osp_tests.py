import os, glob, re

osp_test_dir = "osp/src/test"
files = sorted(glob.glob(os.path.join(osp_test_dir, "*.java")))

print(f"Found {len(files)} test files in {osp_test_dir}:\n")
print(f"{'File Name':<25} | {'Type':<14} | {'Has main()':<10} | {'GUI Components'}")
print("-" * 75)

for fpath in files:
    fname = os.path.basename(fpath)
    with open(fpath, "r", errors="ignore") as f:
        content = f.read()

    has_main = bool(re.search(r"public\s+static\s+void\s+main", content))
    uses_swing = bool(re.search(r"(JFrame|JDialog|javax\.swing|java\.awt\.Frame|java\.awt\.Window)", content))

    if fname == "Test_.java":
        ttype = "Base Class"
    elif not has_main:
        ttype = "Helper"
    elif uses_swing:
        ttype = "Swing GUI"
    else:
        ttype = "Headless CLI"

    gui_marker = "AWT/Swing" if uses_swing else "None"
    print(f"{fname:<25} | {ttype:<14} | {str(has_main):<10} | {gui_marker}")
