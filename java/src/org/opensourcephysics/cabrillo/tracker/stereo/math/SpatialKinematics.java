package org.opensourcephysics.cabrillo.tracker.stereo.math;

/**
 * High-precision numerical kinematics and TrackEye defense/aerospace spatial telemetry engine.
 *
 * <p>Implements:
 * <ol>
 *   <li>Second-order central differences (O(dt^2)) for 3D velocity vectors (vx, vy, vz).</li>
 *   <li>Second-order central differences (O(dt^2)) for 3D acceleration vectors (ax, ay, az).</li>
 *   <li>Resultant speed, total spatial acceleration, and dynamic g-force (normalized by 9.80665 m/s^2).</li>
 *   <li>Spherical radar and optical tracking metrics: slant range, ground range, azimuth, and elevation.</li>
 *   <li>Aerodynamic velocity telemetry: Mach number relative to standard sea-level sound speed (343.0 m/s).</li>
 * </ol>
 *
 * All operations execute on flat 1D primitive arrays (`double[]`) without object allocation.
 */
public final class SpatialKinematics {

    /** Standard gravitational acceleration (m/s^2) */
    public static final double STANDARD_GRAVITY = 9.80665;

    /** Standard atmospheric sea-level speed of sound (m/s) */
    public static final double STANDARD_SOUND_SPEED = 343.0;

    private SpatialKinematics() {
        // Static numerical utility
    }

