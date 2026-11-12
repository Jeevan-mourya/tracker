package org.opensourcephysics.cabrillo.tracker.stereo.ui;

/**
 * Data carrier for a single synchronized stereoscopic trajectory observation step.
 *
 * <p>Stores matched 2D observations from Camera 1 and Camera 2, reconstructed 3D coordinates,
 * kinematics, and optical quality gates.
 */
public final class StereoTrackPoint {

    public int frame;
    public double time;

    // 2D Observations
    public double u1;
    public double v1;
    public boolean hasCam1;

    public double u2;
    public double v2;
    public boolean hasCam2;

    // 3D Reconstructed World Coordinates (in meters)
    public double x;
    public double y;
    public double z;
    public boolean has3D;

    // Kinematics
    public double vx;
    public double vy;
    public double vz;
    public double speed;

    public double ax;
    public double ay;
    public double az;
    public double accel;
    public double gForce;

    // Telemetry
    public double slantRange;
    public double groundRange;
    public double azimuthDeg;
    public double elevationDeg;
    public double machNumber;

    // Quality Gates
    public double rayAngleDeg;
    public double combinedResidualPx;
    public double conditionEstimate;
    public String gateStatus = "UNRESOLVED";

    public StereoTrackPoint(int frame, double time) {
        this.frame = frame;
        this.time = time;
    }

    public void setCam1(double u, double v) {
        this.u1 = u;
        this.v1 = v;
        this.hasCam1 = true;
    }

    public void setCam2(double u, double v) {
        this.u2 = u;
        this.v2 = v;
        this.hasCam2 = true;
    }

    public void clear3D() {
        this.has3D = false;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.gateStatus = "UNRESOLVED";
    }
}
