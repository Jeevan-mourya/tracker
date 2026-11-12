package org.opensourcephysics.cabrillo.tracker.stereo.ui;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseWheelEvent;
import java.util.List;
import javax.swing.JPanel;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLT11;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DualViewTriangulator;

/**
 * Self-contained 3D Spatial Trajectory Viewport.
 *
 * <p>Renders:
 * <ul>
 *   <li>Tactical dark canvas (#0F172A).</li>
 *   <li>Metric ground reference grid and 3D coordinate axes (+X right, +Y up, +Z forward).</li>
 *   <li>Camera optical centers and viewing pyramids for Camera 1 and Camera 2.</li>
 *   <li>Reconstructed metric trajectory ribbon (#38BDF8), point markers, and velocity vectors (#10B981).</li>
 *   <li>Interactive arc-ball rotation (left drag), translation/pan (right drag), and zoom (wheel).</li>
 * </ul>
 *
 * All 3D-to-2D screen projection calculations use flat scratch arrays to prevent heap allocation.
 */
public final class ThreeDTrajectoryViewport extends JPanel {

    private final StereoWorkstationFrame parentFrame;

    // View angles & camera parameters
    private double pitch = 25.0; // degrees
    private double yaw = -45.0;  // degrees
    private double zoom = 220.0; // pixels per meter
    private double panX = 0.0;
    private double panY = 0.0;

    // Mouse drag tracking
    private int lastMouseX;
    private int lastMouseY;

    // Reusable projection scratchpad [screenX, screenY, depth]
    private final double[] projScratch = new double[3];
    private final double[] camCenter1 = new double[3];
    private final double[] camCenter2 = new double[3];

    public ThreeDTrajectoryViewport(StereoWorkstationFrame parent) {
        this.parentFrame = parent;
        setBackground(TacticalTheme.TACTICAL_CANVAS);
        setBorder(TacticalTheme.BORDER_TACTICAL_PANEL);
        setCursor(Cursor.getPredefinedCursor(Cursor.MOVE_CURSOR));

        MouseAdapter mouseHandler = new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                lastMouseX = e.getX();
                lastMouseY = e.getY();
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                int dx = e.getX() - lastMouseX;
                int dy = e.getY() - lastMouseY;

                if ((e.getModifiersEx() & MouseEvent.BUTTON1_DOWN_MASK) != 0) {
                    // Left-click: Orbit Rotation
                    yaw += dx * 0.5;
                    pitch = Math.max(-85.0, Math.min(85.0, pitch + dy * 0.5));
                } else if ((e.getModifiersEx() & MouseEvent.BUTTON3_DOWN_MASK) != 0) {
                    // Right-click: Pan
                    panX += dx;
                    panY += dy;
                }
                lastMouseX = e.getX();
                lastMouseY = e.getY();
                repaint();
            }

