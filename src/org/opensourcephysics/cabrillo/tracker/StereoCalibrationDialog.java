package org.opensourcephysics.cabrillo.tracker;

import org.opensourcephysics.media.core.Video;
import org.opensourcephysics.media.xuggle.DualXuggleVideo;
import org.opensourcephysics.media.xuggle.math.StereoCalibrationManager;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;

public class StereoCalibrationDialog extends JDialog {

    private TrackerPanel trackerPanel;

    public StereoCalibrationDialog(TFrame owner, TrackerPanel panel) {
        super(owner, "Stereo 3D Calibration", true);
        this.trackerPanel = panel;

        initUI();

        setSize(450, 300);
        setLocationRelativeTo(owner);
    }

    private void initUI() {
        setLayout(new BorderLayout(10, 10));

        // 1. Instructional text
        JTextArea instructions = new JTextArea("Instructions: Advance the video to a frame where the calibration checkerboard is clearly visible in both the left and right camera streams. Click 'Run Calibration' to generate the 3D projection matrices.");
        instructions.setWrapStyleWord(true);
        instructions.setLineWrap(true);
        instructions.setEditable(false);
        instructions.setBackground(getBackground());
        instructions.setBorder(BorderFactory.createEmptyBorder(15, 15, 10, 15));
        add(instructions, BorderLayout.NORTH);

        // 2. Center Panel for Grid Info
        JPanel centerPanel = new JPanel();
        centerPanel.add(new JLabel("Current Grid Target: 6 x 9 (Default)"));
        add(centerPanel, BorderLayout.CENTER);

        // 3. Bottom Buttons
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton btnRun = new JButton("Run Calibration");
        JButton btnCancel = new JButton("Cancel");

        btnRun.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                runCalibration();
            }
        });

        btnCancel.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                dispose();
            }
        });

        buttonPanel.add(btnRun);
        buttonPanel.add(btnCancel);
        add(buttonPanel, BorderLayout.SOUTH);
    }

    private void runCalibration() {
        Video video = trackerPanel.getVideo();
        
        // 1. Validate that we are working with a 3D Dual Stream Video
        if (!(video instanceof DualXuggleVideo)) {
            JOptionPane.showMessageDialog(this,
                    "Error: The loaded video is not a Dual-Stream video.",
                    "Calibration Failed", JOptionPane.ERROR_MESSAGE);
            return;
        }

        DualXuggleVideo dualVideo = (DualXuggleVideo) video;
        BufferedImage leftImage = dualVideo.getCurrentLeftImage();
        BufferedImage rightImage = dualVideo.getCurrentRightImage();

        if (leftImage == null || rightImage == null) {
            JOptionPane.showMessageDialog(this,
                    "Error: Could not retrieve left/right frames. Please ensure the video is playing.",
                    "Calibration Failed", JOptionPane.ERROR_MESSAGE);
            return;
        }

        // 2. Set grid geometry parameters (rows, columns)
        int rows = 6;
        int cols = 9;

        // Use the old Point2D array signatures to match the current math engine
        Point2D[] leftCorners = new Point2D[rows * cols];
        Point2D[] rightCorners = new Point2D[rows * cols];

        // ---------------------------------------------------------
        // FIX: Create an instance of the manager!
        StereoCalibrationManager manager = new StereoCalibrationManager();
        // ---------------------------------------------------------

        // 3. Hunt for the chessboard corners in both images using the instance
        boolean foundLeft = manager.findCalibrationPattern(leftImage, rows, cols, leftCorners);
        boolean foundRight = manager.findCalibrationPattern(rightImage, rows, cols, rightCorners);

        if (!foundLeft || !foundRight) {
            JOptionPane.showMessageDialog(this,
                    "Could not detect the " + cols + "x" + rows + " chessboard in both camera views.\n" +
                    "Make sure the entire pattern is clearly visible and unobstructed.",
                    "Calibration Failed", JOptionPane.WARNING_MESSAGE);
            return;
        }

        // 4. Wrap coordinates into lists for the math engine
        List<Point2D[]> leftList = new ArrayList<>();
        List<Point2D[]> rightList = new ArrayList<>();
        leftList.add(leftCorners);
        rightList.add(rightCorners);

        // 5. Execute core OpenCV Math Calibration (using image width/height)
        try {
            StereoCalibrationManager.CalibrationData calibData = 
                manager.calibrate(leftList, rightList, leftImage.getWidth(), leftImage.getHeight());

            // 6. Save matrices to the Tracker session state
            Stereo3DState state = trackerPanel.getStereo3DState();
            if (state == null) {
                state = new Stereo3DState();
                trackerPanel.setStereo3DState(state);
            }
            state.setCalibrationData(calibData);

            JOptionPane.showMessageDialog(this,
                    "3D Space Calibrated Successfully!\nProjection matrices generated.",
                    "Calibration Success", JOptionPane.INFORMATION_MESSAGE);

            dispose(); // Close window on success

        } catch (Exception ex) {
            JOptionPane.showMessageDialog(this,
                    "Mathematical error during matrix generation:\n" + ex.getMessage(),
                    "Calibration Error", JOptionPane.ERROR_MESSAGE);
        }
    }
}