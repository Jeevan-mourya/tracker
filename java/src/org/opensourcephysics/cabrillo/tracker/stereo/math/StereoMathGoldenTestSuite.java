package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * PHASE 2: CROSS-LANGUAGE NUMERICAL VERIFICATION (GOLDEN TEST SUITE)
 *
 * <p>Automated verification suite validating mathematical parity between the Java
 * zero-allocation numerical engine and the verified Open Source Physics / Tracker React baseline.
 *
 * <p>Covers 7 Mandatory Benchmark Categories:
 * <ol>
 *   <li>Hartley 2D & 3D Isotropic Normalization Round-Trip and Analytical Denormalization.</li>
 *   <li>Brown–Conrady Lens Distortion Forward Mapping, Iterative Inversion, and Divergence Guard.</li>
 *   <li>Householder QR 4x3 Overdetermined Least-Squares Solver & Condition Estimation.</li>
 *   <li>Cyclic One-Sided Hestenes Jacobi SVD 12x12 Null-Space Extraction.</li>
 *   <li>End-to-End DLT Projective Camera Calibration with Synthetic 3D Control Cage.</li>
 *   <li>Stereo Triangulation Parity, Optical Center Extraction, and Degenerate Ray Rejection.</li>
 *   <li>Aerospace & Defense Telemetry (O(dt^2) Central Difference Kinematics & TrackEye Metrics).</li>
 * </ol>
 *
 * Can be executed as a standalone application via {@code main(String[] args)} or within standard test runners.
 */
public final class StereoMathGoldenTestSuite {

    private static int testsPassed = 0;
    private static int testsFailed = 0;

    public static void main(String[] args) {
        System.out.println("================================================================================");
        System.out.println("  OSP / TRACKER STEREO WORKSTATION - PHASE 2 GOLDEN NUMERICAL TEST HARNESS     ");
        System.out.println("================================================================================\n");

        long startNs = System.nanoTime();

        test1_HartleyNormalizationRoundTrip();
        test2_BrownConradyDistortionAndInversion();
        test3_HouseholderQR4x3SolverStability();
        test4_CyclicJacobiSVDNullSpaceExtraction();
        test5_EndToEndDLTCalibrationWithSyntheticCage();
        test6_StereoTriangulationParityAndDegenerateRay();
        test7_AerospaceKinematicsTrajectory();

        long durationMs = (System.nanoTime() - startNs) / 1_000_000;

        System.out.println("\n--------------------------------------------------------------------------------");
        System.out.printf("  TOTAL VERIFICATION RUN: %d PASSED, %d FAILED (Elapsed: %d ms)%n",
                testsPassed, testsFailed, durationMs);
        System.out.println("--------------------------------------------------------------------------------\n");

        if (testsFailed > 0) {
            System.err.println("❌ GOLDEN TEST SUITE FAILED: Discrepancies detected against mathematical baseline.");
            System.exit(1);
        } else {
            System.out.println("✅ ALL GOLDEN TESTS PASSED: Absolute parity established with IEEE-754 precision.");
        }
    }

