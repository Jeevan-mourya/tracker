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
public class XuggleVideo {

    private final String path;
    private final int frameCount;
    private final double fps;
    private final double frameDurationMS;
    private final int width = 320;
    private final int height = 240;

    public XuggleVideo(String path, Object control) throws IOException {
        this.path = path;
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

    public boolean loadMoreFrames(int n) throws IOException {
        return false;
    }

    public int getFrameCount() {
        return frameCount;
    }

    public BufferedImage getImage(int i) {
        if (i < 0 || i >= frameCount) return null;
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.DARK_GRAY);
        g.fillRect(0, 0, width, height);
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

}
