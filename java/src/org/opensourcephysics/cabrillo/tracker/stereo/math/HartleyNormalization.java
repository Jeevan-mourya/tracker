package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * Implements Hartley isotropic similarity normalization and analytical denormalization
 * for 2D image coordinates and 3D world coordinates.
 *
 * <p>Hartley normalization translates the centroid of coordinates to the coordinate origin
 * and scales them so that the average Euclidean distance from the origin is sqrt(2) for 2D points
 * and sqrt(3) for 3D points. This improves numerical conditioning of the DLT design matrix by
 * several orders of magnitude without introducing distortion.
 *
 * <p>All methods use flat 1D primitive arrays (`double[]`) to avoid heap allocations.
 */
public final class HartleyNormalization {

    private HartleyNormalization() {
        // Static numerical utility
    }

    /**
     * Normalizes an array of N 2D image points (u, v).
     *
     * @param pts2D flat array of input points: length >= 2*n, ordered [u0, v0, u1, v1, ...]
     * @param n number of points (n >= 1)
     * @param outNorm2D destination array for normalized points [u0_norm, v0_norm, ...] (length >= 2*n)
     * @param outStats destination array of length >= 3 for normalization statistics:
     *                 [0] = centroid u (mu_u),
     *                 [1] = centroid v (mu_v),
     *                 [2] = scale factor (s2D)
     */
    public static void normalize2D(double[] pts2D, int n, double[] outNorm2D, double[] outStats) {
        if (n <= 0) {
            outStats[0] = 0;
            outStats[1] = 0;
            outStats[2] = 1.0;
            return;
        }

        double sumU = 0.0;
        double sumV = 0.0;
        for (int i = 0; i < n; i++) {
            sumU += pts2D[2 * i];
            sumV += pts2D[2 * i + 1];
        }
        double muU = sumU / n;
        double muV = sumV / n;

        double sumDist = 0.0;
        for (int i = 0; i < n; i++) {
            double du = pts2D[2 * i] - muU;
            double dv = pts2D[2 * i + 1] - muV;
            sumDist += Math.sqrt(du * du + dv * dv);
        }
        double meanDist = sumDist / n;
        double s2D = meanDist > 1e-12 ? Math.sqrt(2.0) / meanDist : 1.0;

        for (int i = 0; i < n; i++) {
            outNorm2D[2 * i] = s2D * (pts2D[2 * i] - muU);
            outNorm2D[2 * i + 1] = s2D * (pts2D[2 * i + 1] - muV);
        }

        outStats[0] = muU;
        outStats[1] = muV;
        outStats[2] = s2D;
    }

