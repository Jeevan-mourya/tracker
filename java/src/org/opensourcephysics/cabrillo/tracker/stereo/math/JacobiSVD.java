package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * High-precision, zero-allocation implementation of the one-sided cyclic Hestenes Jacobi
 * Singular Value Decomposition (SVD) for 12x12 matrices.
 *
 * <p>Used in projective DLT camera calibration to compute the right singular vector
 * corresponding to the smallest singular value (null-space solution of A * p ~= 0, ||p||_2 = 1).
 *
 * <p>Unlike Golub-Reinsch bidiagonalization or normal-equation eigensolvers, Hestenes Jacobi SVD:
 * <ul>
 *   <li>Guarantees unconditional numerical stability with zero matrix inversion.</li>
 *   <li>Operates directly on the 12x12 upper-triangular matrix R from thin QR decomposition.</li>
 *   <li>Computes singular values and right singular vectors to machine precision (IEEE 754 double).</li>
 * </ul>
 *
 * All operations use flat 1D primitive arrays (`double[]`) in row-major order.
 */
public final class JacobiSVD {

    public static final int N = 12;
    public static final int MAX_SWEEPS = 35;
    public static final double TOLERANCE = 1e-15;

    private JacobiSVD() {
        // Static numerical utility
    }

    /**
     * Computes the SVD of a 12x12 matrix R: R * V = W, where columns of W are orthogonal.
     * Singular values are the Euclidean 2-norms of the columns of W.
     *
     * @param R flat 12x12 input matrix in row-major order (length 144)
     * @param workW flat 12x12 working matrix for transformed columns (length 144)
     * @param workV flat 12x12 working matrix for right singular vectors (length 144)
     * @param outSingularValues destination array of length >= 12 for sorted singular values (descending)
     * @param outSortedV destination array of length >= 144 for sorted right singular vectors V
     * @param outMetrics destination array of length >= 3 for spectral diagnostics:
     *                   [0] = kappa_nonnull (sigma_1 / sigma_11),
     *                   [1] = null_space_separation (sigma_11 / sigma_12),
     *                   [2] = full_condition_number (sigma_1 / sigma_12)
     */
    public static void svd12(
            double[] R,
            double[] workW,
            double[] workV,
            double[] outSingularValues,
            double[] outSortedV,
            double[] outMetrics) {

        // 1. Initialize workW = R, workV = I_12
        System.arraycopy(R, 0, workW, 0, N * N);
        for (int i = 0; i < N; i++) {
            for (int j = 0; j < N; j++) {
                workV[i * N + j] = (i == j) ? 1.0 : 0.0;
            }
        }

        // 2. Cyclic Jacobi Sweeps across all pairs (i, j) with 0 <= i < j < 12
        for (int sweep = 0; sweep < MAX_SWEEPS; sweep++) {
            double maxOffDiagonal = 0.0;

            for (int i = 0; i < N - 1; i++) {
                for (int j = i + 1; j < N; j++) {
                    // Dot products of column i and column j in workW
                    double a = 0.0;
                    double b = 0.0;
                    double c = 0.0;

                    for (int r = 0; r < N; r++) {
                        double wi = workW[r * N + i];
                        double wj = workW[r * N + j];
                        a += wi * wi;
                        b += wj * wj;
                        c += wi * wj;
                    }

                    double normProd = Math.sqrt(a * b);
                    if (normProd < 1e-30) {
                        continue;
                    }

                    double offDiag = Math.abs(c) / normProd;
                    if (offDiag > maxOffDiagonal) {
                        maxOffDiagonal = offDiag;
                    }

                    if (offDiag > TOLERANCE) {
                        // Compute 2x2 Givens planar rotation angle
                        double xi = (b - a) / (2.0 * c);
                        double signXi = xi >= 0.0 ? 1.0 : -1.0;
                        double t = signXi / (Math.abs(xi) + Math.sqrt(1.0 + xi * xi));
                        double cs = 1.0 / Math.sqrt(1.0 + t * t);
                        double sn = t * cs;

                        // Rotate column i and column j in workW
                        for (int r = 0; r < N; r++) {
                            double w1 = workW[r * N + i];
                            double w2 = workW[r * N + j];
                            workW[r * N + i] = cs * w1 - sn * w2;
                            workW[r * N + j] = sn * w1 + cs * w2;
                        }

                        // Rotate column i and column j in workV
                        for (int r = 0; r < N; r++) {
                            double v1 = workV[r * N + i];
                            double v2 = workV[r * N + j];
                            workV[r * N + i] = cs * v1 - sn * v2;
                            workV[r * N + j] = sn * v1 + cs * v2;
                        }
                    }
                }
            }

            if (maxOffDiagonal < TOLERANCE) {
                break;
            }
        }

        // 3. Compute singular values as Euclidean column norms of workW
        double[] rawSingularValues = new double[N];
        int[] colIndices = new int[N];
        for (int j = 0; j < N; j++) {
            double sumSq = 0.0;
            for (int r = 0; r < N; r++) {
                double val = workW[r * N + j];
                sumSq += val * val;
            }
            rawSingularValues[j] = Math.sqrt(sumSq);
            colIndices[j] = j;
        }

        // 4. Insertion sort descending (sigma_0 >= sigma_1 >= ... >= sigma_11)
        for (int i = 0; i < N - 1; i++) {
            int maxIdx = i;
            for (int j = i + 1; j < N; j++) {
                if (rawSingularValues[j] > rawSingularValues[maxIdx]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                double tempVal = rawSingularValues[i];
                rawSingularValues[i] = rawSingularValues[maxIdx];
                rawSingularValues[maxIdx] = tempVal;

                int tempIdx = colIndices[i];
                colIndices[i] = colIndices[maxIdx];
                colIndices[maxIdx] = tempIdx;
            }
        }

        System.arraycopy(rawSingularValues, 0, outSingularValues, 0, N);

        // 5. Permute columns of workV into outSortedV
        for (int j = 0; j < N; j++) {
            int origCol = colIndices[j];
            for (int r = 0; r < N; r++) {
                outSortedV[r * N + j] = workV[r * N + origCol];
            }
        }

        // 6. Spectral conditioning diagnostics
        double sigma1 = outSingularValues[0];
        double sigma11 = outSingularValues[10]; // 11th singular value (smallest non-null mode)
        double sigma12 = outSingularValues[11]; // 12th singular value (null-space solution mode)

        double kappaNonNull = sigma11 > 1e-15 ? sigma1 / sigma11 : Double.POSITIVE_INFINITY;
        double nullSpaceSeparation = sigma12 > 1e-15 ? sigma11 / sigma12 : Double.POSITIVE_INFINITY;
        double fullConditionNumber = sigma12 > 1e-15 ? sigma1 / sigma12 : Double.POSITIVE_INFINITY;

        if (outMetrics != null && outMetrics.length >= 3) {
            outMetrics[0] = kappaNonNull;
            outMetrics[1] = nullSpaceSeparation;
            outMetrics[2] = fullConditionNumber;
        }
    }
}
