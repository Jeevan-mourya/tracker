package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * Reusable, stateful scratchpad for zero-allocation stereoscopic triangulation.
 *
 * <p>All working buffers, Householder reflection vectors, and projection intermediates
 * are pre-allocated in this context to eliminate garbage collection overhead during
 * continuous high-speed video playback.
 */
public final class TriangulationContext {

    /** 4x3 design matrix A (flat row-major: index = r * 3 + c, length 12) */
    public final double[] A = new double[12];

    /** 4x1 right-hand side vector B */
    public final double[] B = new double[4];

    /** 4x3 working copy of R during Householder QR factorization */
    public final double[] R = new double[12];

    /** 4x1 transformed right-hand side Q^T * B */
    public final double[] QtB = new double[4];

    /** 4-element Householder elementary reflection vector v */
    public final double[] v = new double[4];

    /** Camera 1 optical center (X, Y, Z) */
    public final double[] center1 = new double[3];

    /** Camera 2 optical center (X, Y, Z) */
    public final double[] center2 = new double[3];

    /** Reusable 2D reprojection scratchpad [u, v] */
    public final double[] reprojUv = new double[2];

    /** Reusable 3x3 Cramer solver matrix (flat 9 elements) */
    public final double[] M3x3 = new double[9];

    /** Reusable 3x1 Cramer solver rhs */
    public final double[] rhs3 = new double[3];

    public TriangulationContext() {
    }

    /**
     * Resets working buffers to zero.
     */
    public void reset() {
        for (int i = 0; i < 12; i++) {
            A[i] = 0.0;
            R[i] = 0.0;
        }
        for (int i = 0; i < 4; i++) {
            B[i] = 0.0;
            QtB[i] = 0.0;
            v[i] = 0.0;
        }
    }
}