            @Override
            public void mouseWheelMoved(MouseWheelEvent e) {
                double factor = e.getPreciseWheelRotation() < 0 ? 1.15 : 0.85;
                zoom = Math.max(20.0, Math.min(2000.0, zoom * factor));
                repaint();
            }
        };

        addMouseListener(mouseHandler);
        addMouseMotionListener(mouseHandler);
        addMouseWheelListener(mouseHandler);
    }

    /**
     * Projects a 3D world coordinate (X, Y, Z) in meters to 2D screen coordinates (px, py).
     *
     * @param x world X (meters)
     * @param y world Y (meters, +Y up)
     * @param z world Z (meters, +Z forward)
     * @param w viewport width
     * @param h viewport height
     * @param outScreen 3-element output array [screenX, screenY, depth]
     */
    private void projectPoint(double x, double y, double z, int w, int h, double[] outScreen) {
        double radYaw = Math.toRadians(yaw);
        double radPitch = Math.toRadians(pitch);

        double cosY = Math.cos(radYaw);
        double sinY = Math.sin(radYaw);
        double cosP = Math.cos(radPitch);
        double sinP = Math.sin(radPitch);

        // 1. Yaw rotation around Y axis
        double x1 = cosY * x + sinY * z;
        double y1 = y;
        double z1 = -sinY * x + cosY * z;

        // 2. Pitch rotation around X axis
        double x2 = x1;
        double y2 = cosP * y1 - sinP * z1;
        double z2 = sinP * y1 + cosP * z1;

        // 3. Screen projection with camera distance offset (Z + 5.0m)
        double camDist = 5.0;
        double pz = z2 + camDist;
        double safeZ = Math.max(0.2, pz);
        double perspective = (camDist / safeZ) * zoom;

        double sx = (w * 0.5) + panX + (x2 * perspective);
        double sy = (h * 0.5) + panY - (y2 * perspective); // Invert Y for screen (+Y up)

        outScreen[0] = sx;
        outScreen[1] = sy;
        outScreen[2] = z2;
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        int w = getWidth();
        int h = getHeight();

        // 1. Draw Viewport Tactical Banner
        g2.setColor(TacticalTheme.NAVY_PRESSED);
        g2.fillRect(0, 0, w, 24);
        g2.setColor(TacticalTheme.TRAJECTORY_RIBBON);
        g2.setFont(TacticalTheme.FONT_HEADER);
        g2.drawString("3D SPATIAL KINEMATICS & TRAJECTORY VIEWPORT (METRIC)", 8, 17);

        // 2. Draw Metric Ground Reference Grid (-1.0m to +1.0m in X and Z at Y = 0)
        g2.setColor(new Color(30, 45, 75));
        g2.setStroke(new BasicStroke(1.0f));

        double[] pA = new double[3];
        double[] pB = new double[3];

        for (double gx = -1.0; gx <= 1.0; gx += 0.2) {
            projectPoint(gx, 0.0, -1.0, w, h, pA);
            projectPoint(gx, 0.0, 1.0, w, h, pB);
            g2.drawLine((int) pA[0], (int) pA[1], (int) pB[0], (int) pB[1]);
        }
        for (double gz = -1.0; gz <= 1.0; gz += 0.2) {
            projectPoint(-1.0, 0.0, gz, w, h, pA);
            projectPoint(1.0, 0.0, gz, w, h, pB);
            g2.drawLine((int) pA[0], (int) pA[1], (int) pB[0], (int) pB[1]);
        }

        // 3. Draw World Axes at (0, 0, 0)
        projectPoint(0, 0, 0, w, h, pA);
        int ox = (int) pA[0];
        int oy = (int) pA[1];

        // +X Axis (Red)
        projectPoint(0.5, 0, 0, w, h, pB);
        g2.setColor(new Color(239, 68, 68));
        g2.setStroke(new BasicStroke(2.0f));
        g2.drawLine(ox, oy, (int) pB[0], (int) pB[1]);
        g2.drawString("+X (0.5m)", (int) pB[0] + 4, (int) pB[1]);

        // +Y Axis (Green - Up)
        projectPoint(0, 0.5, 0, w, h, pB);
        g2.setColor(new Color(16, 185, 129));
        g2.drawLine(ox, oy, (int) pB[0], (int) pB[1]);
        g2.drawString("+Y (0.5m)", (int) pB[0] + 4, (int) pB[1]);

        // +Z Axis (Blue - Forward)
        projectPoint(0, 0, 0.5, w, h, pB);
        g2.setColor(new Color(59, 130, 246));
        g2.drawLine(ox, oy, (int) pB[0], (int) pB[1]);
        g2.drawString("+Z (0.5m)", (int) pB[0] + 4, (int) pB[1]);

        // 4. Render Camera Pyramids & Optical Centers
        DLT11 dlt1 = parentFrame.getCamera1DLT();
        DLT11 dlt2 = parentFrame.getCamera2DLT();

        if (dlt1 != null && DualViewTriangulator.extractCameraCenter(dlt1, camCenter1)) {
            renderCameraPyramid(g2, camCenter1, "CAM 1", TacticalTheme.CAM1_OPTICAL, w, h);
        }
        if (dlt2 != null && DualViewTriangulator.extractCameraCenter(dlt2, camCenter2)) {
            renderCameraPyramid(g2, camCenter2, "CAM 2", TacticalTheme.CAM2_OPTICAL, w, h);
        }

        // 5. Render Reconstructed 3D Trajectory Ribbon & Point Mass Markers
        List<StereoTrackPoint> points = parentFrame.getTrackPoints();
        int activeFrame = parentFrame.getActiveFrame();

        int prevX = -1, prevY = -1;
        for (int i = 0; i < points.size(); i++) {
            StereoTrackPoint pt = points.get(i);
            if (!pt.has3D) continue;

            projectPoint(pt.x, pt.y, pt.z, w, h, projScratch);
            int sx = (int) projScratch[0];
            int sy = (int) projScratch[1];

            // Trajectory ribbon line segment
            if (prevX != -1) {
                g2.setColor(TacticalTheme.TRAJECTORY_RIBBON);
                g2.setStroke(new BasicStroke(2.0f));
                g2.drawLine(prevX, prevY, sx, sy);
            }
            prevX = sx;
            prevY = sy;

            // Point marker
            boolean isActive = (pt.frame == activeFrame);
            if (isActive) {
                g2.setColor(Color.WHITE);
                g2.fillOval(sx - 5, sy - 5, 10, 10);
                g2.setColor(TacticalTheme.NAVY_ACCENT);
                g2.setStroke(new BasicStroke(2.0f));
                g2.drawOval(sx - 7, sy - 7, 14, 14);

                // Render velocity tangent arrow if velocity is valid
                if (Math.abs(pt.speed) > 1e-4) {
                    double vScale = 0.2; // scale for visualization
                    projectPoint(pt.x + pt.vx * vScale, pt.y + pt.vy * vScale, pt.z + pt.vz * vScale, w, h, pB);
                    g2.setColor(TacticalTheme.VELOCITY_VECTOR);
                    g2.setStroke(new BasicStroke(2.0f));
                    g2.drawLine(sx, sy, (int) pB[0], (int) pB[1]);
                    g2.drawString(String.format("V: %.2f m/s", pt.speed), (int) pB[0] + 4, (int) pB[1]);
                }

                // Coordinate label
                g2.setColor(TacticalTheme.TRAJECTORY_RIBBON);
                g2.setFont(TacticalTheme.FONT_MONO_BOLD);
                g2.drawString(String.format("X: %.3fm, Y: %.3fm, Z: %.3fm", pt.x, pt.y, pt.z), sx + 12, sy - 12);
            } else {
                g2.setColor(new Color(56, 189, 248, 150));
                g2.fillOval(sx - 3, sy - 3, 6, 6);
            }
        }

        // 6. Viewport Telemetry Box in bottom-left
        g2.setColor(new Color(15, 23, 42, 220));
        g2.fillRect(6, h - 52, 260, 44);
        g2.setColor(TacticalTheme.DEEP_BORDER);
        g2.drawRect(6, h - 52, 260, 44);

        g2.setColor(TacticalTheme.NAVY_TEXT_LIGHT);
        g2.setFont(TacticalTheme.FONT_SMALL);
        g2.drawString(String.format("PITCH: %.1f° | YAW: %.1f° | ZOOM: %.0f px/m", pitch, yaw, zoom), 12, h - 34);
        g2.drawString("CONTROLS: Left Drag: Orbit | Right Drag: Pan | Wheel: Zoom", 12, h - 16);

        g2.dispose();
    }

    private void renderCameraPyramid(Graphics2D g, double[] c, String label, Color color, int w, int h) {
        projectPoint(c[0], c[1], c[2], w, h, projScratch);
        int cx = (int) projScratch[0];
        int cy = (int) projScratch[1];

        // Draw camera body
        g.setColor(color);
        g.fillOval(cx - 6, cy - 6, 12, 12);
        g.setColor(Color.WHITE);
        g.drawOval(cx - 7, cy - 7, 14, 14);

        g.setFont(TacticalTheme.FONT_MONO_BOLD);
        g.drawString(String.format("%s (%.2f, %.2f, %.2f)m", label, c[0], c[1], c[2]), cx + 10, cy - 8);
    }
}
