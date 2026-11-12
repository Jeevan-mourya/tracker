package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * High-performance, zero-allocation implementation of the Brown–Conrady lens distortion model.
 *
 * <p>Supports:
 * <ul>
 *   <li>Radial distortion parameters: k1 (r^2), k2 (r^4), k3 (r^6)</li>
 *   <li>Tangential (decentering) distortion parameters: p1, p2</li>
 * </ul>
 *
 * Coordinates are normalized by a nominal scale factor (standard default: 1000.0 pixels)
 * relative to the optical principal point (u0, v0).
 *
 * <p>Includes guarded iterative fixed-point inversion with a 25-iteration cutoff and
 * divergence containment (r > 2.5 guard).
 */
public final class BrownConradyDistortion {

    /** Default pixel normalization scale */
    public static final double DEFAULT_SCALE = 1000.0;

    /** Maximum iterations for fixed-point inversion */
    public static final int MAX_ITERATIONS = 25;

    /** Convergence tolerance in pixels */
    public static final double TOLERANCE_PX = 1e-5;

    /** Maximum normalized radius before divergence guard activates */
    public static final double MAX_NORMALIZED_RADIUS = 2.5;

    private BrownConradyDistortion() {
        // Static numerical utility
    }

    /**
     * Applies forward Brown-Conrady distortion to map an undistorted point (u, v)
     * to a distorted observation point (ud, vd).
     *
     * @param u undistorted pixel coordinate u
     * @param v undistorted pixel coordinate v
     * @param u0 principal point u (e.g. imageWidth / 2)
     * @param v0 principal point v (e.g. imageHeight / 2)
     * @param k1 radial coefficient 1
     * @param k2 radial coefficient 2
     * @param k3 radial coefficient 3
     * @param p1 tangential coefficient 1
     * @param p2 tangential coefficient 2
     * @param scale normalization scale (e.g. 1000.0)
     * @param outUv destination array of length >= 2 for [ud, vd]
     */
    public static void apply(
            double u, double v,
            double u0, double v0,
            double k1, double k2, double k3,
            double p1, double p2,
            double scale,
            double[] outUv) {

        if (k1 == 0.0 && k2 == 0.0 && k3 == 0.0 && p1 == 0.0 && p2 == 0.0) {
            outUv[0] = u;
            outUv[1] = v;
            return;
        }

        double invScale = 1.0 / (scale > 1e-12 ? scale : DEFAULT_SCALE);
        double x = (u - u0) * invScale;
        double y = (v - v0) * invScale;

        double r2 = x * x + y * y;
        double r4 = r2 * r2;
        double r6 = r4 * r2;

        double radialFactor = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;
        double dxTan = 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
        double dyTan = p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;

        double xd = x * radialFactor + dxTan;
        double yd = y * radialFactor + dyTan;

        outUv[0] = u0 + xd * scale;
        outUv[1] = v0 + yd * scale;
    }

    /**
     * Undistorts a distorted pixel observation (ud, vd) via guarded fixed-point iteration.
     *
     * @param ud observed distorted pixel u
     * @param vd observed distorted pixel v
     * @param u0 principal point u
     * @param v0 principal point v
     * @param k1 radial coefficient 1
     * @param k2 radial coefficient 2
     * @param k3 radial coefficient 3
     * @param p1 tangential coefficient 1
     * @param p2 tangential coefficient 2
     * @param scale normalization scale
     * @param outUv destination array of length >= 2 for undistorted [u, v]
     * @param outDiagnostics optional destination array of length >= 3 for diagnostics:
     *                       [0] = iterations performed,
     *                       [1] = final residual in pixels,
     *                       [2] = 1.0 if converged, 0.0 if max iterations, -1.0 if diverged/guarded
     * @return true if cleanly converged within tolerance, false otherwise
     */
    public static boolean undistort(
            double ud, double vd,
            double u0, double v0,
            double k1, double k2, double k3,
            double p1, double p2,
            double scale,
            double[] outUv,
            double[] outDiagnostics) {

        if (!Double.isFinite(ud) || !Double.isFinite(vd)) {
            outUv[0] = Double.NaN;
            outUv[1] = Double.NaN;
            if (outDiagnostics != null && outDiagnostics.length >= 3) {
                outDiagnostics[0] = 0;
                outDiagnostics[1] = Double.NaN;
                outDiagnostics[2] = -1.0;
            }
            return false;
        }

        if (k1 == 0.0 && k2 == 0.0 && k3 == 0.0 && p1 == 0.0 && p2 == 0.0) {
            outUv[0] = ud;
            outUv[1] = vd;
            if (outDiagnostics != null && outDiagnostics.length >= 3) {
                outDiagnostics[0] = 0;
                outDiagnostics[1] = 0.0;
                outDiagnostics[2] = 1.0;
            }
            return true;
        }

        double invScale = 1.0 / (scale > 1e-12 ? scale : DEFAULT_SCALE);
        double xd = (ud - u0) * invScale;
        double yd = (vd - v0) * invScale;

        // Divergence guard: check if initial normalized radius exceeds stability bound
        double initR = Math.sqrt(xd * xd + yd * yd);
        if (initR > MAX_NORMALIZED_RADIUS) {
            outUv[0] = ud;
            outUv[1] = vd;
            if (outDiagnostics != null && outDiagnostics.length >= 3) {
                outDiagnostics[0] = 0;
                outDiagnostics[1] = initR * scale;
                outDiagnostics[2] = -1.0;
            }
            return false;
        }

        double x = xd;
        double y = yd;
        int iter = 0;
        double stepPx = Double.POSITIVE_INFINITY;
        boolean converged = false;
        boolean diverged = false;

        while (iter < MAX_ITERATIONS) {
            iter++;
            double r2 = x * x + y * y;
            if (r2 > MAX_NORMALIZED_RADIUS * MAX_NORMALIZED_RADIUS) {
                diverged = true;
                break;
            }

            double r4 = r2 * r2;
            double r6 = r4 * r2;
            double radialFactor = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;

            if (Math.abs(radialFactor) < 1e-12 || !Double.isFinite(radialFactor)) {
                diverged = true;
                break;
            }

            double dxTan = 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x);
            double dyTan = p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y;

            double xNext = (xd - dxTan) / radialFactor;
            double yNext = (yd - dyTan) / radialFactor;

            double dx = (xNext - x) * scale;
            double dy = (yNext - y) * scale;
            stepPx = Math.sqrt(dx * dx + dy * dy);

            x = xNext;
            y = yNext;

            if (!Double.isFinite(x) || !Double.isFinite(y)) {
                diverged = true;
                break;
            }

            if (stepPx < TOLERANCE_PX) {
                converged = true;
                break;
            }
        }

        outUv[0] = u0 + x * scale;
        outUv[1] = v0 + y * scale;

        if (outDiagnostics != null && outDiagnostics.length >= 3) {
            outDiagnostics[0] = iter;
            outDiagnostics[1] = stepPx;
            outDiagnostics[2] = converged ? 1.0 : (diverged ? -1.0 : 0.0);
        }

        return converged;
    }
}