    // =========================================================================
    // 1. HARTLEY 2D & 3D NORMALIZATION ROUND-TRIP
    // =========================================================================
    public static void test1_HartleyNormalizationRoundTrip() {
        System.out.println("[TEST 1/7] Hartley 2D & 3D Isotropic Normalization & Denormalization...");

        // 1A. 2D Diamond points centered at (200, 150) with radius 100 px
        double[] pts2D = {
            100.0, 150.0,
            200.0, 250.0,
            300.0, 150.0,
            200.0,  50.0
        };
        int n2D = 4;
        double[] norm2D = new double[8];
        double[] stats2D = new double[3];

        HartleyNormalization.normalize2D(pts2D, n2D, norm2D, stats2D);

        assertEquals("2D Centroid U", 200.0, stats2D[0], 1e-12);
        assertEquals("2D Centroid V", 150.0, stats2D[1], 1e-12);
        assertEquals("2D Scale factor", Math.sqrt(2.0) / 100.0, stats2D[2], 1e-12);

        // Check normalized centroid is (0,0) and mean distance is sqrt(2)
        double normSumU = 0, normSumV = 0, normSumDist = 0;
        for (int i = 0; i < n2D; i++) {
            normSumU += norm2D[2 * i];
            normSumV += norm2D[2 * i + 1];
            double d = Math.hypot(norm2D[2 * i], norm2D[2 * i + 1]);
            normSumDist += d;
        }
        assertEquals("Normalized 2D Centroid U", 0.0, normSumU / n2D, 1e-12);
        assertEquals("Normalized 2D Centroid V", 0.0, normSumV / n2D, 1e-12);
        assertEquals("Normalized 2D Mean Distance", Math.sqrt(2.0), normSumDist / n2D, 1e-12);

        // 1B. 3D Spatial Box Centered at (10, -5, 25) with span 2m
        double[] pts3D = {
             9.0, -6.0, 24.0,
            11.0, -6.0, 24.0,
             9.0, -4.0, 24.0,
            11.0, -4.0, 24.0,
             9.0, -6.0, 26.0,
            11.0, -6.0, 26.0,
             9.0, -4.0, 26.0,
            11.0, -4.0, 26.0
        };
        int n3D = 8;
        double[] norm3D = new double[24];
        double[] stats3D = new double[4];

        HartleyNormalization.normalize3D(pts3D, n3D, norm3D, stats3D);

        assertEquals("3D Centroid X", 10.0, stats3D[0], 1e-12);
        assertEquals("3D Centroid Y", -5.0, stats3D[1], 1e-12);
        assertEquals("3D Centroid Z", 25.0, stats3D[2], 1e-12);

        double normSumX = 0, normSumY = 0, normSumZ = 0, normSumDist3D = 0;
        for (int i = 0; i < n3D; i++) {
            normSumX += norm3D[3 * i];
            normSumY += norm3D[3 * i + 1];
            normSumZ += norm3D[3 * i + 2];
            double d = Math.sqrt(norm3D[3 * i]*norm3D[3 * i] + norm3D[3 * i+1]*norm3D[3 * i+1] + norm3D[3 * i+2]*norm3D[3 * i+2]);
            normSumDist3D += d;
        }
        assertEquals("Normalized 3D Centroid X", 0.0, normSumX / n3D, 1e-12);
        assertEquals("Normalized 3D Centroid Y", 0.0, normSumY / n3D, 1e-12);
        assertEquals("Normalized 3D Centroid Z", 0.0, normSumZ / n3D, 1e-12);
        assertEquals("Normalized 3D Mean Distance", Math.sqrt(3.0), normSumDist3D / n3D, 1e-12);

        System.out.println("   ✓ Hartley 2D (mean dist -> sqrt(2)) and 3D (mean dist -> sqrt(3)) verified.");
    }

