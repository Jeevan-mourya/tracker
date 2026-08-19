package org.opensourcephysics.cabrillo.tracker;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class StereoCalibrationDialog extends JDialog {

    private TrackerPanel trackerPanel;

    public StereoCalibrationDialog(TFrame owner, TrackerPanel panel) {
        // 'true' makes the dialog modal (blocks the main window until closed)
        super(owner, "Stereo 3D Calibration", true);
        this.trackerPanel = panel;

        initUI();

        setSize(450, 300);
        setLocationRelativeTo(owner); // Centers the popup on the screen
    }

    private void initUI() {
        setLayout(new BorderLayout(10, 10));

        // 1. Instructional text at the top
        JTextArea instructions = new JTextArea("Instructions: Advance the video to a frame where the calibration checkerboard is clearly visible in both the left and right camera streams. Click 'Run Calibration' to generate the 3D projection matrices.");
        instructions.setWrapStyleWord(true);
        instructions.setLineWrap(true);
        instructions.setEditable(false);
        instructions.setBackground(getBackground());
        instructions.setBorder(BorderFactory.createEmptyBorder(15, 15, 10, 15));
        add(instructions, BorderLayout.NORTH);

        // 2. Center Panel (Future home for dynamic grid size inputs)
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
                dispose(); // Closes the window
            }
        });

        buttonPanel.add(btnRun);
        buttonPanel.add(btnCancel);
        add(buttonPanel, BorderLayout.SOUTH);
    }

    private void runCalibration() {
        // This is a placeholder! In Phase 2, we will hook this button directly
        // to your StereoCalibrationManager math engine.
        JOptionPane.showMessageDialog(this,
                "Calibration UI successfully connected!\n(Mathematical engine hookup pending)",
                "Stereo 3D Engine",
                JOptionPane.INFORMATION_MESSAGE);
        dispose();
    }
}