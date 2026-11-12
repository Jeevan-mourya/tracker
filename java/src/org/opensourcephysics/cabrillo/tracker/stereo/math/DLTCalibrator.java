package org.opensourcephysics.cabrillo.tracker.stereo.math;

import java.util.Arrays;

/**
 * 11-Parameter Projective Direct Linear Transformation (DLT) Camera Calibrator.
 *
 * <p>Pipeline stages:
 * <ol>
 *   <li>Defensive input geometry verification (non-coplanarity rank test: det(Cov_3D) > 1e-9).</li>
 *   <li>Optional Brown-Conrady lens-distortion pre-correction on observation pixels.</li>
 *   <li>Isotropic Hartley similarity normalization (3D world -> sqrt(3), 2D image -> sqrt(2)).</li>
 *   <li>2N x 12 design matrix construction.</li>
 *   <li>Thin Householder QR decomposition reducing 2N x 12 -> 12 x 12 upper-triangular R.</li>
 *   <li>Cyclic one-sided Hestenes Jacobi SVD on R to extract the null-space singular vector.</li>
 *   <li>Analytical metric denormalization (P = T_2D^(-1) * P_tilde * U_3D).</li>
 *   <li>Reprojection residual statistics evaluation (RMS, Max, Median) and condition gate checks.</li>
 * </ol>
 *
 * All operations execute with zero object allocation when using the provided CalibrationContext.
 */
public final class DLTCalibrator {

    public enum Status {
        SUCCESS,
        INSUFFICIENT_POINTS,
        DEGENERATE_GEOMETRY,
        COPLANAR_POINTS,
        ILL_CONDITIONED,
        RANK_DEFICIENT
    }

    private DLTCalibrator() {
        // Static numerical utility
    }