    /**
     * Normalizes an array of N 3D world points (X, Y, Z).
     *
     * @param pts3D flat array of input points: length >= 3*n, ordered [X0, Y0, Z0, X1, Y1, Z1, ...]
     * @param n number of points (n >= 1)
     * @param outNorm3D destination array for normalized points [X0_norm, Y0_norm, Z0_norm, ...] (length >= 3*n)
     * @param outStats destination array of length >= 4 for normalization statistics:
     *                 [0] = centroid X (mu_X),
     *                 [1] = centroid Y (mu_Y),
     *                 [2] = centroid Z (mu_Z),
     *                 [3] = scale factor (s3D)
     */
    public static void normalize3D(double[] pts3D, int n, double[] outNorm3D, double[] outStats) {
        if (n <= 0) {
            outStats[0] = 0;
            outStats[1] = 0;
            outStats[2] = 0;
            outStats[3] = 1.0;
            return;
        }

        double sumX = 0.0;
        double sumY = 0.0;
        double sumZ = 0.0;
        for (int i = 0; i < n; i++) {
            sumX += pts3D[3 * i];
            sumY += pts3D[3 * i + 1];
            sumZ += pts3D[3 * i + 2];
        }
        double muX = sumX / n;
        double muY = sumY / n;
        double muZ = sumZ / n;

        double sumDist = 0.0;
        for (int i = 0; i < n; i++) {
            double dx = pts3D[3 * i] - muX;
            double dy = pts3D[3 * i + 1] - muY;
            double dz = pts3D[3 * i + 2] - muZ;
            sumDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        double meanDist = sumDist / n;
        double s3D = meanDist > 1e-12 ? Math.sqrt(3.0) / meanDist : 1.0;

        for (int i = 0; i < n; i++) {
            outNorm3D[3 * i] = s3D * (pts3D[3 * i] - muX);
            outNorm3D[3 * i + 1] = s3D * (pts3D[3 * i + 1] - muY);
            outNorm3D[3 * i + 2] = s3D * (pts3D[3 * i + 2] - muZ);
        }

        outStats[0] = muX;
        outStats[1] = muY;
        outStats[2] = muZ;
        outStats[3] = s3D;
    }

    /**
     * Performs exact analytical denormalization of a normalized 3x4 projection matrix P_tilde:
     * <pre>
     *   P = T_2D^(-1) * P_tilde * U_3D
     * </pre>
     *
     * <p>Where 2D inverse transformation matrix:
     * <pre>
     *   T_2D^(-1) = [ 1/s2D,     0, mu_u ]
     *               [     0, 1/s2D, mu_v ]
     *               [     0,     0,    1 ]
     * </pre>
     *
     * <p>And 3D forward transformation matrix:
     * <pre>
     *   U_3D = [ s3D,   0,   0, -s3D * mu_X ]
     *          [   0, s3D,   0, -s3D * mu_Y ]
     *          [   0,   0, s3D, -s3D * mu_Z ]
     *          [   0,   0,   0,           1 ]
     * </pre>
     *
     * @param pTilde12 flat 12-element normalized projection matrix (row-major 3x4)
     * @param stats2D [mu_u, mu_v, s2D]
     * @param stats3D [mu_X, mu_Y, mu_Z, s3D]
     * @param outDlt11 destination DLT11 object receiving the 11 denormalized parameters (L1 to L11)
     */
    public static void denormalizeDLT(double[] pTilde12, double[] stats2D, double[] stats3D, DLT11 outDlt11) {
        double muU = stats2D[0];
        double muV = stats2D[1];
        double s2D = stats2D[2];
        double invS2 = 1.0 / s2D;

        double muX = stats3D[0];
        double muY = stats3D[1];
        double muZ = stats3D[2];
        double s3D = stats3D[3];

        // 1. Compute M_temp = T_2D^(-1) * P_tilde (3x4)
        // Row 0 of M_temp: invS2 * row0(P_tilde) + muU * row2(P_tilde)
        // Row 1 of M_temp: invS2 * row1(P_tilde) + muV * row2(P_tilde)
        // Row 2 of M_temp: row2(P_tilde)
        double m00 = invS2 * pTilde12[0] + muU * pTilde12[8];
        double m01 = invS2 * pTilde12[1] + muU * pTilde12[9];
        double m02 = invS2 * pTilde12[2] + muU * pTilde12[10];
        double m03 = invS2 * pTilde12[3] + muU * pTilde12[11];

        double m10 = invS2 * pTilde12[4] + muV * pTilde12[8];
        double m11 = invS2 * pTilde12[5] + muV * pTilde12[9];
        double m12 = invS2 * pTilde12[6] + muV * pTilde12[10];
        double m13 = invS2 * pTilde12[7] + muV * pTilde12[11];

        double m20 = pTilde12[8];
        double m21 = pTilde12[9];
        double m22 = pTilde12[10];
        double m23 = pTilde12[11];

        // 2. Compute P = M_temp * U_3D (3x4)
        // Col 0: s3D * Col0(M_temp)
        // Col 1: s3D * Col1(M_temp)
        // Col 2: s3D * Col2(M_temp)
        // Col 3: -s3D*muX * Col0 + -s3D*muY * Col1 + -s3D*muZ * Col2 + Col3
        double p00 = m00 * s3D;
        double p01 = m01 * s3D;
        double p02 = m02 * s3D;
        double p03 = m00 * (-s3D * muX) + m01 * (-s3D * muY) + m02 * (-s3D * muZ) + m03;

        double p10 = m10 * s3D;
        double p11 = m11 * s3D;
        double p12 = m12 * s3D;
        double p13 = m10 * (-s3D * muX) + m11 * (-s3D * muY) + m12 * (-s3D * muZ) + m13;

        double p20 = m20 * s3D;
        double p21 = m21 * s3D;
        double p22 = m22 * s3D;
        double p23 = m20 * (-s3D * muX) + m21 * (-s3D * muY) + m22 * (-s3D * muZ) + m23;

        // 3. Normalize such that P[2,3] = 1.0 (Abdel-Aziz & Karara DLT convention: L12 = 1)
        double scale = Math.abs(p23) > 1e-12 ? p23 : 1.0;
        double invScale = 1.0 / scale;

        outDlt11.l[0] = p00 * invScale;
        outDlt11.l[1] = p01 * invScale;
        outDlt11.l[2] = p02 * invScale;
        outDlt11.l[3] = p03 * invScale;

        outDlt11.l[4] = p10 * invScale;
        outDlt11.l[5] = p11 * invScale;
        outDlt11.l[6] = p12 * invScale;
        outDlt11.l[7] = p13 * invScale;

        outDlt11.l[8] = p20 * invScale;
        outDlt11.l[9] = p21 * invScale;
        outDlt11.l[10] = p22 * invScale;
    }
}
