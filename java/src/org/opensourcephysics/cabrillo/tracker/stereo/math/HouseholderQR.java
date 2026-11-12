package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * High-performance, zero-allocation Householder QR decomposition and least-squares solver.
 *
 * <p>Implements:
 * <ol>
 *   <li>Dedicated inhomogeneous 4x3 least-squares solver with upper-triangular back-substitution
 *       and condition number estimation. Strictly avoids squaring condition numbers by never
 *       forming normal equations (A^T * A).</li>
 *   <li>Generalized thin QR decomposition for tall rectangular matrices (e.g. 2N x 12 DLT design
 *       matrices, M >= N), extracting the N x N upper-triangular matrix R while strictly preserving
 *       column 2-norms.</li>
 * </ol>
 *
 * All operations execute on flat 1D primitive arrays (`double[]`) in row-major order:
 * index = row * numCols + col.
 */
public final class HouseholderQR {

    private HouseholderQR() {
        // Static numerical utility
    }

    /**
     * Solves the overdetermined 4x3 linear system A * X = B minimizing ||A*X - B||_2
     * using Householder QR reflections and back-substitution.
     *
     * @param A flat 4x3 matrix in row-major order (length 12)
     * @param B flat 4x1 right-hand side vector (length 4)
     * @param ctx pre-allocated TriangulationContext workspace
     * @param outXyz destination array of length >= 3 for [X, Y, Z] solution
     * @param outCondition optional 1-element destination array for condition estimate (max|R_ii| / min|R_ii|)
     * @return true if cleanly solved, false if rank-deficient or ill-conditioned
     */
    public static boolean solveLeastSquares4x3(
            double[] A,
            double[] B,
            TriangulationContext ctx,
            double[] outXyz,
            double[] outCondition) {

        // Validate input finiteness
        for (int i = 0; i < 12; i++) {
            if (!Double.isFinite(A[i])) {
                if (outCondition != null && outCondition.length > 0) outCondition[0] = Double.POSITIVE_INFINITY;
                return false;
            }
        }
        for (int i = 0; i < 4; i++) {
            if (!Double.isFinite(B[i])) {
                if (outCondition != null && outCondition.length > 0) outCondition[0] = Double.POSITIVE_INFINITY;
                return false;
            }
        }

        // Copy A into R (4x3) and B into QtB (4x1)
        System.arraycopy(A, 0, ctx.R, 0, 12);
        System.arraycopy(B, 0, ctx.QtB, 0, 4);

        double[] R = ctx.R;
        double[] QtB = ctx.QtB;
        double[] v = ctx.v;

        // Apply Householder reflections across 3 columns (k = 0, 1, 2)
        for (int k = 0; k < 3; k++) {
            // Column vector norm from row k to row 3
            double normSq = 0.0;
            for (int i = k; i < 4; i++) {
                double val = R[i * 3 + k];
                normSq += val * val;
            }
            double norm = Math.sqrt(normSq);
            if (norm < 1e-12) {
                // Column is effectively zero -> rank deficient
                if (outCondition != null && outCondition.length > 0) outCondition[0] = Double.POSITIVE_INFINITY;
                return false;
            }

            double rkk = R[k * 3 + k];
            double alpha = rkk >= 0.0 ? -norm : norm;
            double v0 = rkk - alpha;

            for (int i = 0; i < 4; i++) {
                v[i] = 0.0;
            }
            v[k] = v0;
            double vNormSq = v0 * v0;
            for (int i = k + 1; i < 4; i++) {
                double val = R[i * 3 + k];
                v[i] = val;
                vNormSq += val * val;
            }

            if (vNormSq < 1e-18) {
                continue;
            }

            // Apply Householder reflection H = I - 2*(v*v^T)/(v^T*v) to columns of R (from k to 2)
            for (int j = k; j < 3; j++) {
                double dot = 0.0;
                for (int i = k; i < 4; i++) {
                    dot += v[i] * R[i * 3 + j];
                }
                double tau = (2.0 * dot) / vNormSq;
                for (int i = k; i < 4; i++) {
                    R[i * 3 + j] -= tau * v[i];
                }
            }

            // Apply reflection to transformed right-hand side QtB
            double dotB = 0.0;
            for (int i = k; i < 4; i++) {
                dotB += v[i] * QtB[i];
            }
            double tauB = (2.0 * dotB) / vNormSq;
            for (int i = k; i < 4; i++) {
                QtB[i] -= tauB * v[i];
            }
        }

        // Condition estimate from diagonal entries of upper-triangular R: |r_max| / |r_min|
        double d0 = Math.abs(R[0 * 3 + 0]);
        double d1 = Math.abs(R[1 * 3 + 1]);
        double d2 = Math.abs(R[2 * 3 + 2]);

        double minDiag = Math.min(d0, Math.min(d1, d2));
        double maxDiag = Math.max(d0, Math.max(d1, d2));

        if (minDiag < 1e-10) {
            if (outCondition != null && outCondition.length > 0) outCondition[0] = Double.POSITIVE_INFINITY;
            return false;
        }

        double conditionEstimate = maxDiag / minDiag;
        if (outCondition != null && outCondition.length > 0) {
            outCondition[0] = conditionEstimate;
        }

        // Back-substitution for upper-triangular 3x3 system:
        // [ R00 R01 R02 ] [ X ]   [ QtB0 ]
        // [  0  R11 R12 ] [ Y ] = [ QtB1 ]
        // [  0   0  R22 ] [ Z ]   [ QtB2 ]
        double r22 = R[2 * 3 + 2];
        double z = QtB[2] / r22;

        double r11 = R[1 * 3 + 1];
        double y = (QtB[1] - R[1 * 3 + 2] * z) / r11;

        double r00 = R[0 * 3 + 0];
        double x = (QtB[0] - R[0 * 3 + 1] * y - R[0 * 3 + 2] * z) / r00;

        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            return false;
        }