    /**
     * Calibrates an 11-parameter DLT camera model from N >= 6 known 3D-to-2D correspondence pairs.
     *
     * @param pts3D flat array of 3D world coordinates [X0, Y0, Z0, X1, Y1, Z1, ...] (length >= 3*n)
     * @param pts2D flat array of 2D image observations [u0, v0, u1, v1, ...] (length >= 2*n)
     * @param n number of control points (n >= 6)
     * @param distortionEnabled whether Brown-Conrady distortion correction is active
     * @param u0 principal point u (imageWidth / 2)
     * @param v0 principal point v (imageHeight / 2)
     * @param k1 radial coefficient 1
     * @param k2 radial coefficient 2
     * @param k3 radial coefficient 3
     * @param p1 tangential coefficient 1
     * @param p2 tangential coefficient 2
     * @param scale distortion normalization scale (typically 1000.0)
     * @param ctx pre-allocated CalibrationContext workspace
     * @param outDlt11 destination DLT11 parameter container
     * @param outResidualMetrics destination array of length >= 6 for:
     *                           [0] = RMS reprojection residual (pixels),
     *                           [1] = Max reprojection residual (pixels),
     *                           [2] = Median reprojection residual (pixels),
     *                           [3] = kappa_nonnull (sigma_1 / sigma_11),
     *                           [4] = null_space_separation (sigma_11 / sigma_12),
     *                           [5] = full_condition_number (sigma_1 / sigma_12)
     * @return Status code indicating calibration result
     */
    public static Status calibrate(
            double[] pts3D,
            double[] pts2D,
            int n,
            boolean distortionEnabled,
            double u0, double v0,
            double k1, double k2, double k3,
            double p1, double p2,
            double scale,
            CalibrationContext ctx,
            DLT11 outDlt11,
            double[] outResidualMetrics) {

        if (n < 6) {
            return Status.INSUFFICIENT_POINTS;
        }

        ctx.ensureCapacity(n);

        // 1. Validate coordinates finiteness
        for (int i = 0; i < 3 * n; i++) {
            if (!Double.isFinite(pts3D[i])) return Status.DEGENERATE_GEOMETRY;
        }
        for (int i = 0; i < 2 * n; i++) {
            if (!Double.isFinite(pts2D[i])) return Status.DEGENERATE_GEOMETRY;
        }

        // 2. 3D Spatial Geometry Spread & Coplanarity Check
        double meanX = 0, meanY = 0, meanZ = 0;
        for (int i = 0; i < n; i++) {
            meanX += pts3D[3 * i];
            meanY += pts3D[3 * i + 1];
            meanZ += pts3D[3 * i + 2];
        }
        meanX /= n;
        meanY /= n;
        meanZ /= n;

        double covXX = 0, covYY = 0, covZZ = 0, covXY = 0, covXZ = 0, covYZ = 0;
        for (int i = 0; i < n; i++) {
            double dx = pts3D[3 * i] - meanX;
            double dy = pts3D[3 * i + 1] - meanY;
            double dz = pts3D[3 * i + 2] - meanZ;
            covXX += dx * dx;
            covYY += dy * dy;
            covZZ += dz * dz;
            covXY += dx * dy;
            covXZ += dx * dz;
            covYZ += dy * dz;
        }

        double totalVariance = covXX + covYY + covZZ;
        if (totalVariance < 1e-7) {
            return Status.DEGENERATE_GEOMETRY;
        }

        // 3D Coplanarity determinant test
        double det3D = covXX * (covYY * covZZ - covYZ * covYZ)
                - covXY * (covXY * covZZ - covXZ * covYZ)
                + covXZ * (covXY * covYZ - covXZ * covYY);

        if (Math.abs(det3D) < 1e-9) {
            return Status.COPLANAR_POINTS;
        }

        // 3. Apply lens distortion pre-correction on observation pixels if enabled
        double[] tempUv = new double[2];
        for (int i = 0; i < n; i++) {
            double uObs = pts2D[2 * i];
            double vObs = pts2D[2 * i + 1];
            if (distortionEnabled) {
                boolean ok = BrownConradyDistortion.undistort(
                        uObs, vObs, u0, v0, k1, k2, k3, p1, p2, scale, tempUv, null);
                if (ok) {
                    uObs = tempUv[0];
                    vObs = tempUv[1];
                }
            }
            ctx.pts2D[2 * i] = uObs;
            ctx.pts2D[2 * i + 1] = vObs;
        }
        System.arraycopy(pts3D, 0, ctx.pts3D, 0, 3 * n);

        // 4. Hartley Similarity Normalization
        HartleyNormalization.normalize3D(ctx.pts3D, n, ctx.norm3D, ctx.stats3D);
        HartleyNormalization.normalize2D(ctx.pts2D, n, ctx.norm2D, ctx.stats2D);

        // 5. Construct 2N x 12 Design Matrix A
        // Row 2*i:   [ X, Y, Z, 1,  0, 0, 0, 0,  -u*X, -u*Y, -u*Z, -u ]
        // Row 2*i+1: [ 0, 0, 0, 0,  X, Y, Z, 1,  -v*X, -v*Y, -v*Z, -v ]
        double[] A = ctx.designA;
        for (int i = 0; i < n; i++) {
            double X = ctx.norm3D[3 * i];
            double Y = ctx.norm3D[3 * i + 1];
            double Z = ctx.norm3D[3 * i + 2];
            double u = ctx.norm2D[2 * i];
            double v = ctx.norm2D[2 * i + 1];

            int r1 = (2 * i) * 12;
            A[r1 + 0] = X;
            A[r1 + 1] = Y;
            A[r1 + 2] = Z;
            A[r1 + 3] = 1.0;
            A[r1 + 4] = 0.0;
            A[r1 + 5] = 0.0;
            A[r1 + 6] = 0.0;
            A[r1 + 7] = 0.0;
            A[r1 + 8] = -u * X;
            A[r1 + 9] = -u * Y;
            A[r1 + 10] = -u * Z;
            A[r1 + 11] = -u;

            int r2 = (2 * i + 1) * 12;
            A[r2 + 0] = 0.0;
            A[r2 + 1] = 0.0;
            A[r2 + 2] = 0.0;
            A[r2 + 3] = 0.0;
            A[r2 + 4] = X;
            A[r2 + 5] = Y;
            A[r2 + 6] = Z;
            A[r2 + 7] = 1.0;
            A[r2 + 8] = -v * X;
            A[r2 + 9] = -v * Y;
            A[r2 + 10] = -v * Z;
            A[r2 + 11] = -v;
        }

        // 6. Thin Householder QR reduction: 2N x 12 -> 12 x 12 upper-triangular R
        HouseholderQR.thinQR(A, 2 * n, 12, ctx.workQR_A, ctx.workQR_V, ctx.R12x12);

        // 7. Cyclic Jacobi SVD on 12x12 matrix R
        JacobiSVD.svd12(
                ctx.R12x12,
                ctx.workW,
                ctx.workV,
                ctx.singularValues,
                ctx.sortedV,
                ctx.spectralMetrics);

        double kappaNonNull = ctx.spectralMetrics[0];
        double nullSpaceSeparation = ctx.spectralMetrics[1];
        double fullCondition = ctx.spectralMetrics[2];

        // 8. Solution vector is column 11 (smallest singular value) of sorted V
        for (int r = 0; r < 12; r++) {
            ctx.pTilde12[r] = ctx.sortedV[r * 12 + 11];
        }

        // 9. Analytical Denormalization: P = T_2D^(-1) * P_tilde * U_3D
        HartleyNormalization.denormalizeDLT(ctx.pTilde12, ctx.stats2D, ctx.stats3D, outDlt11);

        // 10. Evaluate Reprojection Residuals against raw observed pixels
        double sumSq = 0.0;
        double maxRes = 0.0;
        double[] reproj = new double[2];
        double[] distReproj = new double[2];

        for (int i = 0; i < n; i++) {
            double X = pts3D[3 * i];
            double Y = pts3D[3 * i + 1];
            double Z = pts3D[3 * i + 2];

            outDlt11.project(X, Y, Z, reproj);
            double uEst = reproj[0];
            double vEst = reproj[1];

            if (distortionEnabled) {
                BrownConradyDistortion.apply(
                        uEst, vEst, u0, v0, k1, k2, k3, p1, p2, scale, distReproj);
                uEst = distReproj[0];
                vEst = distReproj[1];
            }

            double du = uEst - pts2D[2 * i];
            double dv = vEst - pts2D[2 * i + 1];
            double res = Math.sqrt(du * du + dv * dv);

            ctx.residuals[i] = res;
            sumSq += res * res;
            if (res > maxRes) {
                maxRes = res;
            }
        }

        double rms = Math.sqrt(sumSq / n);

        // Median residual
        Arrays.sort(ctx.residuals, 0, n);
        double medianRes = (n % 2 == 1)
                ? ctx.residuals[n / 2]
                : 0.5 * (ctx.residuals[n / 2 - 1] + ctx.residuals[n / 2]);

        if (outResidualMetrics != null && outResidualMetrics.length >= 6) {
            outResidualMetrics[0] = rms;
            outResidualMetrics[1] = maxRes;
            outResidualMetrics[2] = medianRes;
            outResidualMetrics[3] = kappaNonNull;
            outResidualMetrics[4] = nullSpaceSeparation;
            outResidualMetrics[5] = fullCondition;
        }

        // 11. Conditioning gates
        if (rms > 15.0) {
            return Status.DEGENERATE_GEOMETRY;
        }
        if (kappaNonNull > 1e7) {
            return Status.ILL_CONDITIONED;
        }
        if (nullSpaceSeparation < 10.0) {
            return Status.RANK_DEFICIENT;
        }

        return Status.SUCCESS;
    }
}
