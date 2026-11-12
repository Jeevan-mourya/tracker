package org.opensourcephysics.cabrillo.tracker.stereo.ui;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.GridLayout;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextField;
import javax.swing.table.DefaultTableModel;
import org.opensourcephysics.cabrillo.tracker.stereo.math.CalibrationContext;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLT11;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLTCalibrator;

/**
 * Tactical calibration modal dialog for 11-parameter DLT and Brown-Conrady lens correction.
 *
 * <p>Provides:
 * <ul>
 *   <li>Interactive table of 3D control points vs. 2D detected image pixels (Cam 1 & Cam 2).</li>
 *   <li>Pre-loaded synthetic 3D control cage benchmark data.</li>
 *   <li>Brown-Conrady coefficient inputs (k1, k2, k3, p1, p2).</li>
 *   <li>Live status indicators: Condition Number (kappa), RMS residual, and validity gate badges.</li>
 * </ul>
 */
public final class CalibrationDialog extends JDialog {

    private final StereoWorkstationFrame parentFrame;
    private final JTable controlPointsTable;
    private final DefaultTableModel tableModel;

    private final JTextField txtK1, txtK2, txtK3, txtP1, txtP2;
    private final JCheckBox chkDistortionEnabled;

    private final JLabel lblCam1Status;
    private final JLabel lblCam2Status;
    private final JLabel lblCam1Rms;
    private final JLabel lblCam2Rms;

    private final CalibrationContext calCtx = new CalibrationContext(64);
    private final double[] residualMetrics = new double[6];

