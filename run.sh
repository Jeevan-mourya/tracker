#!/usr/bin/env bash
set -e

CP="osp/src:src:src/test:src2:lib/*:libraries/*"

if [ -z "$1" ]; then
    echo "Usage: ./run.sh <Class or Alias> [args...]"
    echo ""
    echo "Aliases available:"
    echo "  ./run.sh JavaCVTest"
    echo "  ./run.sh CalibrationPatternTest [args...]"
    echo "  ./run.sh XuggleVideoTest [video_file]"
    echo "  ./run.sh FlushUnitTest [video_file]"
    echo "  ./run.sh PlayVideoTest [video_file]"
    echo "  ./run.sh PipelineTest [videoA] [videoB] (alias for XuggleDualStreamPipelineTest)"
    echo "  ./run.sh PipelineSyntheticTest [args...]"
    echo "  ./run.sh StereoMathTerminalTest [args...]"
    echo "  ./run.sh StereoMathValidationTest [args...]"
    echo "  ./run.sh StereoVideoTerminalTest [args...]"
    echo ""
    echo "Direct file paths (e.g. ./run.sh xuggle/JavaCVTest.java) are also supported."
    exit 1
fi

find_existing() {
    for f in "$@"; do
        if [ -f "$f" ]; then
            echo "$f"
            return 0
        fi
    done
    echo "$1"
}

extract_class() {
    local file="$1"
    if [ -f "$file" ]; then
        local pkg
        pkg=$(grep -E "^\s*package " "$file" 2>/dev/null | head -n 1 | sed -E 's/^\s*package\s+([^;]+);.*/\1/' | tr -d '\r')
        local cls
        cls=$(basename "$file" .java)
        if [ -n "$pkg" ]; then
            echo "${pkg}.${cls}"
            return 0
        fi
        echo "$cls"
        return 0
    fi
    return 1
}

RAW_TARGET="$1"
TARGET="${RAW_TARGET%.java}"
shift

case "$TARGET" in
    JavaCVTest|xuggle/JavaCVTest)
        PRIMARY_SRC=$(find_existing \
            "src/test/org/opensourcephysics/media/xuggle/JavaCVTest.java" \
            "src/test/xuggle/JavaCVTest.java" \
            "src/test/JavaCVTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.org.opensourcephysics.media.xuggle.JavaCVTest")
        SRC="$PRIMARY_SRC"
        ;;
    CalibrationPatternTest|xuggle/CalibrationPatternTest)
        PRIMARY_SRC=$(find_existing \
            "src/test/org/opensourcephysics/media/xuggle/CalibrationPatternTest.java" \
            "src/test/xuggle/CalibrationPatternTest.java" \
            "src/test/CalibrationPatternTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "org.opensourcephysics.media.xuggle.CalibrationPatternTest")
        SRC="$PRIMARY_SRC"
        ;;
    XuggleVideoTest|xuggle/XuggleVideoTest)
        PRIMARY_SRC=$(find_existing \
            "src/test/org/opensourcephysics/media/xuggle/XuggleVideoTest.java" \
            "src/test/xuggle/XuggleVideoTest.java" \
            "src/test/XuggleVideoTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "org.opensourcephysics.media.xuggle.XuggleVideoTest")
        SRC="$PRIMARY_SRC"
        ;;
    FlushUnitTest)
        PRIMARY_SRC=$(find_existing "src/test/FlushUnitTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.FlushUnitTest")
        SRC="$PRIMARY_SRC"
        ;;
    PlayVideoTest)
        PRIMARY_SRC=$(find_existing "src/test/PlayVideoTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.PlayVideoTest")
        SRC="$PRIMARY_SRC"
        ;;
    PipelineTest|XuggleDualStreamPipelineTest)
        PRIMARY_SRC=$(find_existing "src/test/XuggleDualStreamPipelineTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.XuggleDualStreamPipelineTest")
        PIPELINE_SRC="src/org/opensourcephysics/media/xuggle/XuggleDualStreamPipeline.java"
        if [ -f "$PIPELINE_SRC" ]; then
            SRC="$PIPELINE_SRC $PRIMARY_SRC"
        else
            SRC="$PRIMARY_SRC"
        fi
        ;;
    PipelineSyntheticTest)
        PRIMARY_SRC=$(find_existing "src/test/PipelineSyntheticTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.PipelineSyntheticTest")
        PIPELINE_SRC="src/org/opensourcephysics/media/xuggle/XuggleDualStreamPipeline.java"
        if [ -f "$PIPELINE_SRC" ]; then
            SRC="$PIPELINE_SRC $PRIMARY_SRC"
        else
            SRC="$PRIMARY_SRC"
        fi
        ;;
    StereoMathTerminalTest)
        PRIMARY_SRC=$(find_existing "src/test/StereoMathTerminalTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.StereoMathTerminalTest")
        SRC="$PRIMARY_SRC"
        ;;
    StereoMathValidationTest)
        PRIMARY_SRC=$(find_existing "src/test/StereoMathValidationTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.StereoMathValidationTest")
        SRC="$PRIMARY_SRC"
        ;;
    Test_XML|bsml/Test_XML)
        PRIMARY_SRC="src2/test/bsml/Test_XML.java"
        CLASS="test.bsml.Test_XML"
        SRC="$PRIMARY_SRC"
        ;;
    Test_XML2)
        PRIMARY_SRC="src2/test/Test_XML2.java"
        CLASS="test.Test_XML2"
        SRC="src2/test/osp/OSPDocument.java src2/test/Test_XML2.java"
        ;;
    StereoVideoTerminalTest)
        PRIMARY_SRC=$(find_existing "src/test/StereoVideoTerminalTest.java")
        CLASS=$(extract_class "$PRIMARY_SRC" || echo "test.StereoVideoTerminalTest")
        SRC="$PRIMARY_SRC"
        ;;
    *)
        CANDIDATE=$(find_existing \
            "$RAW_TARGET" \
            "src/test/${RAW_TARGET}" \
            "src/test/${TARGET}.java" \
            "src/test/xuggle/${TARGET}.java" \
            "src/test/org/opensourcephysics/media/xuggle/${TARGET}.java")
        if [ -f "$CANDIDATE" ]; then
            SRC="$CANDIDATE"
            CLASS=$(extract_class "$CANDIDATE" || echo "$TARGET")
        else
            CLASS="$TARGET"
            SRC=""
        fi
        ;;
esac

if [ -n "$SRC" ]; then
    javac --add-exports java.desktop/sun.font=ALL-UNNAMED --add-exports java.desktop/sun.swing=ALL-UNNAMED -cp "$CP" $SRC
fi

java --add-exports java.desktop/sun.font=ALL-UNNAMED --add-exports java.desktop/sun.swing=ALL-UNNAMED -cp "$CP" "$CLASS" "$@"
