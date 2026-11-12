package org.opensourcephysics.cabrillo.tracker.stereo.ui;

import java.awt.BasicStroke;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridLayout;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.image.BufferedImage;
import java.util.List;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JSlider;
import javax.swing.JToolBar;
import javax.swing.Timer;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLT11;

/**
 * Dual split viewport displaying Camera 1 (Left) and Camera 2 (Right) feeds side-by-side.
 *
 * <p>Features:
 * <ul>
 *   <li>Sub-frame crosshairs marking tracked points (Cam 1: #3B82F6, Cam 2: #EAB308).</li>
 *   <li>Interactive point marking via mouse clicks.</li>
 *   <li>Epipolar line projection overlays.</li>
 *   <li>Master synchronized timeline with +/-1, +/-5, +/-10 frame steppers and FPS selector.</li>
 * </ul>
 */
public final class DualVideoViewportPanel extends JPanel {

    public interface PointMarkingListener {
        void onPointMarked(int cameraIndex, int frame, double u, double v);
        void onFrameChanged(int newFrame);
    }

    private final StereoWorkstationFrame parentFrame;
    private final CameraViewCanvas canvasCam1;
    private final CameraViewCanvas canvasCam2;

    private final JSlider timelineSlider;
    private final JLabel lblCurrentFrame;
    private final JLabel lblCurrentTime;
    private final JButton btnPlayPause;
    private final JComboBox<String> cmbFps;

    private int currentFrame = 0;
    private int totalFrames = 100;
    private double currentFps = 60.0;
    private boolean isPlaying = false;
    private final Timer playbackTimer;

    private PointMarkingListener markingListener;