    public CalibrationDialog(StereoWorkstationFrame parent) {
        super(parent, "CAMERA DLT CALIBRATION & LENS DISTORTION", true);
        this.parentFrame = parent;

        setSize(850, 600);
        setLocationRelativeTo(parent);
        getContentPane().setLayout(new BorderLayout(4, 4));
        getContentPane().setBackground(TacticalTheme.CHASSIS);

        // North: Tactical Banner
        JPanel bannerPanel = new JPanel(new BorderLayout());
        bannerPanel.setBackground(TacticalTheme.NAVY_PRESSED);
        bannerPanel.setPreferredSize(new Dimension(100, 28));

        JLabel titleLbl = new JLabel("  PHOTOGRAMMETRIC DLT CAMERA CALIBRATION (11-PARAMETER PROJECTIVE MODEL)");
        titleLbl.setFont(TacticalTheme.FONT_HEADER);
        titleLbl.setForeground(TacticalTheme.NAVY_TEXT_LIGHT);
        bannerPanel.add(titleLbl, BorderLayout.WEST);
        getContentPane().add(bannerPanel, BorderLayout.NORTH);

        // Center: Control Points Table
        String[] colNames = {"ID", "X (m)", "Y (m)", "Z (m)", "Cam 1 U (px)", "Cam 1 V (px)", "Cam 2 U (px)", "Cam 2 V (px)"};
        tableModel = new DefaultTableModel(colNames, 0);
        controlPointsTable = new JTable(tableModel);
        controlPointsTable.setFont(TacticalTheme.FONT_MONO);
        controlPointsTable.setRowHeight(20);
        controlPointsTable.setGridColor(TacticalTheme.SPLITTER_TRACK);

        JScrollPane tableScroll = new JScrollPane(controlPointsTable);
        tableScroll.setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createLineBorder(TacticalTheme.DEEP_BORDER, 1),
                "3D-to-2D Calibration Control Points (N >= 6)",
                0, 0, TacticalTheme.FONT_HEADER, TacticalTheme.NAVY_ACCENT));

        getContentPane().add(tableScroll, BorderLayout.CENTER);

        // South: Parameters, Actions, and Gate Status
        JPanel southPanel = new JPanel();
        southPanel.setLayout(new BoxLayout(southPanel, BoxLayout.Y_AXIS));
        southPanel.setBackground(TacticalTheme.CHASSIS);
        southPanel.setBorder(BorderFactory.createEmptyBorder(6, 6, 6, 6));

        // Lens Distortion Controls
        JPanel distPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 4));
        distPanel.setBackground(TacticalTheme.CHASSIS);
        distPanel.setBorder(BorderFactory.createTitledBorder("Brown–Conrady Distortion Parameters"));

        chkDistortionEnabled = new JCheckBox("Enable Distortion Pre-Correction", false);
        chkDistortionEnabled.setFont(TacticalTheme.FONT_REGULAR);
        distPanel.add(chkDistortionEnabled);

        distPanel.add(new JLabel("k1:"));
        txtK1 = new JTextField("0.0", 6);
        distPanel.add(txtK1);

        distPanel.add(new JLabel("k2:"));
        txtK2 = new JTextField("0.0", 6);
        distPanel.add(txtK2);

        distPanel.add(new JLabel("k3:"));
        txtK3 = new JTextField("0.0", 6);
        distPanel.add(txtK3);

        distPanel.add(new JLabel("p1:"));
        txtP1 = new JTextField("0.0", 6);
        distPanel.add(txtP1);

        distPanel.add(new JLabel("p2:"));
        txtP2 = new JTextField("0.0", 6);
        distPanel.add(txtP2);

        southPanel.add(distPanel);

        // Status Readout Strip
        JPanel statusStrip = new JPanel(new GridLayout(1, 2, 8, 0));
        statusStrip.setBackground(TacticalTheme.CHASSIS);
        statusStrip.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));

        JPanel cam1StatusBox = new JPanel(new FlowLayout(FlowLayout.LEFT));
        cam1StatusBox.setBackground(TacticalTheme.DATA_GRID_SURFACE);
        cam1StatusBox.setBorder(TacticalTheme.BORDER_BEVELED_LOWERED);
        cam1StatusBox.add(new JLabel("CAM 1: "));
        lblCam1Status = new JLabel("NOT CALIBRATED");
        lblCam1Status.setFont(TacticalTheme.FONT_MONO_BOLD);
        lblCam1Status.setForeground(TacticalTheme.STATUS_WARN);
        cam1StatusBox.add(lblCam1Status);
        lblCam1Rms = new JLabel(" | RMS: --");
        lblCam1Rms.setFont(TacticalTheme.FONT_MONO);
        cam1StatusBox.add(lblCam1Rms);
        statusStrip.add(cam1StatusBox);

        JPanel cam2StatusBox = new JPanel(new FlowLayout(FlowLayout.LEFT));
        cam2StatusBox.setBackground(TacticalTheme.DATA_GRID_SURFACE);
        cam2StatusBox.setBorder(TacticalTheme.BORDER_BEVELED_LOWERED);
        cam2StatusBox.add(new JLabel("CAM 2: "));
        lblCam2Status = new JLabel("NOT CALIBRATED");
        lblCam2Status.setFont(TacticalTheme.FONT_MONO_BOLD);
        lblCam2Status.setForeground(TacticalTheme.STATUS_WARN);
        cam2StatusBox.add(lblCam2Status);
        lblCam2Rms = new JLabel(" | RMS: --");
        lblCam2Rms.setFont(TacticalTheme.FONT_MONO);
        cam2StatusBox.add(lblCam2Rms);
        statusStrip.add(cam2StatusBox);

        southPanel.add(statusStrip);

        // Buttons Strip
        JPanel buttonStrip = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 4));
        buttonStrip.setBackground(TacticalTheme.CHASSIS);

        JButton btnLoadBenchmark = new JButton("LOAD BENCHMARK CAGE");
        btnLoadBenchmark.setFont(TacticalTheme.FONT_MONO_BOLD);
        btnLoadBenchmark.setBackground(TacticalTheme.CHASSIS);
        btnLoadBenchmark.setBorder(TacticalTheme.BORDER_BEVELED_RAISED);
        btnLoadBenchmark.addActionListener(e -> loadBenchmarkData());
        buttonStrip.add(btnLoadBenchmark);

        JButton btnCalibrateCam1 = new JButton("CALIBRATE CAM 1");
        btnCalibrateCam1.setFont(TacticalTheme.FONT_MONO_BOLD);
        btnCalibrateCam1.setBackground(TacticalTheme.CAM1_OPTICAL);
        btnCalibrateCam1.setForeground(Color.WHITE);
        btnCalibrateCam1.addActionListener(e -> runCalibrationForCamera(1));
        buttonStrip.add(btnCalibrateCam1);

        JButton btnCalibrateCam2 = new JButton("CALIBRATE CAM 2");
        btnCalibrateCam2.setFont(TacticalTheme.FONT_MONO_BOLD);
        btnCalibrateCam2.setBackground(TacticalTheme.CAM2_OPTICAL);
        btnCalibrateCam2.setForeground(Color.BLACK);
        btnCalibrateCam2.addActionListener(e -> runCalibrationForCamera(2));
        buttonStrip.add(btnCalibrateCam2);

        buttonStrip.add(Box.createHorizontalStrut(16));

        JButton btnClose = new JButton("CLOSE");
        btnClose.setFont(TacticalTheme.FONT_MONO_BOLD);
        btnClose.setBackground(TacticalTheme.CHASSIS);
        btnClose.setBorder(TacticalTheme.BORDER_BEVELED_RAISED);
        btnClose.addActionListener(e -> setVisible(false));
        buttonStrip.add(btnClose);

        southPanel.add(buttonStrip);
        getContentPane().add(southPanel, BorderLayout.SOUTH);

        // Pre-populate with benchmark cage
        loadBenchmarkData();
    }

    private void loadBenchmarkData() {
        tableModel.setRowCount(0);
        // 12 synthetic control cage points
        Object[][] benchmarkRows = {
            {"CAGE-01", 0.000, 0.000, 1.000, 185.2, 342.1, 195.0, 340.0},
            {"CAGE-02", 0.500, 0.000, 1.000, 274.6, 342.1, 280.0, 340.0},
            {"CAGE-03", 1.000, 0.000, 1.000, 364.0, 342.1, 365.0, 340.0},
            {"CAGE-04", 0.000, 0.500, 1.000, 185.2, 240.0, 195.0, 240.0},
            {"CAGE-05", 0.500, 0.500, 1.000, 274.6, 240.0, 280.0, 240.0},
            {"CAGE-06", 1.000, 0.500, 1.000, 364.0, 240.0, 365.0, 240.0},
            {"CAGE-07", 0.000, 1.000, 1.000, 185.2, 137.9, 195.0, 140.0},
            {"CAGE-08", 0.500, 1.000, 1.000, 274.6, 137.9, 280.0, 140.0},
            {"CAGE-09", 1.000, 1.000, 1.000, 364.0, 137.9, 365.0, 140.0},
            {"CAGE-10", 0.000, 0.000, 1.500, 218.4, 308.1, 225.0, 310.0},
            {"CAGE-11", 1.000, 0.000, 1.500, 337.6, 308.1, 340.0, 310.0},
            {"CAGE-12", 0.000, 1.000, 1.500, 218.4, 171.9, 225.0, 175.0}
        };

        for (Object[] row : benchmarkRows) {
            tableModel.addRow(row);
        }
    }

    private void runCalibrationForCamera(int camIndex) {
        int n = tableModel.getRowCount();
        if (n < 6) {
            JOptionPane.showMessageDialog(this, "Requires at least 6 non-coplanar 3D points.", "Calibration Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        double[] pts3D = new double[3 * n];
        double[] pts2D = new double[2 * n];

        try {
            for (int i = 0; i < n; i++) {
                pts3D[3 * i + 0] = Double.parseDouble(tableModel.getValueAt(i, 1).toString());
                pts3D[3 * i + 1] = Double.parseDouble(tableModel.getValueAt(i, 2).toString());
                pts3D[3 * i + 2] = Double.parseDouble(tableModel.getValueAt(i, 3).toString());

                int colU = (camIndex == 1) ? 4 : 6;
                int colV = (camIndex == 1) ? 5 : 7;
                pts2D[2 * i + 0] = Double.parseDouble(tableModel.getValueAt(i, colU).toString());
                pts2D[2 * i + 1] = Double.parseDouble(tableModel.getValueAt(i, colV).toString());
            }
        } catch (NumberFormatException ex) {
            JOptionPane.showMessageDialog(this, "Invalid numeric input in control points table.", "Input Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        boolean distEnabled = chkDistortionEnabled.isSelected();
        double k1 = Double.parseDouble(txtK1.getText().trim());
        double k2 = Double.parseDouble(txtK2.getText().trim());
        double k3 = Double.parseDouble(txtK3.getText().trim());
        double p1 = Double.parseDouble(txtP1.getText().trim());
        double p2 = Double.parseDouble(txtP2.getText().trim());

        DLT11 resultDLT = new DLT11();
        DLTCalibrator.Status status = DLTCalibrator.calibrate(
                pts3D, pts2D, n,
                distEnabled, 320, 240, k1, k2, k3, p1, p2, 1000.0,
                calCtx, resultDLT, residualMetrics);

        double rms = residualMetrics[0];
        double maxRes = residualMetrics[1];
        double kappa = residualMetrics[3];

        if (camIndex == 1) {
            if (status == DLTCalibrator.Status.SUCCESS) {
                lblCam1Status.setText("VALIDATED");
                lblCam1Status.setForeground(TacticalTheme.STATUS_PASS);
                lblCam1Rms.setText(String.format(" | RMS: %.3f px (kappa: %.1f)", rms, kappa));
                parentFrame.setCamera1DLT(resultDLT);
            } else {
                lblCam1Status.setText(status.toString());
                lblCam1Status.setForeground(TacticalTheme.STATUS_REJECT);
                lblCam1Rms.setText(String.format(" | RMS: %.2f px", rms));
            }
        } else {
            if (status == DLTCalibrator.Status.SUCCESS) {
                lblCam2Status.setText("VALIDATED");
                lblCam2Status.setForeground(TacticalTheme.STATUS_PASS);
                lblCam2Rms.setText(String.format(" | RMS: %.3f px (kappa: %.1f)", rms, kappa));
                parentFrame.setCamera2DLT(resultDLT);
            } else {
                lblCam2Status.setText(status.toString());
                lblCam2Status.setForeground(TacticalTheme.STATUS_REJECT);
                lblCam2Rms.setText(String.format(" | RMS: %.2f px", rms));
            }
        }

        parentFrame.recalculateTrajectory();
    }
}
