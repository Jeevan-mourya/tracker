package org.opensourcephysics.media.xuggle;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;

/**
 * A simple in-memory stub of XuggleVideo for test purposes only.
 * Generates synthetic frames at a nominal framerate so the pipeline can be exercised
 * without native Xuggle dependencies.
 */
public class XuggleVideoTest {

    private static final int WIDTH = 320;
    private static final int HEIGHT = 240;

    private final int frameCount;
    private final double fps;
    private final double frameDurationMS;

    public XuggleVideoTest(String path) {
        // Derive fps heuristically from filename: if contains "2997" use 29.97, "30" use 30
        if (path != null && path.contains("2997")) {
            this.fps = 29.97;
        } else if (path != null && path.contains("29.97")) {
            this.fps = 29.97;
        } else if (path != null && path.contains("24")) {
            this.fps = 24.0;
        } else {
            this.fps = 30.0;
        }
        this.frameDurationMS = 1000.0 / fps;
        this.frameCount = 300; // 10 seconds @ 30fps
    }

    public boolean isFullyLoaded() {
        return true;
    }

    public boolean loadMoreFrames() {
        return false;
    }

    public int getFrameCount() {
        return frameCount;
    }

    public BufferedImage getImage(int i) {
        if (i < 0 || i >= frameCount) return null;
        BufferedImage img = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.DARK_GRAY);
        g.fillRect(0, 0, WIDTH, HEIGHT);
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 24));
        g.drawString("Frame " + i, 20, 40);
        g.drawString(String.format("t=%.2fms", getFrameTime(i)), 20, 80);
        g.dispose();
        return img;
    }

    public double getFrameTime(int i) {
        return i * frameDurationMS;
    }

    public void dispose() {
        // no-op
    }


    public static void main(String[] args) {
        String testPath = (args.length > 0) ? args[0] : "synthetic_2997fps.mp4";
        XuggleVideoTest stub = new XuggleVideoTest(testPath);
        System.out.println("[INFO] Instantiated XuggleVideoTest stub for: " + testPath);
        System.out.printf(java.util.Locale.US, "[INFO] Detected FPS: %.2f | Frame Duration: %.2f ms | Total Frames: %d%n",
                stub.fps, stub.frameDurationMS, stub.getFrameCount());

        BufferedImage frame0 = stub.getImage(0);
        BufferedImage frame150 = stub.getImage(150);

        if (frame0 == null || frame150 == null) {
            System.err.println("[FAIL] Failed to generate synthetic frame buffers.");
            System.exit(1);
        }

        if (frame0.getWidth() != WIDTH || frame0.getHeight() != HEIGHT) {
            System.err.printf("[FAIL] Invalid dimensions: %dx%d (expected %dx%d)%n",
                    frame0.getWidth(), frame0.getHeight(), WIDTH, HEIGHT);
            System.exit(2);
        }

        System.out.printf("[INFO] Sample frame 150 rendered successfully at t=%.2f ms (dim: %dx%d)%n",
                stub.getFrameTime(150), frame150.getWidth(), frame150.getHeight());
        System.out.println("[SUCCESS] XuggleVideoTest stub verified successfully.");
    }
}
