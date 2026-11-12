package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * High-performance, zero-allocation Dual-View Linear Least-Squares Triangulator.
 *
 * <p>Implements:
 * <ol>
 *   <li>Inhomogeneous 4x3 projection system formulation from dual calibrated DLT models.</li>
 *   <li>Numerically stable Householder QR decomposition (strictly avoiding normal equations A^T * A).</li>
 *   <li>Analytical optical center extraction (C = -M^(-1) * a4 via 3x3 Cramer's rule).</li>
 *   <li>Ray convergence angle computation and conditioning gate (reject if theta < 1.5 degrees).</li>
 *   <li>Individual and combined reprojection residual metrics for quality assurance.</li>
 * </ol>
 */
public final class DualViewTriangulator {

    public enum TriangulationStatus {
        CONVERGED,
        LOW_RAY_ANGLE_WARNING,
        RAY_ANGLE_REJECTED,
        HIGH_RESIDUAL_REJECTED,
        DEGENERATE_NUMERICAL
    }

    private DualViewTriangulator() {
        // Static numerical utility
    }

    /**
     * Extracts the 3D optical center C = [X, Y, Z]^T of a camera in world coordinates
     * from its 11 DLT parameters using Cramer's rule on the 3x3 system:
     * <pre>
     *   [ L1  L2  L3  ] [ X ]   [ -L4 ]
     *   [ L5  L6  L7  ] [ Y ] = [ -L8 ]
     *   [ L9  L10 L11 ] [ Z ]   [ -1  ]
     * </pre>
     *
     * @param dlt DLT11 camera parameters
     * @param outCenter destination array of length >= 3 for [X, Y, Z]
     * @return true if cleanly solved, false if singular
     */
    public static boolean extractCameraCenter(DLT11 dlt, double[] outCenter) {
        double m00 = dlt.l[0], m01 = dlt.l[1], m02 = dlt.l[2];
        double m10 = dlt.l[4], m11 = dlt.l[5], m12 = dlt.l[6];
        double m20 = dlt.l[8], m21 = dlt.l[9], m22 = dlt.l[10];

        double b0 = -dlt.l[3];
        double b1 = -dlt.l[7];
        double b2 = -1.0;

        double det = m00 * (m11 * m22 - m12 * m21)
                   - m01 * (m10 * m22 - m12 * m20)
                   + m02 * (m10 * m21 - m11 * m20);

        if (Math.abs(det) < 1e-12 || !Double.isFinite(det)) {
            return false;
        }

        double invDet = 1.0 / det;

        // Adjugate matrix elements
        double c00 = m11 * m22 - m12 * m21;
        double c01 = -(m10 * m22 - m12 * m20);
        double c02 = m10 * m21 - m11 * m20;

        double c10 = -(m01 * m22 - m02 * m21);
        double c11 = m00 * m22 - m02 * m20;
        double c12 = -(m00 * m21 - m01 * m20);

        double c20 = m01 * m12 - m02 * m11;
        double c21 = -(m00 * m12 - m02 * m10);
        double c22 = m00 * m11 - m01 * m10;

        double x = invDet * (c00 * b0 + c10 * b1 + c20 * b2);
        double y = invDet * (c01 * b0 + c11 * b1 + c21 * b2);
        double z = invDet * (c02 * b0 + c12 * b1 + c22 * b2);

        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            return false;
        }

        outCenter[0] = x;
        outCenter[1] = y;
        outCenter[2] = z;
        return true;
    }

    /**
     * Triangulates a 3D spatial point from matched 2D camera observations using Householder QR.
     *
     * @param u1 Camera 1 observed pixel coordinate u
     * @param v1 Camera 1 observed pixel coordinate v
     * @param dlt1 Camera 1 11-parameter DLT
     * @param u2 Camera 2 observed pixel coordinate u
     * @param v2 Camera 2 observed pixel coordinate v
     * @param dlt2 Camera 2 11-parameter DLT
     * @param minRayAngleDeg minimum acceptable ray intersection angle (typically 1.5 degrees)
     * @param maxResidualPx maximum acceptable reprojection residual in pixels (typically 50.0 px)
     * @param ctx pre-allocated TriangulationContext workspace
     * @param outXyz destination array of length >= 3 for [X, Y, Z] world coordinates (in meters)
     * @param outMetrics destination array of length >= 5 for:
     *                   [0] = combined RMS residual (px),
     *                   [1] = Cam 1 residual (px),
     *                   [2] = Cam 2 residual (px),
     *                   [3] = ray intersection angle (degrees),
     *                   [4] = Householder QR condition estimate
     * @return TriangulationStatus indicating mathematical convergence and conditioning gate
     */
    public static TriangulationStatus triangulate(
            double u1, double v1, DLT11 dlt1,
            double u2, double v2, DLT11 dlt2,
            double minRayAngleDeg,
            double maxResidualPx,
            TriangulationContext ctx,
            double[] outXyz,
            double[] outMetrics) {

        if (!Double.isFinite(u1) || !Double.isFinite(v1) || !Double.isFinite(u2) || !Double.isFinite(v2)) {
            return TriangulationStatus.DEGENERATE_NUMERICAL;
        }

        // Build 4x3 inhomogeneous linear system A * X = B:
        // Row 0: u1*L9_1 - L1_1,  u1*L10_1 - L2_1,  u1*L11_1 - L3_1  =  L4_1 - u1
        // Row 1: v1*L9_1 - L5_1,  v1*L10_1 - L6_1,  v1*L11_1 - L7_1  =  L8_1 - v1
        // Row 2: u2*L9_2 - L1_2,  u2*L10_2 - L2_2,  u2*L11_2 - L3_2  =  L4_2 - u2
        // Row 3: v2*L9_2 - L5_2,  v2*L10_2 - L6_2,  v2*L11_2 - L7_2  =  L8_2 - v2
        double[] A = ctx.A;
        double[] B = ctx.B;

        double[] l1 = dlt1.l;
        double[] l2 = dlt2.l;

        // Row 0
        A[0] = u1 * l1[8] - l1[0];
        A[1] = u1 * l1[9] - l1[1];
        A[2] = u1 * l1[10] - l1[2];
        B[0] = l1[3] - u1;

        // Row 1
        A[3] = v1 * l1[8] - l1[4];
        A[4] = v1 * l1[9] - l1[5];
        A[5] = v1 * l1[10] - l1[6];
        B[1] = l1[7] - v1;

        // Row 2
        A[6] = u2 * l2[8] - l2[0];
        A[7] = u2 * l2[9] - l2[1];
        A[8] = u2 * l2[10] - l2[2];
        B[2] = l2[3] - u2;

        // Row 3
        A[9] = v2 * l2[8] - l2[4];
        A[10] = v2 * l2[9] - l2[5];
        A[11] = v2 * l2[10] - l2[6];
        B[3] = l2[7] - v2;

        // Solve overdetermined 4x3 least-squares via Householder QR
        double[] condHolder = new double[1];
        boolean solved = HouseholderQR.solveLeastSquares4x3(A, B, ctx, outXyz, condHolder);

        if (!solved || condHolder[0] > 1e10) {
            return TriangulationStatus.DEGENERATE_NUMERICAL;
        }

        double X = outXyz[0];
        double Y = outXyz[1];
        double Z = outXyz[2];

        // Evaluate Camera Reprojection Residuals
        dlt1.project(X, Y, Z, ctx.reprojUv);
        double du1 = ctx.reprojUv[0] - u1;
        double dv1 = ctx.reprojUv[1] - v1;
        double res1 = Math.sqrt(du1 * du1 + dv1 * dv1);

        dlt2.project(X, Y, Z, ctx.reprojUv);
        double du2 = ctx.reprojUv[0] - u2;
        double dv2 = ctx.reprojUv[1] - v2;
        double res2 = Math.sqrt(du2 * du2 + dv2 * dv2);

        double combinedResidual = Math.sqrt(0.5 * (res1 * res1 + res2 * res2));

        // Evaluate Ray Convergence Angle
        boolean hasC1 = extractCameraCenter(dlt1, ctx.center1);
        boolean hasC2 = extractCameraCenter(dlt2, ctx.center2);

        double rayAngleDeg = 0.0;
        if (hasC1 && hasC2) {
            double v1x = X - ctx.center1[0];
            double v1y = Y - ctx.center1[1];
            double v1z = Z - ctx.center1[2];

            double v2x = X - ctx.center2[0];
            double v2y = Y - ctx.center2[1];
            double v2z = Z - ctx.center2[2];

            double len1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
            double len2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

            if (len1 > 1e-9 && len2 > 1e-9) {
                double dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (len1 * len2);
                double clampedDot = Math.max(-1.0, Math.min(1.0, dot));
                rayAngleDeg = Math.acos(clampedDot) * (180.0 / Math.PI);
            }
        }

        if (outMetrics != null && outMetrics.length >= 5) {
            outMetrics[0] = combinedResidual;
            outMetrics[1] = res1;
            outMetrics[2] = res2;
            outMetrics[3] = rayAngleDeg;
            outMetrics[4] = condHolder[0];
        }

        // Conditioning Gates
        if (combinedResidual > maxResidualPx) {
            return TriangulationStatus.HIGH_RESIDUAL_REJECTED;
        }
        if (rayAngleDeg < minRayAngleDeg) {
            return TriangulationStatus.RAY_ANGLE_REJECTED;
        }
        if (rayAngleDeg < 10.0) {
            return TriangulationStatus.LOW_RAY_ANGLE_WARNING;
        }

        return TriangulationStatus.CONVERGED;
    }
}