        outXyz[0] = x;
        outXyz[1] = y;
        outXyz[2] = z;
        return true;
    }

    /**
     * Computes thin Householder QR decomposition for an M x N matrix A (M >= N).
     * Decomposes A into Q * R and writes the N x N upper-triangular matrix R
     * into outR12x12 (length N * N) in row-major order.
     *
     * <p>Strictly preserves column 2-norms without forming normal equations A^T * A.
     *
     * @param A flat M x N input matrix (length M * N)
     * @param m number of rows (e.g. 2 * N_controlPoints, >= 12)
     * @param n number of columns (typically 12 for homogeneous DLT)
     * @param workA pre-allocated working copy of A (length >= m * n)
     * @param workV pre-allocated reflection vector (length >= m)
     * @param outR destination array of length >= n * n for upper-triangular R
     */
    public static void thinQR(
            double[] A,
            int m,
            int n,
            double[] workA,
            double[] workV,
            double[] outR) {

        System.arraycopy(A, 0, workA, 0, m * n);

        for (int k = 0; k < n; k++) {
            // Column vector norm from row k to row m - 1
            double normSq = 0.0;
            for (int i = k; i < m; i++) {
                double val = workA[i * n + k];
                normSq += val * val;
            }
            double norm = Math.sqrt(normSq);
            if (norm < 1e-15) {
                continue;
            }

            double rkk = workA[k * n + k];
            double alpha = rkk >= 0.0 ? -norm : norm;
            double v0 = rkk - alpha;

            for (int i = 0; i < m; i++) {
                workV[i] = 0.0;
            }
            workV[k] = v0;
            double vNormSq = v0 * v0;
            for (int i = k + 1; i < m; i++) {
                double val = workA[i * n + k];
                workV[i] = val;
                vNormSq += val * val;
            }

            if (vNormSq < 1e-18) {
                continue;
            }

            // Apply Householder reflection H = I - 2*(v*v^T)/(v^T*v) to columns of workA from k to n - 1
            for (int j = k; j < n; j++) {
                double dot = 0.0;
                for (int i = k; i < m; i++) {
                    dot += workV[i] * workA[i * n + j];
                }
                double tau = (2.0 * dot) / vNormSq;
                for (int i = k; i < m; i++) {
                    workA[i * n + j] -= tau * workV[i];
                }
            }
        }

        // Extract top N x N upper-triangular part into outR
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (j >= i) {
                    outR[i * n + j] = workA[i * n + j];
                } else {
                    outR[i * n + j] = 0.0; // Exact zero on sub-diagonal
                }
            }
        }
    }
}
