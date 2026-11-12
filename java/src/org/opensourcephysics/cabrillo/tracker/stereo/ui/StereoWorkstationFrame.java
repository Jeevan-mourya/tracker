package org.opensourcephysics.cabrillo.tracker.stereo.ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.util.ArrayList;
import java.util.List;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JMenu;
import javax.swing.JMenuBar;
import javax.swing.JMenuItem;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JSeparator;
import javax.swing.JSplitPane;
import javax.swing.JToolBar;
import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLT11;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DualViewTriangulator;
import org.opensourcephysics.cabrillo.tracker.stereo.math.SpatialKinematics;
import org.opensourcephysics.cabrillo.tracker.stereo.math.TriangulationContext;

/**
 * Primary Desktop Workstation Frame for OSP / Tracker Stereoscopic Video Analysis.
 *
 * <p>Orchestrates:
 * <ul>
 *   <li>Dual camera synchronized video analysis viewports.</li>
 *   <li>Real-time 3D spatial trajectory viewer.</li>
 *   <li>Defense and aerospace kinematics telemetry data table.</li>
 *   <li>11-Parameter DLT camera calibration dialog.</li>
 *   <li>Zero-allocation numerical service invocation on background threads.</li>
 * </ul>
 */
public final class StereoWorkstationFrame extends JFrame {

    // Viewports & Sub-Panels
    private final DualVideoViewportPanel dualVideoPanel;
    private final ThreeDTrajectoryViewport threeDViewport;
    private final TelemetryTablePanel telemetryTable;
    private final CalibrationDialog calibrationDialog;

    // Status bar labels
    private final JLabel lblGateStatus;
    private final JLabel lblPointCount;
    private final JLabel lblMemory;

    // State: Tracked stereoscopic points
    private final List<StereoTrackPoint> trackPoints = new ArrayList<>();
    private int activeFrame = 0;

    // Camera Calibrations (Defaulted to verified convergent stereo baseline)
    private DLT11 dltCam1 = new DLT11(new double[]{
        221.726, 0.0, 91.844, 156.0,
        0.0, -240.0, 0.0, 350.0,
        0.0, 0.0, 0.05
    });

    private DLT11 dltCam2 = new DLT11(new double[]{
        221.726, 0.0, -91.844, 444.0,
        0.0, -240.0, 0.0, 350.0,
        0.0, 0.0, 0.05
    });

    // Zero-allocation reusable mathematical context
    private final TriangulationContext triCtx = new TriangulationContext();
    private final double[] triXyz = new double[3];
    private final double[] triMetrics = new double[5];

    public StereoWorkstationFrame() {
        super("Tracker Video Analysis & TrackEye 3D Workstation - Open Source Physics");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(1366, 860);
        setMinimumSize(new Dimension(1080, 650));
        setLocationRelativeTo(null);
        getContentPane().setBackground(TacticalTheme.CHASSIS);

        // 1. Menu Bar
        setJMenuBar(createWorkstationMenuBar());

        // 2. Tactical Mode Toolbar (Operational Mode Switcher)
        add(createTacticalToolbar(), BorderLayout.NORTH);

        // 3. Central Tri-Pane Layout (Dual Video, 3D Trajectory, Telemetry Table)
        dualVideoPanel = new DualVideoViewportPanel(this);
        threeDViewport = new ThreeDTrajectoryViewport(this);
        telemetryTable = new TelemetryTablePanel(this);

        // Top horizontal split: Dual Video Viewport (Left) vs 3D Spatial Trajectory (Right)
        JSplitPane topSplit = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, dualVideoPanel, threeDViewport);
        topSplit.setDividerLocation(700);
        topSplit.setDividerSize(5);
        topSplit.setBackground(TacticalTheme.CHASSIS);
        topSplit.setBorder(BorderFactory.createEmptyBorder(2, 2, 2, 2));

        // Master vertical split: Top Viewports (Above) vs Telemetry Data Grid (Below)
        JSplitPane masterSplit = new JSplitPane(JSplitPane.VERTICAL_SPLIT, topSplit, telemetryTable);
        masterSplit.setDividerLocation(520);
        masterSplit.setDividerSize(5);
        masterSplit.setBackground(TacticalTheme.CHASSIS);
        masterSplit.setBorder(BorderFactory.createEmptyBorder(2, 2, 2, 2));

