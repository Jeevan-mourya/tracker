package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * Reusable, stateful scratchpad for zero-allocation 11-parameter DLT camera calibration.
 *
 * <p>Pre-allocates all matrices, work vectors, and spectral decomposition scratchpads
 * to avoid dynamic heap allocation during calibration sweeps.
 */
public final class CalibrationContext {

    public static final int DEFAULT_MAX_POINTS = 128;

    public int maxPoints;

    public double[] pts3D;
    public double[] pts2D;
    public double[] norm3D;
    public double[] norm2D;

    public final double[] stats3D = new double[4]; // [muX, muY, muZ, s3D]
    public final double[] stats2D = new double[3]; // [muU, muV, s2D]

    public double[] designA;
    public double[] workQR_A;
    public double[] workQR_V;

    public final double[] R12x12 = new double[144];
    public final double[] workW = new double[144];
    public final double[] workV = new double[144];
    public final double[] sortedV = new double[144];
    public final double[] singularValues = new double[12];
    public final double[] spectralMetrics = new double[3]; // [kappaNonNull, nullSpaceSeparation, fullCondition]

    public final double[] pTilde12 = new double[12];
    public double[] residuals;

    public CalibrationContext() {
        this(DEFAULT_MAX_POINTS);
    }

    public CalibrationContext(int maxPoints) {
        ensureCapacity(maxPoints);
    }

    /**
     * Ensures internal flat buffer capacity for at least the specified number of control points.
     *
     * @param points required control point capacity
     */
    public void ensureCapacity(int points) {
        if (points <= maxPoints && pts3D != null) {
            return;
        }
        int capacity = Math.max(points, DEFAULT_MAX_POINTS);
        this.maxPoints = capacity;

        this.pts3D = new double[3 * capacity];
        this.pts2D = new double[2 * capacity];
        this.norm3D = new double[3 * capacity];
        this.norm2D = new double[2 * capacity];

        int rows = 2 * capacity;
        this.designA = new double[rows * 12];
        this.workQR_A = new double[rows * 12];
        this.workQR_V = new double[rows];
        this.residuals = new double[capacity];
    }
}
