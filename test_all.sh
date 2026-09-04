#!/usr/bin/env bash

# Test list: core XML -> bindings -> math -> synthetic -> video streams
TESTS=(
    "Test_XML"
    "Test_XML2"
    "JavaCVTest"
    "CalibrationPatternTest"
    "XuggleVideoTest"
    "StereoMathTerminalTest"
    "StereoMathValidationTest"
    "PipelineSyntheticTest"
    "StereoVideoTerminalTest"
    "FlushUnitTest"
    "PipelineTest"
    "PlayVideoTest"
)

PASSED=()
FAILED=()

echo "========================================"
echo " Running All Tracker Test Suites"
echo "========================================"

for test_name in "${TESTS[@]}"; do
    echo ""
    echo "----------------------------------------"
    echo ">>> Running: $test_name"
    echo "----------------------------------------"

    if ./run.sh "$test_name"; then
        echo "[PASS] $test_name passed."
        PASSED+=("$test_name")
    else
        EXIT_CODE=$?
        echo "[FAIL] $test_name failed with exit code $EXIT_CODE."
        FAILED+=("$test_name (exit code: $EXIT_CODE)")
    fi
done

echo ""
echo "========================================"
echo "             SUMMARY"
echo "========================================"
echo "Total: ${#TESTS[@]} | Passed: ${#PASSED[@]} | Failed: ${#FAILED[@]}"
echo ""

if [ ${#PASSED[@]} -gt 0 ]; then
    echo "Passed:"
    for t in "${PASSED[@]}"; do
        echo "  [✓] $t"
    done
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    echo "Failed:"
    for t in "${FAILED[@]}"; do
        echo "  [✗] $t"
    done
    exit 1
fi

echo ""
echo "All 12 test suites passed successfully!"