        add(masterSplit, BorderLayout.CENTER);

        // 4. Tactical Telemetry Status Bar
        JPanel statusBar = new JPanel(new BorderLayout(8, 0));
        statusBar.setBackground(TacticalTheme.NAVY_PRESSED);
        statusBar.setPreferredSize(new Dimension(100, 24));
        statusBar.setBorder(BorderFactory.createEmptyBorder(2, 8, 2, 8));

        JPanel leftStatus = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        leftStatus.setOpaque(false);

        JLabel lblMode = new JLabel("MODE: STEREO 3D TRACKING");
        lblMode.setFont(TacticalTheme.FONT_MONO_BOLD);
        lblMode.setForeground(TacticalTheme.TRAJECTORY_RIBBON);
        leftStatus.add(lblMode);

        lblGateStatus = new JLabel("GATE: ALL SYSTEMS NORMAL");
        lblGateStatus.setFont(TacticalTheme.FONT_MONO);
        lblGateStatus.setForeground(TacticalTheme.STATUS_PASS);
        leftStatus.add(lblGateStatus);

        statusBar.add(leftStatus, BorderLayout.WEST);

        JPanel rightStatus = new JPanel(new FlowLayout(FlowLayout.RIGHT, 12, 0));
        rightStatus.setOpaque(false);

        lblPointCount = new JLabel("TRACKED: 0 PTS");
        lblPointCount.setFont(TacticalTheme.FONT_MONO);
        lblPointCount.setForeground(TacticalTheme.NAVY_TEXT_LIGHT);
        rightStatus.add(lblPointCount);

        lblMemory = new JLabel("MEM: OK");
        lblMemory.setFont(TacticalTheme.FONT_MONO);
        lblMemory.setForeground(TacticalTheme.SUBDUED_TEXT);
        rightStatus.add(lblMemory);

        statusBar.add(rightStatus, BorderLayout.EAST);
        add(statusBar, BorderLayout.SOUTH);

        // Point marking event hookup from dual video canvas
        dualVideoPanel.setPointMarkingListener(new DualVideoViewportPanel.PointMarkingListener() {
            @Override
            public void onPointMarked(int cameraIndex, int frame, double u, double v) {
                recordPointObservation(cameraIndex, frame, u, v);
            }

            @Override
            public void onFrameChanged(int newFrame) {
                activeFrame = newFrame;
                threeDViewport.repaint();
            }
        });

        // Calibration Dialog Modal
        calibrationDialog = new CalibrationDialog(this);