    public DualVideoViewportPanel(StereoWorkstationFrame parent) {
        this.parentFrame = parent;
        setLayout(new BorderLayout());
        setBackground(TacticalTheme.CHASSIS);
        setBorder(TacticalTheme.BORDER_TACTICAL_PANEL);

        // Center: Dual View split grid
        JPanel splitPanel = new JPanel(new GridLayout(1, 2, 4, 0));
        splitPanel.setBackground(TacticalTheme.CHASSIS);

        canvasCam1 = new CameraViewCanvas(1, "CAM 1 (PRIMARY)", TacticalTheme.CAM1_OPTICAL);
        canvasCam2 = new CameraViewCanvas(2, "CAM 2 (SECONDARY)", TacticalTheme.CAM2_OPTICAL);

        splitPanel.add(canvasCam1);
        splitPanel.add(canvasCam2);
        add(splitPanel, BorderLayout.CENTER);

        // Bottom: Master Scrubbing Timeline & Playback Controller
        JPanel bottomControlPanel = new JPanel(new BorderLayout(4, 2));
        bottomControlPanel.setBackground(TacticalTheme.CHASSIS);
        bottomControlPanel.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));

        // Row 1: Scrubber range slider
        timelineSlider = new JSlider(0, totalFrames, 0);
        timelineSlider.setBackground(TacticalTheme.CHASSIS);
        timelineSlider.setForeground(TacticalTheme.NAVY_ACCENT);
        timelineSlider.addChangeListener(e -> {
            if (timelineSlider.getValueIsAdjusting() || !isPlaying) {
                setFrame(timelineSlider.getValue(), false);
            }
        });
        bottomControlPanel.add(timelineSlider, BorderLayout.NORTH);

        // Row 2: Control Toolbar
        JToolBar transportBar = new JToolBar();
        transportBar.setFloatable(false);
        transportBar.setBackground(TacticalTheme.CHASSIS);
        transportBar.setBorder(BorderFactory.createEmptyBorder(2, 2, 2, 2));

        JButton btnStepBack10 = createTransportButton("-10", "Step back 10 frames", () -> stepFrames(-10));
        JButton btnStepBack5 = createTransportButton("-5", "Step back 5 frames", () -> stepFrames(-5));
        JButton btnStepBack1 = createTransportButton("-1", "Step back 1 frame", () -> stepFrames(-1));

        btnPlayPause = createTransportButton("▶ PLAY", "Start / pause playback", this::togglePlayPause);
        btnPlayPause.setBackground(TacticalTheme.NAVY_ACCENT);
        btnPlayPause.setForeground(TacticalTheme.NAVY_TEXT_LIGHT);

        JButton btnStepFwd1 = createTransportButton("+1", "Step forward 1 frame", () -> stepFrames(1));
        JButton btnStepFwd5 = createTransportButton("+5", "Step forward 5 frames", () -> stepFrames(5));
        JButton btnStepFwd10 = createTransportButton("+10", "Step forward 10 frames", () -> stepFrames(10));

        transportBar.add(btnStepBack10);
        transportBar.add(btnStepBack5);
        transportBar.add(btnStepBack1);
        transportBar.addSeparator(new Dimension(8, 20));
        transportBar.add(btnPlayPause);
        transportBar.addSeparator(new Dimension(8, 20));
        transportBar.add(btnStepFwd1);
        transportBar.add(btnStepFwd5);
        transportBar.add(btnStepFwd10);

        transportBar.addSeparator(new Dimension(16, 20));

        lblCurrentFrame = new JLabel("FRAME: 000 / 100");
        lblCurrentFrame.setFont(TacticalTheme.FONT_MONO_BOLD);
        lblCurrentFrame.setForeground(TacticalTheme.PRIMARY_TEXT);
        transportBar.add(lblCurrentFrame);

        transportBar.addSeparator(new Dimension(16, 20));

        lblCurrentTime = new JLabel("TIME: 0.0000 s");
        lblCurrentTime.setFont(TacticalTheme.FONT_MONO);
        lblCurrentTime.setForeground(TacticalTheme.SUBDUED_TEXT);
        transportBar.add(lblCurrentTime);

        transportBar.addSeparator(new Dimension(16, 20));

        JLabel lblFps = new JLabel("RATE: ");
        lblFps.setFont(TacticalTheme.FONT_SMALL);
        transportBar.add(lblFps);

        String[] fpsOptions = {"30 FPS", "60 FPS", "120 FPS", "240 FPS", "500 FPS", "1000 FPS", "5000 FPS", "10000 FPS"};
        cmbFps = new JComboBox<>(fpsOptions);
        cmbFps.setSelectedItem("60 FPS");
        cmbFps.setFont(TacticalTheme.FONT_SMALL);
        cmbFps.addActionListener(e -> {
            String selected = (String) cmbFps.getSelectedItem();
            if (selected != null) {
                currentFps = Double.parseDouble(selected.replace(" FPS", ""));
                updateTimeDisplay();
            }
        });
        transportBar.add(cmbFps);

        bottomControlPanel.add(transportBar, BorderLayout.CENTER);
        add(bottomControlPanel, BorderLayout.SOUTH);

        // 60Hz Playback Timer
        playbackTimer = new Timer(16, e -> {
            if (isPlaying) {
                if (currentFrame < totalFrames) {
                    setFrame(currentFrame + 1, true);
                } else {
                    setFrame(0, true);
                }
            }
        });
    }

    public void setPointMarkingListener(PointMarkingListener listener) {
        this.markingListener = listener;
    }

    public void setTotalFrames(int frames) {
        this.totalFrames = Math.max(1, frames);
        timelineSlider.setMaximum(totalFrames);
        updateFrameDisplay();
    }

    public int getCurrentFrame() {
        return currentFrame;
    }

    public double getCurrentTime() {
        return currentFrame / Math.max(1.0, currentFps);
    }

    public void setFrame(int frame, boolean updateSlider) {
        this.currentFrame = Math.max(0, Math.min(totalFrames, frame));
        if (updateSlider && timelineSlider.getValue() != currentFrame) {
            timelineSlider.setValue(currentFrame);
        }
        updateFrameDisplay();
        updateTimeDisplay();
        canvasCam1.repaint();
        canvasCam2.repaint();

        if (markingListener != null) {
            markingListener.onFrameChanged(currentFrame);
        }
    }

    public void stepFrames(int delta) {
        setFrame(currentFrame + delta, true);
    }

    public void togglePlayPause() {
        isPlaying = !isPlaying;
        if (isPlaying) {
            btnPlayPause.setText("⏸ PAUSE");
            playbackTimer.start();
        } else {
            btnPlayPause.setText("▶ PLAY");
            playbackTimer.stop();
        }
    }

    private void updateFrameDisplay() {
        lblCurrentFrame.setText(String.format("FRAME: %03d / %03d", currentFrame, totalFrames));
    }

    private void updateTimeDisplay() {
        lblCurrentTime.setText(String.format("TIME: %.4f s", getCurrentTime()));
    }

    private JButton createTransportButton(String text, String tooltip, Runnable action) {
        JButton btn = new JButton(text);
        btn.setFont(TacticalTheme.FONT_MONO_BOLD);
        btn.setToolTipText(tooltip);
        btn.setBackground(TacticalTheme.CHASSIS);
        btn.setForeground(TacticalTheme.PRIMARY_TEXT);
        btn.setFocusPainted(false);
        btn.setBorder(TacticalTheme.BORDER_BEVELED_RAISED);
        btn.addActionListener(e -> action.run());
        return btn;
    }

    /**
     * Individual camera viewport canvas with crosshair point marking and coordinate grid.
     */
    private final class CameraViewCanvas extends JPanel {
        private final int camIndex;
        private final String title;
        private final Color accentColor;
        private BufferedImage simulatedFeed;

        public CameraViewCanvas(int camIndex, String title, Color accentColor) {
            this.camIndex = camIndex;
            this.title = title;
            this.accentColor = accentColor;
            setBackground(TacticalTheme.LETTERBOX_STAGE);
            setBorder(BorderFactory.createLineBorder(TacticalTheme.DEEP_BORDER, 1));
            setCursor(Cursor.getPredefinedCursor(Cursor.CROSSHAIR_CURSOR));

            generateSimulatedFeed();

            addMouseListener(new MouseAdapter() {
                @Override
                public void mouseClicked(MouseEvent e) {
                    if (markingListener != null) {
                        markingListener.onPointMarked(camIndex, currentFrame, e.getX(), e.getY());
                    }
                    repaint();
                }
            });
        }

        private void generateSimulatedFeed() {
            simulatedFeed = new BufferedImage(640, 480, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = simulatedFeed.createGraphics();
            g.setColor(TacticalTheme.LETTERBOX_STAGE);
            g.fillRect(0, 0, 640, 480);

            // Subtle optical grid
            g.setColor(new Color(40, 40, 40));
            for (int x = 0; x < 640; x += 40) g.drawLine(x, 0, x, 480);
            for (int y = 0; y < 480; y += 40) g.drawLine(0, y, 640, y);

            // Center reticle
            g.setColor(new Color(60, 60, 60));
            g.drawOval(320 - 50, 240 - 50, 100, 100);
            g.drawLine(320 - 70, 240, 320 + 70, 240);
            g.drawLine(320, 240 - 70, 320, 240 + 70);

            g.dispose();
        }

        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            int w = getWidth();
            int h = getHeight();

            // Draw base video stage
            if (simulatedFeed != null) {
                g2.drawImage(simulatedFeed, 0, 0, w, h, null);
            }

            // Draw Camera Header
            g2.setColor(TacticalTheme.NAVY_PRESSED);
            g2.fillRect(0, 0, w, 24);
            g2.setColor(accentColor);
            g2.setFont(TacticalTheme.FONT_HEADER);
            g2.drawString(title, 8, 17);

            // Draw active track observations
            List<StereoTrackPoint> points = parentFrame.getTrackPoints();
            StereoTrackPoint currentPt = parentFrame.getTrackPointForFrame(currentFrame);

            // Draw all previous trajectory breadcrumbs
            g2.setColor(new Color(accentColor.getRed(), accentColor.getGreen(), accentColor.getBlue(), 80));
            for (StereoTrackPoint pt : points) {
                double u = camIndex == 1 ? pt.u1 : pt.u2;
                double v = camIndex == 1 ? pt.v1 : pt.v2;
                boolean hasPoint = camIndex == 1 ? pt.hasCam1 : pt.hasCam2;
                if (hasPoint) {
                    g2.fillOval((int) u - 3, (int) v - 3, 6, 6);
                }
            }

            // Draw active frame crosshairs
            if (currentPt != null) {
                double u = camIndex == 1 ? currentPt.u1 : currentPt.u2;
                double v = camIndex == 1 ? currentPt.v1 : currentPt.v2;
                boolean hasPoint = camIndex == 1 ? currentPt.hasCam1 : currentPt.hasCam2;

                if (hasPoint) {
                    int px = (int) Math.round(u);
                    int py = (int) Math.round(v);

                    g2.setColor(accentColor);
                    g2.setStroke(new BasicStroke(1.5f));
                    g2.drawOval(px - 8, py - 8, 16, 16);
                    g2.drawLine(px - 14, py, px + 14, py);
                    g2.drawLine(px, py - 14, px, py + 14);

                    // Sub-frame coordinate readout label
                    g2.setFont(TacticalTheme.FONT_MONO);
                    g2.drawString(String.format("(%.1f, %.1f) px", u, v), px + 12, py - 12);
                }
            }

            // Telemetry overlay in bottom-left
            g2.setColor(new Color(0, 0, 0, 180));
            g2.fillRect(4, h - 28, 160, 24);
            g2.setColor(Color.WHITE);
            g2.setFont(TacticalTheme.FONT_SMALL);
            g2.drawString(String.format("FRAME %03d | 640x480", currentFrame), 10, h - 12);

            g2.dispose();
        }
    }
}
