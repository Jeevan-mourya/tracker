package org.opensourcephysics.cabrillo.tracker.stereo.integration;

import java.awt.Color;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLT11;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DualViewTriangulator;
import org.opensourcephysics.cabrillo.tracker.stereo.math.SpatialKinematics;
import org.opensourcephysics.cabrillo.tracker.stereo.math.TriangulationContext;
import org.opensourcephysics.cabrillo.tracker.stereo.ui.StereoTrackPoint;
import org.opensourcephysics.cabrillo.tracker.stereo.ui.TacticalTheme;

/**
 * Native Open Source Physics (OSP) Tracker Track Model Extension for 3D Stereoscopic Tracking.
 *
 * <p>Extends OSP Tracker's single-camera {@code PointMass} paradigm by tracking synchronized dual
 * image observations (u1, v1) and (u2, v2), maintaining reconstructed metric world coordinates
 * (X, Y, Z), and continuous second-order kinematics (V, a, G-force, Mach).
 *
 * <p>Dispatches event notifications to registered OSP views (e.g., TrackerPanel, DataTable, PlotView).
 */
public final class StereoPointTrack {

    public interface TrackChangeListener {
        void onPointChanged(StereoPointTrack track, int frame);
        void onTrackRecalculated(StereoPointTrack track);
    }

    private String name = "mass A";
    private Color trackColor = TacticalTheme.TRAJECTORY_RIBBON;
    private double mass = 1.0; // kg
    private boolean visible = true;
    private boolean locked = false;

    private final List<StereoTrackPoint> points = new ArrayList<>();
    private final List<TrackChangeListener> listeners = new ArrayList<>();

    // Zero-allocation persistent numerical context
    private final TriangulationContext triCtx = new TriangulationContext();
    private final double[] triXyz = new double[3];
    private final double[] triMetrics = new double[5];

    public StereoPointTrack() {
    }

    public StereoPointTrack(String name, Color color) {
        this.name = name;
        this.trackColor = color;
    }

    public void addListener(TrackChangeListener listener) {
        if (listener != null && !listeners.contains(listener)) {
            listeners.add(listener);
        }
    }

    public void removeListener(TrackChangeListener listener) {
        listeners.remove(listener);
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Color getColor() { return trackColor; }
    public void setColor(Color color) { this.trackColor = color; }

    public double getMass() { return mass; }
    public void setMass(double mass) { this.mass = mass; }

    public boolean isVisible() { return visible; }
    public void setVisible(boolean visible) { this.visible = visible; }

    public boolean isLocked() { return locked; }
    public void setLocked(boolean locked) { this.locked = locked; }

    public synchronized List<StereoTrackPoint> getPoints() {
        return Collections.unmodifiableList(points);
    }

    public synchronized StereoTrackPoint getPoint(int frame) {
        for (StereoTrackPoint pt : points) {
            if (pt.frame == frame) return pt;
        }
        return null;
    }

    public synchronized StereoTrackPoint getOrCreatePoint(int frame, double time) {
        for (StereoTrackPoint pt : points) {
            if (pt.frame == frame) {
                pt.time = time;
                return pt;
            }
        }
        StereoTrackPoint newPt = new StereoTrackPoint(frame, time);
        points.add(newPt);
        points.sort((a, b) -> Integer.compare(a.frame, b.frame));
        return newPt;
    }

    /**
     * Records or updates a 2D optical observation for a specific camera view.
     * If both camera observations exist for the frame, automatically executes
     * zero-allocation Householder QR triangulation.
     *
     * @param cameraIndex 1 for Camera 1, 2 for Camera 2
     * @param frame frame index
     * @param time elapsed time in seconds
     * @param u pixel coordinate u
     * @param v pixel coordinate v
     * @param dlt1 Camera 1 calibrated DLT
     * @param dlt2 Camera 2 calibrated DLT
     */
    public synchronized void recordObservation(
            int cameraIndex, int frame, double time,
            double u, double v,
            DLT11 dlt1, DLT11 dlt2) {

        if (locked) return;

        StereoTrackPoint pt = getOrCreatePoint(frame, time);
        if (cameraIndex == 1) {
            pt.setCam1(u, v);
        } else {
            pt.setCam2(u, v);
        }

        if (pt.hasCam1 && pt.hasCam2 && dlt1 != null && dlt2 != null) {
            DualViewTriangulator.TriangulationStatus status = DualViewTriangulator.triangulate(
                    pt.u1, pt.v1, dlt1,
                    pt.u2, pt.v2, dlt2,
                    1.5, 50.0,
                    triCtx, triXyz, triMetrics);

            if (status == DualViewTriangulator.TriangulationStatus.CONVERGED ||
                status == DualViewTriangulator.TriangulationStatus.LOW_RAY_ANGLE_WARNING) {
                pt.x = triXyz[0];
                pt.y = triXyz[1];
                pt.z = triXyz[2];
                pt.has3D = true;
                pt.combinedResidualPx = triMetrics[0];
                pt.rayAngleDeg = triMetrics[3];
                pt.conditionEstimate = triMetrics[4];
                pt.gateStatus = (status == DualViewTriangulator.TriangulationStatus.CONVERGED) ? "VALID" : "LOW_RAY_ANGLE";
            } else {
                pt.clear3D();
                pt.gateStatus = "REJECTED";
            }
        }

        recomputeKinematics();

        for (TrackChangeListener l : listeners) {
            l.onPointChanged(this, frame);
        }
    }

    /**
     * Recomputes O(dt^2) central difference velocities and accelerations across all points.
     */
    public synchronized void recomputeKinematics() {
        int n = points.size();
        if (n < 2) return;

        double[] times = new double[n];
        double[] coordsXyz = new double[3 * n];
        double[] velXyz = new double[3 * n];
        double[] accXyz = new double[3 * n];
        double[] scalarMetrics = new double[6 * n];

        for (int i = 0; i < n; i++) {
            StereoTrackPoint p = points.get(i);
            times[i] = p.time;
            coordsXyz[3 * i + 0] = p.x;
            coordsXyz[3 * i + 1] = p.y;
            coordsXyz[3 * i + 2] = p.z;
        }

        SpatialKinematics.computeTrajectoryKinematics(times, coordsXyz, n, velXyz, accXyz, scalarMetrics);

        for (int i = 0; i < n; i++) {
            StereoTrackPoint p = points.get(i);
            if (p.has3D) {
                p.vx = velXyz[3 * i + 0];
                p.vy = velXyz[3 * i + 1];
                p.vz = velXyz[3 * i + 2];
                p.speed = scalarMetrics[i * 6 + 0];

                p.ax = accXyz[3 * i + 0];
                p.ay = accXyz[3 * i + 1];
                p.az = accXyz[3 * i + 2];
                p.accel = scalarMetrics[i * 6 + 1];
                p.gForce = scalarMetrics[i * 6 + 2];

                p.slantRange = scalarMetrics[i * 6 + 3];
                p.azimuthDeg = scalarMetrics[i * 6 + 4];
                p.elevationDeg = scalarMetrics[i * 6 + 5];
                p.machNumber = p.speed / SpatialKinematics.STANDARD_SOUND_SPEED;
            }
        }

        for (TrackChangeListener l : listeners) {
            l.onTrackRecalculated(this);
        }
    }

    public synchronized void clear() {
        points.clear();
        for (TrackChangeListener l : listeners) {
            l.onTrackRecalculated(this);
        }
    }
}