        // Pre-load a sample synthetic ballistic trajectory for immediate visual inspection
        loadSampleBallisticTrack();
    }

    private JMenuBar createWorkstationMenuBar() {
        JMenuBar mb = new JMenuBar();
        mb.setBackground(TacticalTheme.CHASSIS);
        mb.setBorder(TacticalTheme.BORDER_BEVELED_RAISED);

        // File Menu
        JMenu menuFile = new JMenu("File");
        menuFile.setFont(TacticalTheme.FONT_REGULAR);

        JMenuItem miNewTrack = new JMenuItem("New Point Mass Track");
        miNewTrack.addActionListener(e -> clearTrackPoints());
        menuFile.add(miNewTrack);

        JMenuItem miLoadSample = new JMenuItem("Load Ballistic Trajectory Sample");
        miLoadSample.addActionListener(e -> loadSampleBallisticTrack());
        menuFile.add(miLoadSample);

        menuFile.add(new JSeparator());

        JMenuItem miExit = new JMenuItem("Exit");
        miExit.addActionListener(e -> System.exit(0));
        menuFile.add(miExit);
        mb.add(menuFile);

        // Calibration Menu
        JMenu menuCalib = new JMenu("Calibration");
        menuCalib.setFont(TacticalTheme.FONT_REGULAR);

        JMenuItem miOpenCalib = new JMenuItem("DLT Camera Calibration Dialog...");
        miOpenCalib.addActionListener(e -> calibrationDialog.setVisible(true));
        menuCalib.add(miOpenCalib);
        mb.add(menuCalib);

        // Views Menu
        JMenu menuView = new JMenu("View");
        menuView.setFont(TacticalTheme.FONT_REGULAR);

        JMenuItem miReset3D = new JMenuItem("Reset 3D Viewport Orbit");
        miReset3D.addActionListener(e -> threeDViewport.repaint());
        menuView.add(miReset3D);
        mb.add(menuView);

        // Help Menu
        JMenu menuHelp = new JMenu("Help");
        menuHelp.setFont(TacticalTheme.FONT_REGULAR);

        JMenuItem miAbout = new JMenuItem("About Stereo Workstation");
        miAbout.addActionListener(e -> {
            JOptionPane.showMessageDialog(this,
                    "Tracker Video Analysis & TrackEye 3D Workstation\n" +
                    "Version 1.0.0 (Phase 3 Java Swing Desktop Engine)\n\n" +
                    "High-Precision 2D & Stereo 3D Video Kinematics Modeling\n" +
                    "Zero-Allocation Householder QR & Jacobi SVD Numerical Core\n" +
                    "Integrated with Open Source Physics (OSP) Tracker Ecosystem",
                    "About Workstation", JOptionPane.INFORMATION_MESSAGE);
        });
        menuHelp.add(miAbout);
        mb.add(menuHelp);

        return mb;
    }

    private JToolBar createTacticalToolbar() {
        JToolBar tb = new JToolBar();
        tb.setFloatable(false);
        tb.setBackground(TacticalTheme.CHASSIS);
        tb.setBorder(BorderFactory.createCompoundBorder(
                TacticalTheme.BORDER_BEVELED_RAISED,
                BorderFactory.createEmptyBorder(2, 4, 2, 4)));

        JButton btnPointMass = createToolbarButton("⊕ POINT MASS", true, () -> {});
        JButton btnAxes = createToolbarButton("✛ COORD AXES", false, () -> {});
        JButton btnCalStick = createToolbarButton("📏 CALIBRATION", false, () -> calibrationDialog.setVisible(true));
        JButton btnClear = createToolbarButton("↺ RESET POINTS", false, this::clearTrackPoints);

        tb.add(btnPointMass);
        tb.add(Box.createHorizontalStrut(4));
        tb.add(btnAxes);
        tb.add(Box.createHorizontalStrut(4));
        tb.add(btnCalStick);
        tb.add(Box.createHorizontalStrut(8));
        tb.add(btnClear);

        return tb;
    }

    private JButton createToolbarButton(String text, boolean active, Runnable action) {
        JButton btn = new JButton(text);
        btn.setFont(TacticalTheme.FONT_MONO_BOLD);
        btn.setFocusPainted(false);
        if (active) {
            btn.setBackground(TacticalTheme.NAVY_ACCENT);
            btn.setForeground(TacticalTheme.NAVY_TEXT_LIGHT);
            btn.setBorder(TacticalTheme.BORDER_BEVELED_LOWERED);
        } else {
            btn.setBackground(TacticalTheme.CHASSIS);
            btn.setForeground(TacticalTheme.PRIMARY_TEXT);
            btn.setBorder(TacticalTheme.BORDER_BEVELED_RAISED);
        }
        btn.addActionListener(e -> action.run());
        return btn;
    }

    /**
     * Records a 2D optical point observation from either Camera 1 or Camera 2.
     * When both observations exist for a frame, invokes the zero-allocation triangulation engine.
     */
    public synchronized void recordPointObservation(int cameraIndex, int frame, double u, double v) {
        StereoTrackPoint pt = getOrCreateTrackPoint(frame);

        if (cameraIndex == 1) {
            pt.setCam1(u, v);
        } else {
            pt.setCam2(u, v);
        }

        // Triangulate if both views have marked observations
        if (pt.hasCam1 && pt.hasCam2) {
            triangulatePoint(pt);
        }

        recalculateTrajectory();
    }

    /**
     * Invokes the Phase 1 Householder QR DualViewTriangulator using pre-allocated workspace buffers.
     */
    private void triangulatePoint(StereoTrackPoint pt) {
        if (dltCam1 == null || dltCam2 == null) return;

        DualViewTriangulator.TriangulationStatus status = DualViewTriangulator.triangulate(
                pt.u1, pt.v1, dltCam1,
                pt.u2, pt.v2, dltCam2,
                1.5, 50.0,
                triCtx,
                triXyz,
                triMetrics);

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
            pt.has3D = false;
            pt.gateStatus = "REJECTED";
        }
    }

    /**
     * Computes O(dt^2) spatial kinematics across all reconstructed 3D points.
     */
    public synchronized void recalculateTrajectory() {
        int n = trackPoints.size();
        if (n < 2) {
            updateUI();
            return;
        }

        double[] times = new double[n];
        double[] coordsXyz = new double[3 * n];
        double[] velXyz = new double[3 * n];
        double[] accXyz = new double[3 * n];
        double[] scalarMetrics = new double[6 * n];

        for (int i = 0; i < n; i++) {
            StereoTrackPoint p = trackPoints.get(i);
            times[i] = p.time;
            coordsXyz[3 * i + 0] = p.x;
            coordsXyz[3 * i + 1] = p.y;
            coordsXyz[3 * i + 2] = p.z;
        }

        SpatialKinematics.computeTrajectoryKinematics(times, coordsXyz, n, velXyz, accXyz, scalarMetrics);

        for (int i = 0; i < n; i++) {
            StereoTrackPoint p = trackPoints.get(i);
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

        updateUI();
    }

    private void updateUI() {
        SwingUtilities.invokeLater(() -> {
            lblPointCount.setText(String.format("TRACKED: %d PTS", trackPoints.size()));
            dualVideoPanel.repaint();
            threeDViewport.repaint();
            telemetryTable.refreshData();
        });
    }

    public synchronized StereoTrackPoint getOrCreateTrackPoint(int frame) {
        for (StereoTrackPoint p : trackPoints) {
            if (p.frame == frame) return p;
        }
        double time = frame / 60.0;
        StereoTrackPoint newPt = new StereoTrackPoint(frame, time);
        trackPoints.add(newPt);
        trackPoints.sort((a, b) -> Integer.compare(a.frame, b.frame));
        return newPt;
    }

    public synchronized StereoTrackPoint getTrackPointForFrame(int frame) {
        for (StereoTrackPoint p : trackPoints) {
            if (p.frame == frame) return p;
        }
        return null;
    }

    public synchronized List<StereoTrackPoint> getTrackPoints() {
        return trackPoints;
    }

    public synchronized void clearTrackPoints() {
        trackPoints.clear();
        recalculateTrajectory();
    }

    public DLT11 getCamera1DLT() { return dltCam1; }
    public void setCamera1DLT(DLT11 dlt) { this.dltCam1 = dlt; }

    public DLT11 getCamera2DLT() { return dltCam2; }
    public void setCamera2DLT(DLT11 dlt) { this.dltCam2 = dlt; }

    public int getActiveFrame() { return activeFrame; }

    /**
     * Pre-populates the workstation with a verified synthetic 3D ballistic trajectory.
     */
    public void loadSampleBallisticTrack() {
        clearTrackPoints();
        double dt = 1.0 / 60.0;
        double g = 9.80665;
        double v0x = 1.2;
        double v0y = 3.5;
        double z0 = 1.6;

        double[] projUv1 = new double[2];
        double[] projUv2 = new double[2];

        for (int f = 0; f < 35; f++) {
            double t = f * dt;
            double X = v0x * t;
            double Y = v0y * t - 0.5 * g * t * t;
            double Z = z0 + 0.1 * Math.sin(t * 3.0);

            dltCam1.project(X, Y, Z, projUv1);
            dltCam2.project(X, Y, Z, projUv2);

            StereoTrackPoint pt = getOrCreateTrackPoint(f);
            pt.setCam1(projUv1[0], projUv1[1]);
            pt.setCam2(projUv2[0], projUv2[1]);
            triangulatePoint(pt);
        }

        recalculateTrajectory();
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            try {
                // Set system look and feel if available
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ignored) {
            }
            StereoWorkstationFrame frame = new StereoWorkstationFrame();
            frame.setVisible(true);
        });
    }
}