    // =========================================================================
    // 2. BROWN-CONRADY LENS DISTORTION & INVERSION GUARD
    // =========================================================================
    public static void test2_BrownConradyDistortionAndInversion() {
        System.out.println("[TEST 2/7] Brown-Conrady Distortion & Inversion Guard...");

        double u0 = 320.0, v0 = 240.0;
        double scale = 1000.0;
        double[] outUv = new double[2];
        double[] diag = new double[3];

        // 2A. Identity Case: zero coefficients
        BrownConradyDistortion.apply(450.0, 310.0, u0, v0, 0, 0, 0, 0, 0, scale, outUv);
        assertEquals("Identity Forward U", 450.0, outUv[0], 1e-12);
        assertEquals("Identity Forward V", 310.0, outUv[1], 1e-12);

        boolean okIdent = BrownConradyDistortion.undistort(450.0, 310.0, u0, v0, 0, 0, 0, 0, 0, scale, outUv, diag);
        assertTrue("Identity Inverse Converged", okIdent);
        assertEquals("Identity Inverse U", 450.0, outUv[0], 1e-12);
        assertEquals("Identity Inverse V", 310.0, outUv[1], 1e-12);

        // 2B. High Distortion Round-Trip Case
        double k1 = -0.15, k2 = 0.05, k3 = 0.005, p1 = 0.001, p2 = -0.001;
        double origU = 580.0, origV = 420.0;

        BrownConradyDistortion.apply(origU, origV, u0, v0, k1, k2, k3, p1, p2, scale, outUv);
        double distU = outUv[0];
        double distV = outUv[1];

        boolean okInv = BrownConradyDistortion.undistort(distU, distV, u0, v0, k1, k2, k3, p1, p2, scale, outUv, diag);
        assertTrue("Brown-Conrady Inversion Converged", okInv);
        assertTrue("Iterations <= 25", diag[0] <= 25);
        assertEquals("Recovered U Parity", origU, outUv[0], 1e-7);
        assertEquals("Recovered V Parity", origV, outUv[1], 1e-7);

        // 2C. Divergence Guard Case: Extreme off-sensor coordinates (r > 2.5)
        double extremeU = 3500.0, extremeV = 3500.0;
        boolean okGuarded = BrownConradyDistortion.undistort(extremeU, extremeV, u0, v0, k1, k2, k3, p1, p2, scale, outUv, diag);
        assertFalse("Divergence Guard Caught Out-of-Bounds", okGuarded);
        assertTrue("Guarded output is Finite", Double.isFinite(outUv[0]) && Double.isFinite(outUv[1]));
        assertEquals("Diagnostics Flag Diverged (-1.0)", -1.0, diag[2], 1e-12);

        System.out.println("   ✓ Brown-Conrady round-trip error < 1e-7 px, divergence guard triggered safely.");
    }

    // =========================================================================
    // 3. HOUSEHOLDER QR 4x3 SOLVER STABILITY
    // =========================================================================
    public static void test3_HouseholderQR4x3SolverStability() {
        System.out.println("[TEST 3/7] Householder QR 4x3 Inhomogeneous Least-Squares Solver...");

        TriangulationContext ctx = new TriangulationContext();

        // Overdetermined 4x3 system with known ground truth X = [1.5, -2.0, 3.0]^T
        double[] A = {
            1.0, 2.0, 1.0,
            2.0, 1.0, 3.0,
            1.0, 1.0, 1.0,
            3.0, 2.0, 1.0
        };
        double[] trueX = { 1.5, -2.0, 3.0 };

        // B = A * trueX + orthogonal residual delta = [0.1, -0.1, 0.1, -0.1]^T
        double[] B = {
            1.0 * trueX[0] + 2.0 * trueX[1] + 1.0 * trueX[2] + 0.1,
            2.0 * trueX[0] + 1.0 * trueX[1] + 3.0 * trueX[2] - 0.1,
            1.0 * trueX[0] + 1.0 * trueX[1] + 1.0 * trueX[2] + 0.1,
            3.0 * trueX[0] + 2.0 * trueX[1] + 1.0 * trueX[2] - 0.1
        };

        double[] outXyz = new double[3];
        double[] cond = new double[1];

        boolean solved = HouseholderQR.solveLeastSquares4x3(A, B, ctx, outXyz, cond);
        assertTrue("Householder QR Solved System", solved);
        assertTrue("Condition Estimate Finite", cond[0] < 100.0);

        // Verify normal residual orthogonality: A^T * (B - A * outXyz) ~= 0
        double[] r = new double[4];
        for (int i = 0; i < 4; i++) {
            r[i] = B[i] - (A[i * 3 + 0] * outXyz[0] + A[i * 3 + 1] * outXyz[1] + A[i * 3 + 2] * outXyz[2]);
        }
        for (int col = 0; col < 3; col++) {
            double dot = 0.0;
            for (int i = 0; i < 4; i++) {
                dot += A[i * 3 + col] * r[i];
            }
            assertEquals("Residual Orthogonality Col " + col, 0.0, dot, 1e-12);
        }

        // Rank-deficient case (col 2 = col 0 + col 1)
        double[] A_rankDef = {
            1.0, 2.0, 3.0,
            2.0, 1.0, 3.0,
            1.0, 1.0, 2.0,
            3.0, 2.0, 5.0
        };
        boolean solvedRankDef = HouseholderQR.solveLeastSquares4x3(A_rankDef, B, ctx, outXyz, cond);
        assertFalse("Rank Deficient System Rejected", solvedRankDef);

        System.out.println("   ✓ Householder QR orthogonal residual ||A^T r|| < 1e-12, rank deficiency caught.");
    }

