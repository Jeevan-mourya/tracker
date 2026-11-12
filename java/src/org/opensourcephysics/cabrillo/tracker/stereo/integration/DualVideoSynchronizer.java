package org.opensourcephysics.cabrillo.tracker.stereo.integration;

import java.util.List;
import org.opensourcephysics.cabrillo.tracker.stereo.ui.StereoTrackPoint;

/**
 * Multi-Camera Timebase Synchronizer and Sub-Frame Temporal Interpolation Engine.
 *
 * <p>Coordinates dual camera streams with differing native frame rates
 * (e.g., 10,000 FPS primary vs. 5,000 FPS secondary, or mismatched exposure clocks).
 *
 * <p>Features:
 * <ul>
 *   <li>Master timebase synchronization with millisecond/microsecond precision time offsets.</li>
 *   <li>Dual frame index mapping (time -> frame1, frame2).</li>
 *   <li>Catmull-Rom / Cubic Hermite sub-frame interpolation for asynchronous 2D tracks.</li>
 *   <li>Zero-allocation evaluation using destination buffers.</li>
 * </ul>
 */
public final class DualVideoSynchronizer {

    private double fpsCam1 = 60.0;
    private double fpsCam2 = 60.0;
    private double timeOffsetCam2 = 0.0; // seconds

    public DualVideoSynchronizer() {
    }

    public DualVideoSynchronizer(double fpsCam1, double fpsCam2, double timeOffsetCam2) {
        this.fpsCam1 = Math.max(1.0, fpsCam1);
        this.fpsCam2 = Math.max(1.0, fpsCam2);
        this.timeOffsetCam2 = timeOffsetCam2;
    }

    public double getFpsCam1() { return fpsCam1; }
    public void setFpsCam1(double fps) { this.fpsCam1 = Math.max(1.0, fps); }

    public double getFpsCam2() { return fpsCam2; }
    public void setFpsCam2(double fps) { this.fpsCam2 = Math.max(1.0, fps); }

    public double getTimeOffsetCam2() { return timeOffsetCam2; }
    public void setTimeOffsetCam2(double offsetSec) { this.timeOffsetCam2 = offsetSec; }

    /**
     * Converts a Camera 1 frame index to physical elapsed time in seconds.
     */
    public double frameToTimeCam1(int frame) {
        return frame / fpsCam1;
    }

    /**
     * Converts physical elapsed time to nearest integer Camera 1 frame index.
     */
    public int timeToFrameCam1(double timeSec) {
        return (int) Math.max(0, Math.round(timeSec * fpsCam1));
    }

    /**
     * Converts physical elapsed time to nearest integer Camera 2 frame index.
     */
    public int timeToFrameCam2(double timeSec) {
        double effectiveTime = timeSec - timeOffsetCam2;
        return (int) Math.max(0, Math.round(effectiveTime * fpsCam2));
    }

    /**
     * Computes the frame rate ratio description (e.g. "2:1", "1:1 (Synchronous)").
     */
    public String getFrameRatioDescription() {
        double ratio = fpsCam1 / fpsCam2;
        if (Math.abs(ratio - 1.0) < 1e-4) {
            return "1:1 (Synchronous)";
        }
        boolean isInteger = Math.abs(ratio - Math.round(ratio)) < 1e-4;
        if (isInteger) {
            return String.format("%d:1", Math.round(ratio));
        }
        double invRatio = fpsCam2 / fpsCam1;
        boolean isInvInteger = Math.abs(invRatio - Math.round(invRatio)) < 1e-4;
        if (isInvInteger) {
            return String.format("1:%d", Math.round(invRatio));
        }
        return String.format("%.2f:1", ratio);
    }

    /**
     * Performs Catmull-Rom / Cubic Hermite sub-frame temporal interpolation of 2D pixel
     * coordinates from discrete Camera 2 observation points.
     *
     * @param points list of sorted trajectory observation points
     * @param targetTime desired physical time in seconds
     * @param outUv destination array of length >= 2 for interpolated [u, v]
     * @return true if cleanly interpolated, false if insufficient samples
     */
    public boolean interpolateCamera2Observation(
            List<StereoTrackPoint> points,
            double targetTime,
            double[] outUv) {

        if (points == null || points.isEmpty()) {
            return false;
        }

        // Filter valid Camera 2 samples
        int n = 0;
        for (StereoTrackPoint p : points) {
            if (p.hasCam2) n++;
        }
        if (n == 0) return false;

        // Exact match check (microsecond tolerance)
        for (StereoTrackPoint p : points) {
            if (p.hasCam2 && Math.abs(p.time - targetTime) <= 1e-6) {
                outUv[0] = p.u2;
                outUv[1] = p.v2;
                return true;
            }
        }

        if (n == 1) {
            for (StereoTrackPoint p : points) {
                if (p.hasCam2) {
                    outUv[0] = p.u2;
                    outUv[1] = p.v2;
                    return true;
                }
            }
        }

        // Bracket targetTime between p0 and p1
        StereoTrackPoint p0 = null;
        StereoTrackPoint p1 = null;
        StereoTrackPoint pPrev = null;
        StereoTrackPoint pNext = null;

        StereoTrackPoint lastValid = null;
        for (int i = 0; i < points.size(); i++) {
            StereoTrackPoint pt = points.get(i);
            if (!pt.hasCam2) continue;

            if (pt.time <= targetTime) {
                pPrev = p0;
                p0 = pt;
            } else if (p1 == null) {
                p1 = pt;
            } else if (pNext == null) {
                pNext = pt;
                break;
            }
            lastValid = pt;
        }

        if (p0 == null && p1 != null) {
            // Before first sample
            outUv[0] = p1.u2;
            outUv[1] = p1.v2;
            return true;
        }
        if (p1 == null && p0 != null) {
            // After last sample
            outUv[0] = p0.u2;
            outUv[1] = p0.v2;
            return true;
        }
        if (p0 == null || p1 == null) {
            return false;
        }

        double dt = p1.time - p0.time;
        if (dt <= 1e-12) {
            outUv[0] = p0.u2;
            outUv[1] = p0.v2;
            return true;
        }

        // Catmull-Rom Tangents
        if (pPrev == null) pPrev = p0;
        if (pNext == null) pNext = p1;

        double dt0 = (p1.time - pPrev.time);
        double dt1 = (pNext.time - p0.time);

        double m0u = dt0 > 1e-12 ? (p1.u2 - pPrev.u2) / dt0 : (p1.u2 - p0.u2) / dt;
        double m0v = dt0 > 1e-12 ? (p1.v2 - pPrev.v2) / dt0 : (p1.v2 - p0.v2) / dt;

        double m1u = dt1 > 1e-12 ? (pNext.u2 - p0.u2) / dt1 : (p1.u2 - p0.u2) / dt;
        double m1v = dt1 > 1e-12 ? (pNext.v2 - p0.v2) / dt1 : (p1.v2 - p0.v2) / dt;

        // Cubic Hermite basis functions
        double u = (targetTime - p0.time) / dt;
        double u2 = u * u;
        double u3 = u2 * u;

        double h00 = 2.0 * u3 - 3.0 * u2 + 1.0;
        double h10 = u3 - 2.0 * u2 + u;
        double h01 = -2.0 * u3 + 3.0 * u2;
        double h11 = u3 - u2;

        outUv[0] = h00 * p0.u2 + h10 * dt * m0u + h01 * p1.u2 + h11 * dt * m1u;
        outUv[1] = h00 * p0.v2 + h10 * dt * m0v + h01 * p1.v2 + h11 * dt * m1v;
        return true;
    }
}