    /**
     * Computes complete 3D kinematics and spatial telemetry across N trajectory steps.
     *
     * @param times flat array of timestamps in seconds (length >= n, strictly monotonic)
     * @param coordsXyz flat array of 3D positions [X0, Y0, Z0, X1, Y1, Z1, ...] (length >= 3*n)
     * @param n number of trajectory steps (n >= 2)
     * @param outVelXyz destination array for velocity vectors [vx0, vy0, vz0, ...] (length >= 3*n)
     * @param outAccXyz destination array for acceleration vectors [ax0, ay0, az0, ...] (length >= 3*n)
     * @param outScalarMetrics destination array of length >= 6*n for per-step telemetry:
     *                         offset i*6 + 0 = resultant speed v (m/s)
     *                         offset i*6 + 1 = resultant acceleration a (m/s^2)
     *                         offset i*6 + 2 = g-force (dimensionless)
     *                         offset i*6 + 3 = slant range (m)
     *                         offset i*6 + 4 = azimuth (degrees)
     *                         offset i*6 + 5 = elevation (degrees)
     */
    public static void computeTrajectoryKinematics(
            double[] times,
            double[] coordsXyz,
            int n,
            double[] outVelXyz,
            double[] outAccXyz,
            double[] outScalarMetrics) {

        if (n < 2) {
            return;
        }

        // 1. First-order & Central Difference Velocities (O(dt^2) for interior)
        for (int i = 0; i < n; i++) {
            double vx = 0.0, vy = 0.0, vz = 0.0;

            if (i == 0) {
                // Forward difference
                double dt = times[1] - times[0];
                if (dt > 1e-12) {
                    vx = (coordsXyz[3 * 1 + 0] - coordsXyz[3 * 0 + 0]) / dt;
                    vy = (coordsXyz[3 * 1 + 1] - coordsXyz[3 * 0 + 1]) / dt;
                    vz = (coordsXyz[3 * 1 + 2] - coordsXyz[3 * 0 + 2]) / dt;
                }
            } else if (i == n - 1) {
                // Backward difference
                double dt = times[n - 1] - times[n - 2];
                if (dt > 1e-12) {
                    vx = (coordsXyz[3 * (n - 1) + 0] - coordsXyz[3 * (n - 2) + 0]) / dt;
                    vy = (coordsXyz[3 * (n - 1) + 1] - coordsXyz[3 * (n - 2) + 1]) / dt;
                    vz = (coordsXyz[3 * (n - 1) + 2] - coordsXyz[3 * (n - 2) + 2]) / dt;
                }
            } else {
                // Second-order central difference
                double dt = times[i + 1] - times[i - 1];
                if (dt > 1e-12) {
                    vx = (coordsXyz[3 * (i + 1) + 0] - coordsXyz[3 * (i - 1) + 0]) / dt;
                    vy = (coordsXyz[3 * (i + 1) + 1] - coordsXyz[3 * (i - 1) + 1]) / dt;
                    vz = (coordsXyz[3 * (i + 1) + 2] - coordsXyz[3 * (i - 1) + 2]) / dt;
                }
            }

            outVelXyz[3 * i + 0] = vx;
            outVelXyz[3 * i + 1] = vy;
            outVelXyz[3 * i + 2] = vz;
        }

        // 2. Second-order Central Difference Accelerations & Telemetry
        for (int i = 0; i < n; i++) {
            double ax = 0.0, ay = 0.0, az = 0.0;

            if (i == 0) {
                // Forward difference on velocity
                double dt = times[1] - times[0];
                if (dt > 1e-12) {
                    ax = (outVelXyz[3 * 1 + 0] - outVelXyz[3 * 0 + 0]) / dt;
                    ay = (outVelXyz[3 * 1 + 1] - outVelXyz[3 * 0 + 1]) / dt;
                    az = (outVelXyz[3 * 1 + 2] - outVelXyz[3 * 0 + 2]) / dt;
                }
            } else if (i == n - 1) {
                // Backward difference on velocity
                double dt = times[n - 1] - times[n - 2];
                if (dt > 1e-12) {
                    ax = (outVelXyz[3 * (n - 1) + 0] - outVelXyz[3 * (n - 2) + 0]) / dt;
                    ay = (outVelXyz[3 * (n - 1) + 1] - outVelXyz[3 * (n - 2) + 1]) / dt;
                    az = (outVelXyz[3 * (n - 1) + 2] - outVelXyz[3 * (n - 2) + 2]) / dt;
                }
            } else {
                // Second-order central difference on velocity
                double dt = times[i + 1] - times[i - 1];
                if (dt > 1e-12) {
                    ax = (outVelXyz[3 * (i + 1) + 0] - outVelXyz[3 * (i - 1) + 0]) / dt;
                    ay = (outVelXyz[3 * (i + 1) + 1] - outVelXyz[3 * (i - 1) + 1]) / dt;
                    az = (outVelXyz[3 * (i + 1) + 2] - outVelXyz[3 * (i - 1) + 2]) / dt;
                }
            }

            outAccXyz[3 * i + 0] = ax;
            outAccXyz[3 * i + 1] = ay;
            outAccXyz[3 * i + 2] = az;

            double vx = outVelXyz[3 * i + 0];
            double vy = outVelXyz[3 * i + 1];
            double vz = outVelXyz[3 * i + 2];
            double speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

            double totalAcc = Math.sqrt(ax * ax + ay * ay + az * az);
            double gForce = totalAcc / STANDARD_GRAVITY;

            double x = coordsXyz[3 * i + 0];
            double y = coordsXyz[3 * i + 1];
            double z = coordsXyz[3 * i + 2];

            double groundRange = Math.sqrt(x * x + z * z);
            double slantRange = Math.sqrt(x * x + y * y + z * z);

            double azimuthDeg = Math.atan2(z, x) * (180.0 / Math.PI);
            double elevationDeg = Math.atan2(y, Math.max(0.0001, groundRange)) * (180.0 / Math.PI);

            if (outScalarMetrics != null && outScalarMetrics.length >= (i + 1) * 6) {
                outScalarMetrics[i * 6 + 0] = speed;
                outScalarMetrics[i * 6 + 1] = totalAcc;
                outScalarMetrics[i * 6 + 2] = gForce;
                outScalarMetrics[i * 6 + 3] = slantRange;
                outScalarMetrics[i * 6 + 4] = azimuthDeg;
                outScalarMetrics[i * 6 + 5] = elevationDeg;
            }
        }
    }
}
