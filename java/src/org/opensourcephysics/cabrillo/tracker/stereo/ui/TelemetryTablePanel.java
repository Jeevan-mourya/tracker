package org.opensourcephysics.cabrillo.tracker.stereo.ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;
import javax.swing.JButton;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.table.AbstractTableModel;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.JTableHeader;

/**
 * High-contrast defense and aerospace telemetry table panel.
 *
 * <p>Displays real-time frame-by-frame kinematics:
 * <ul>
 *   <li>Frame, Time (s)</li>
 *   <li>3D Spatial Coordinates: X, Y, Z (m)</li>
 *   <li>3D Velocity: Vx, Vy, Vz (m/s), Speed |V| (m/s), Mach number</li>
 *   <li>3D Acceleration: Ax, Ay, Az (m/s^2), G-force</li>
 *   <li>Spherical Tracking: Slant Range (m), Azimuth (deg), Elevation (deg)</li>
 *   <li>Quality Gates: Ray Convergence Angle (deg), Reprojection Residual (px), Gate Status</li>
 * </ul>
 *
 * Includes an offline CSV export utility for physical validation trials.
 */
public final class TelemetryTablePanel extends JPanel {

    private final StereoWorkstationFrame parentFrame;
    private final TelemetryTableModel tableModel;
    private final JTable table;
    private final JLabel lblRowCount;

