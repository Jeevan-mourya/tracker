package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * Encapsulates the 11 projective parameters of the Direct Linear Transformation (DLT)
 * for a monocular or stereoscopic camera view (Abdel-Aziz & Karara model).
 *
 * <p>Mapping from 3D world (X, Y, Z) to 2D image pixel (u, v):
 * <pre>
 *        L1*X + L2*Y + L3*Z + L4
 *   u = --------------------------
 *        L9*X + L10*Y + L11*Z + 1
 *
 *        L5*X + L6*Y + L7*Z + L8
 *   v = --------------------------
 *        L9*X + L10*Y + L11*Z + 1
 * </pre>
 *
 * All operations use flat arrays and avoid per-frame allocations.
 */
public final class DLT11 {
    /** The 11 parameters L1 through L11 */
    public final double[] l = new double[11];

    public DLT11() {
    }

    public DLT11(double[] params) {
        if (params == null || params.length < 11) {
            throw new IllegalArgumentException("DLT11 requires an array of at least 11 parameters.");
        }
        System.arraycopy(params, 0, this.l, 0, 11);
    }

    public void set(double[] params) {
        System.arraycopy(params, 0, this.l, 0, 11);
    }

    public void copyFrom(DLT11 other) {
        System.arraycopy(other.l, 0, this.l, 0, 11);
    }

    /**
     * Projects a 3D point (x, y, z) to 2D pixel coordinates (u, v).
     *
     * @param x world X in meters
     * @param y world Y in meters
     * @param z world Z in meters
     * @param outUv 2-element destination array [u, v]
     */
    public void project(double x, double y, double z, double[] outUv) {
        double denom = l[8] * x + l[9] * y + l[10] * z + 1.0;
        double safeDenom = Math.abs(denom) < 1e-12 ? (denom >= 0 ? 1e-12 : -1e-12) : denom;
        outUv[0] = (l[0] * x + l[1] * y + l[2] * z + l[3]) / safeDenom;
        outUv[1] = (l[4] * x + l[5] * y + l[6] * z + l[7]) / safeDenom;
    }
}