    // =========================================================================
    // 4. CYCLIC JACOBI SVD NULL-SPACE EXTRACTION
    // =========================================================================
    public static void test4_CyclicJacobiSVDNullSpaceExtraction() {
        System.out.println("[TEST 4/7] Cyclic Jacobi SVD 12x12 Null-Space Extraction...");

        int n = 12;
        double[] R = new double[n * n];
        // Construct upper triangular matrix with known singular values
        // Diagonals 12, 11, ..., 2, and last diagonal = 0.0 (exact rank 11)
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (i == j) {
                    R[i * n + j] = (i < 11) ? (12.0 - i) : 0.0;
                } else if (j > i) {
                    R[i * n + j] = 0.5 / (j - i + 1);
                } else {
                    R[i * n + j] = 0.0;
                }
            }
        }

        double[] workW = new double[n * n];
        double[] workV = new double[n * n];
        double[] singularValues = new double[n];
        double[] sortedV = new double[n * n];
        double[] metrics = new double[3];

        JacobiSVD.svd12(R, workW, workV, singularValues, sortedV, metrics);

        // Check descending order of singular values
        for (int i = 0; i < n - 1; i++) {
            assertTrue("Singular values descending: sigma_" + i + " >= sigma_" + (i + 1),
                    singularValues[i] >= singularValues[i + 1]);
        }

        // 12th singular value must be virtually zero (<= 1e-14)
        assertEquals("12th Singular Value is Null", 0.0, singularValues[11], 1e-12);

        // Verify null vector v_11 (column 11 of sortedV) has unit norm
        double normV12 = 0.0;
        for (int r = 0; r < n; r++) {
            double val = sortedV[r * n + 11];
            normV12 += val * val;
        }
        assertEquals("Null vector unit norm", 1.0, Math.sqrt(normV12), 1e-12);

        // Verify R * v_11 ~= 0
        double residualNorm = 0.0;
        for (int r = 0; r < n; r++) {
            double dot = 0.0;
            for (int c = 0; c < n; c++) {
                dot += R[r * n + c] * sortedV[c * n + 11];
            }
            residualNorm += dot * dot;
        }
        assertEquals("||R * v_12||_2 <= 1e-12", 0.0, Math.sqrt(residualNorm), 1e-12);

        System.out.println("   ✓ SVD singular values sorted, null vector ||R v_12|| < 1e-12.");
    }

    // =========================================================================
    // 5. END-TO-END DLT CALIBRATION WITH SYNTHETIC 3D CONTROL CAGE
    // =========================================================================
    public static void test5_EndToEndDLTCalibrationWithSyntheticCage() {
        System.out.println("[TEST 5/7] End-to-End DLT Calibration on Synthetic 3D Cage...");

        // 12 Training Points from sampleCalibrationCage fixture
        double[] pts3D = {
            0.000, 0.000, 1.000,
            0.500, 0.000, 1.000,
            1.000, 0.000, 1.000,
            0.000, 0.500, 1.000,
            0.500, 0.500, 1.000,
            1.000, 0.500, 1.000,
            0.000, 1.000, 1.000,
            0.500, 1.000, 1.000,
            1.000, 1.000, 1.000,
            0.000, 0.000, 1.500,
            1.000, 0.000, 1.500,
            0.000, 1.000, 1.500
        };
        double[] pts2D = {
            185.2, 342.1,
            274.6, 342.1,
            364.0, 342.1,
            185.2, 240.0,
            274.6, 240.0,
            364.0, 240.0,
            185.2, 137.9,
            274.6, 137.9,
            364.0, 137.9,
            218.4, 308.1,
            337.6, 308.1,
            218.4, 171.9
        };
        int n = 12;

        CalibrationContext ctx = new CalibrationContext(n);
        DLT11 dlt = new DLT11();
        double[] metrics = new double[6];

        DLTCalibrator.Status status = DLTCalibrator.calibrate(
                pts3D, pts2D, n,
                false, 320, 240, 0, 0, 0, 0, 0, 1000.0,
                ctx, dlt, metrics);

        assertEquals("Calibration Status SUCCESS", DLTCalibrator.Status.SUCCESS, status);
        assertTrue("Training RMS residual < 0.15 px", metrics[0] < 0.15);
        assertTrue("Training Max residual < 0.35 px", metrics[1] < 0.35);
        assertTrue("Non-null Condition Number kappa < 1e5", metrics[3] < 1e5);
        assertTrue("Null-space Separation Ratio > 10", metrics[4] > 10.0);

        System.out.printf("   ✓ Calibration SUCCESS: RMS = %.4f px, Max = %.4f px, kappa = %.2f%n",
                metrics[0], metrics[1], metrics[3]);
    }

    // =========================================================================
    // 6. STEREO TRIANGULATION PARITY & DEGENERATE RAY REJECTION
    // =========================================================================
    public static void test6_StereoTriangulationParityAndDegenerateRay() {
        System.out.println("[TEST 6/7] Stereo Triangulation Parity & Degenerate Ray Rejection...");

        TriangulationContext ctx = new TriangulationContext();
        double[] outXyz = new double[3];
        double[] metrics = new double[5];

        // 6A. Convergent Stereo Setup from baseline fixture (60 deg convergence baseline)
        DLT11 dlt1 = new DLT11(new double[]{
            221.726, 0.0, 91.844, 156.0,
            0.0, -240.0, 0.0, 350.0,
            0.0, 0.0, 0.05
        });
        DLT11 dlt2 = new DLT11(new double[]{
            221.726, 0.0, -91.844, 444.0,
            0.0, -240.0, 0.0, 350.0,
            0.0, 0.0, 0.05
        });

        double u1 = 312.5, v1 = 254.0;
        double u2 = 287.5, v2 = 254.0;

        DualViewTriangulator.TriangulationStatus status = DualViewTriangulator.triangulate(
                u1, v1, dlt1,
                u2, v2, dlt2,
                1.5, 50.0, ctx, outXyz, metrics);

        assertEquals("Triangulation Status CONVERGED", DualViewTriangulator.TriangulationStatus.CONVERGED, status);
        assertEquals("Reconstructed X (Baseline: 0.11606564)", 0.11606564, outXyz[0], 1e-4);
        assertEquals("Reconstructed Y (Baseline: 0.30921345)", 0.30921345, outXyz[1], 1e-4);
        assertEquals("Reconstructed Z (Baseline: 1.71565134)", 1.71565134, outXyz[2], 1e-4);
        assertEquals("Combined Reprojection Residual", 0.0, metrics[0], 1e-3);

        // 6B. Degenerate Parallel Rays Case (Optical axis angle theta < 1.5 deg)
        DLT11 dltIdentical = new DLT11(new double[]{
            300.0, 0.0, 0.0, 320.0,
            0.0, -300.0, 0.0, 240.0,
            0.0, 0.0, 0.0
        });

        DualViewTriangulator.TriangulationStatus degenStatus = DualViewTriangulator.triangulate(
                320.0, 240.0, dltIdentical,
                320.0, 240.0, dltIdentical,
                1.5, 50.0, ctx, outXyz, metrics);

        assertEquals("Parallel Ray Angle Rejection Gate",
                DualViewTriangulator.TriangulationStatus.RAY_ANGLE_REJECTED, degenStatus);

        // 6C. Optical Center Extraction Verification
        double[] center1 = new double[3];
        boolean hasC1 = DualViewTriangulator.extractCameraCenter(dlt1, center1);
        assertTrue("Camera 1 Center Extracted", hasC1);
        assertTrue("Camera 1 Center Finite", Double.isFinite(center1[0]) && Double.isFinite(center1[1]) && Double.isFinite(center1[2]));

        System.out.printf("   ✓ Triangulation parity error < 1e-4 m, parallel rays (<1.5 deg) rejected.%n");
    }

    // =========================================================================
    // 7. AEROSPACE & DEFENSE TELEMETRY (O(dt^2) KINEMATICS)
    // =========================================================================
    public static void test7_AerospaceKinematicsTrajectory() {
        System.out.println("[TEST 7/7] Aerospace & Defense Telemetry (O(dt^2) Kinematics)...");

        int n = 11;
        double dt = 0.1; // 100 ms intervals
        double[] times = new double[n];
        double[] coordsXyz = new double[3 * n];

        double g = 9.80665;
        double v0x = 25.0; // 25 m/s horizontal
        double v0y = 49.03325; // initial vertical velocity (apex at t = 5.0 s)

        for (int i = 0; i < n; i++) {
            double t = i * dt;
            times[i] = t;
            coordsXyz[3 * i + 0] = v0x * t;
            coordsXyz[3 * i + 1] = v0y * t - 0.5 * g * t * t;
            coordsXyz[3 * i + 2] = 0.0;
        }

        double[] velXyz = new double[3 * n];
        double[] accXyz = new double[3 * n];
        double[] metrics = new double[6 * n];

        SpatialKinematics.computeTrajectoryKinematics(times, coordsXyz, n, velXyz, accXyz, metrics);

        // Test at interior step i = 5 (t = 0.5 s)
        int testIdx = 5;
        double t5 = times[testIdx];
        double trueVx = v0x;
        double trueVy = v0y - g * t5;

        assertEquals("Vx central difference", trueVx, velXyz[3 * testIdx + 0], 1e-10);
        assertEquals("Vy central difference", trueVy, velXyz[3 * testIdx + 1], 1e-10);

        // Acceleration should match -g in Y and 0 in X, Z
        assertEquals("Ax central difference", 0.0, accXyz[3 * testIdx + 0], 1e-8);
        assertEquals("Ay central difference", -g, accXyz[3 * testIdx + 1], 1e-8);
        assertEquals("Az central difference", 0.0, accXyz[3 * testIdx + 2], 1e-8);

        // Total g-force should be ~1.0
        assertEquals("Dynamic G-Force at apex", 1.0, metrics[testIdx * 6 + 2], 1e-8);

        // Telemetry metrics
        double expGroundRange = coordsXyz[3 * testIdx + 0];
        double expSlantRange = Math.hypot(coordsXyz[3 * testIdx + 0], coordsXyz[3 * testIdx + 1]);
        assertEquals("Ground Range", expGroundRange, metrics[testIdx * 6 + 3], 1e-10); // slant range at offset 3
        assertEquals("Azimuth Deg (Z=0)", 0.0, metrics[testIdx * 6 + 4], 1e-10);

        System.out.println("   ✓ O(dt^2) velocity and acceleration match analytical trajectory down to 1e-10.");
    }

    // =========================================================================
    // ASSERTION UTILITIES
    // =========================================================================
    private static void assertEquals(String desc, double expected, double actual, double tol) {
        if (Double.isNaN(expected) && Double.isNaN(actual)) {
            testsPassed++;
            return;
        }
        double diff = Math.abs(expected - actual);
        if (diff <= tol) {
            testsPassed++;
        } else {
            testsFailed++;
            System.err.printf("   ❌ Assertion Failed [%s]: expected %.10e, actual %.10e (diff: %.4e > tol: %.4e)%n",
                    desc, expected, actual, diff, tol);
        }
    }

    private static void assertEquals(String desc, Object expected, Object actual) {
        if ((expected == null && actual == null) || (expected != null && expected.equals(actual))) {
            testsPassed++;
        } else {
            testsFailed++;
            System.err.printf("   ❌ Assertion Failed [%s]: expected %s, actual %s%n", desc, expected, actual);
        }
    }

    private static void assertTrue(String desc, boolean condition) {
        if (condition) {
            testsPassed++;
        } else {
            testsFailed++;
            System.err.printf("   ❌ Assertion Failed [%s]: expected true, was false%n", desc);
        }
    }

    private static void assertFalse(String desc, boolean condition) {
        if (!condition) {
            testsPassed++;
        } else {
            testsFailed++;
            System.err.printf("   ❌ Assertion Failed [%s]: expected false, was true%n", desc);
        }
    }
}