    public TelemetryTablePanel(StereoWorkstationFrame parent) {
        this.parentFrame = parent;
        setLayout(new BorderLayout());
        setBackground(TacticalTheme.CHASSIS);
        setBorder(TacticalTheme.BORDER_TACTICAL_PANEL);

        // Header Control Strip
        JPanel headerPanel = new JPanel(new BorderLayout());
        headerPanel.setBackground(TacticalTheme.NAVY_PRESSED);
        headerPanel.setPreferredSize(new Dimension(100, 26));

        JLabel titleLbl = new JLabel("  DEFENSE & AEROSPACE TELEMETRY (TRACKEYE COMPATIBLE)");
        titleLbl.setFont(TacticalTheme.FONT_HEADER);
        titleLbl.setForeground(TacticalTheme.NAVY_TEXT_LIGHT);
        headerPanel.add(titleLbl, BorderLayout.WEST);

        JPanel actionPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 4, 1));
        actionPanel.setOpaque(false);

        lblRowCount = new JLabel("POINTS: 0  ");
        lblRowCount.setFont(TacticalTheme.FONT_MONO);
        lblRowCount.setForeground(TacticalTheme.NAVY_TEXT_LIGHT);
        actionPanel.add(lblRowCount);

        JButton btnExportCsv = new JButton("EXPORT CSV");
        btnExportCsv.setFont(TacticalTheme.FONT_MONO_BOLD);
        btnExportCsv.setBackground(TacticalTheme.CHASSIS);
        btnExportCsv.setForeground(TacticalTheme.PRIMARY_TEXT);
        btnExportCsv.setBorder(TacticalTheme.BORDER_BEVELED_RAISED);
        btnExportCsv.setFocusPainted(false);
        btnExportCsv.addActionListener(e -> exportToCsv());
        actionPanel.add(btnExportCsv);

        headerPanel.add(actionPanel, BorderLayout.EAST);
        add(headerPanel, BorderLayout.NORTH);

        // Center: JTable Data Grid
        tableModel = new TelemetryTableModel();
        table = new JTable(tableModel);
        table.setFont(TacticalTheme.FONT_MONO);
        table.setRowHeight(20);
        table.setGridColor(TacticalTheme.SPLITTER_TRACK);
        table.setShowGrid(true);
        table.setAutoResizeMode(JTable.AUTO_RESIZE_OFF);

        JTableHeader th = table.getTableHeader();
        th.setFont(TacticalTheme.FONT_HEADER);
        th.setBackground(TacticalTheme.CHASSIS);
        th.setForeground(TacticalTheme.PRIMARY_TEXT);
        th.setReorderingAllowed(false);

        // Custom Cell Renderer for Row Striping and Gate Status Colors
        table.setDefaultRenderer(Object.class, new DefaultTableCellRenderer() {
            @Override
            public Component getTableCellRendererComponent(
                    JTable t, Object val, boolean isSel, boolean hasFocus, int row, int col) {
                Component c = super.getTableCellRendererComponent(t, val, isSel, hasFocus, row, col);

                if (!isSel) {
                    c.setBackground((row % 2 == 0) ? TacticalTheme.DATA_GRID_SURFACE : TacticalTheme.DATA_GRID_ALT_ROW);
                    c.setForeground(TacticalTheme.PRIMARY_TEXT);
                }

                // Highlight Gate Status column (column index 14)
                if (col == 14 && val != null) {
                    String status = val.toString();
                    if ("VALID".equals(status)) {
                        c.setForeground(TacticalTheme.STATUS_PASS);
                        setFont(TacticalTheme.FONT_MONO_BOLD);
                    } else if ("LOW_RAY_ANGLE".equals(status)) {
                        c.setForeground(TacticalTheme.STATUS_WARN);
                        setFont(TacticalTheme.FONT_MONO_BOLD);
                    } else if ("REJECTED".equals(status)) {
                        c.setForeground(TacticalTheme.STATUS_REJECT);
                        setFont(TacticalTheme.FONT_MONO_BOLD);
                    }
                }
                return c;
            }
        });

        // Set column widths
        int[] colWidths = {50, 70, 75, 75, 75, 75, 75, 75, 75, 55, 60, 75, 70, 70, 90};
        for (int i = 0; i < colWidths.length && i < table.getColumnCount(); i++) {
            table.getColumnModel().getColumn(i).setPreferredWidth(colWidths[i]);
        }

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.getViewport().setBackground(TacticalTheme.DATA_GRID_SURFACE);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());
        add(scrollPane, BorderLayout.CENTER);
    }

    public void refreshData() {
        tableModel.fireTableDataChanged();
        lblRowCount.setText(String.format("POINTS: %d  ", parentFrame.getTrackPoints().size()));
    }

    private void exportToCsv() {
        List<StereoTrackPoint> pts = parentFrame.getTrackPoints();
        if (pts.isEmpty()) {
            JOptionPane.showMessageDialog(this, "No trajectory points available to export.", "Export Notice", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Export Trajectory Kinematics (CSV)");
        chooser.setSelectedFile(new File("stereo_trajectory_telemetry.csv"));
        chooser.setFileFilter(new FileNameExtensionFilter("Comma Separated Values (*.csv)", "csv"));

        if (chooser.showSaveDialog(this) == JFileChooser.APPROVE_OPTION) {
            File file = chooser.getSelectedFile();
            if (!file.getName().toLowerCase().endsWith(".csv")) {
                file = new File(file.getParentFile(), file.getName() + ".csv");
            }

            try (PrintWriter pw = new PrintWriter(new FileWriter(file))) {
                // Header
                pw.println("Frame,Time_s,X_m,Y_m,Z_m,Vx_mps,Vy_mps,Vz_mps,Speed_mps,Mach,G_Force,SlantRange_m,Azimuth_deg,Elevation_deg,RayAngle_deg,Residual_px,GateStatus");
                for (StereoTrackPoint pt : pts) {
                    pw.printf("%d,%.4f,%.5f,%.5f,%.5f,%.4f,%.4f,%.4f,%.4f,%.3f,%.3f,%.4f,%.2f,%.2f,%.2f,%.4f,%s%n",
                            pt.frame, pt.time, pt.x, pt.y, pt.z,
                            pt.vx, pt.vy, pt.vz, pt.speed, pt.machNumber, pt.gForce,
                            pt.slantRange, pt.azimuthDeg, pt.elevationDeg,
                            pt.rayAngleDeg, pt.combinedResidualPx, pt.gateStatus);
                }
                JOptionPane.showMessageDialog(this, "Successfully exported " + pts.size() + " points to:\n" + file.getAbsolutePath(), "Export Success", JOptionPane.INFORMATION_MESSAGE);
            } catch (IOException ex) {
                JOptionPane.showMessageDialog(this, "Error saving CSV file: " + ex.getMessage(), "Export Failure", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private final class TelemetryTableModel extends AbstractTableModel {
        private final String[] columns = {
            "Frame", "Time (s)",
            "X (m)", "Y (m)", "Z (m)",
            "Vx (m/s)", "Vy (m/s)", "Vz (m/s)", "|V| (m/s)", "Mach",
            "G-Force", "Slant (m)", "Az (°)", "El (°)", "Gate Status"
        };

        @Override
        public int getRowCount() {
            return parentFrame.getTrackPoints().size();
        }

        @Override
        public int getColumnCount() {
            return columns.length;
        }

        @Override
        public String getColumnName(int col) {
            return columns[col];
        }

        @Override
        public Object getValueAt(int row, int col) {
            List<StereoTrackPoint> pts = parentFrame.getTrackPoints();
            if (row >= pts.size()) return "";
            StereoTrackPoint pt = pts.get(row);

            switch (col) {
                case 0: return pt.frame;
                case 1: return String.format("%.4f", pt.time);
                case 2: return pt.has3D ? String.format("%.4f", pt.x) : "--";
                case 3: return pt.has3D ? String.format("%.4f", pt.y) : "--";
                case 4: return pt.has3D ? String.format("%.4f", pt.z) : "--";
                case 5: return pt.has3D ? String.format("%.3f", pt.vx) : "--";
                case 6: return pt.has3D ? String.format("%.3f", pt.vy) : "--";
                case 7: return pt.has3D ? String.format("%.3f", pt.vz) : "--";
                case 8: return pt.has3D ? String.format("%.3f", pt.speed) : "--";
                case 9: return pt.has3D ? String.format("%.2f", pt.machNumber) : "--";
                case 10: return pt.has3D ? String.format("%.2f", pt.gForce) : "--";
                case 11: return pt.has3D ? String.format("%.3f", pt.slantRange) : "--";
                case 12: return pt.has3D ? String.format("%.1f°", pt.azimuthDeg) : "--";
                case 13: return pt.has3D ? String.format("%.1f°", pt.elevationDeg) : "--";
                case 14: return pt.gateStatus;
                default: return "";
            }
        }
    }
}
