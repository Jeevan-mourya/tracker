/*
 * The org.opensourcephysics.media.xuggle package provides Xuggle
 * services including implementations of the Video and VideoRecorder interfaces.
 *
 * Copyright (c) 2026  Open Source Physics.
 *
 * This is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */
package org.opensourcephysics.media.xuggle;

import java.awt.Graphics;
import java.awt.image.BufferedImage;

import org.opensourcephysics.display.DrawingPanel;
import org.opensourcephysics.media.core.VideoAdapter;
import org.opensourcephysics.media.xuggle.math.StereoCalibrationManager;

/**
 * A minimal dual-stream video adapter for Tracker that renders synchronized frames
 * from a XuggleDualStreamPipeline.
 */
public class DualXuggleVideo extends VideoAdapter {

    private final XuggleDualStreamPipeline pipeline;
    private volatile XuggleDualStreamPipeline.FramePair currentPair;
    private final int frameCount;
    private int frameNumber;
    private StereoCalibrationManager.CalibrationData calibrationData;

    public DualXuggleVideo(XuggleDualStreamPipeline pipeline) {
        this(pipeline, Integer.MAX_VALUE);
    }

    public DualXuggleVideo(XuggleDualStreamPipeline pipeline, int frameCount) {
        super();
        this.pipeline = pipeline;
        this.frameCount = Math.max(frameCount, 1);
        setStartFrameNumber(0);
        setEndFrameNumber(this.frameCount - 1);
        this.frameNumber = 0;
        setPlaying(false);
    }

    @Override
    public void draw(DrawingPanel panel, Graphics g) {
        if (currentPair == null) {
            try {
                currentPair = pipeline.takePair();
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        if (currentPair != null && currentPair.getFrameA() != null && currentPair.getFrameB() != null) {
            BufferedImage imgA = currentPair.getFrameA().getImage();
            BufferedImage imgB = currentPair.getFrameB().getImage();
            if (imgA != null && imgB != null) {
                int width = imgA.getWidth() + imgB.getWidth();
                int height = Math.max(imgA.getHeight(), imgB.getHeight());
                BufferedImage stitched = new BufferedImage(width, height, BufferedImage.TYPE_3BYTE_BGR);
                java.awt.Graphics2D g2 = stitched.createGraphics();
                g2.drawImage(imgA, 0, 0, null);
                g2.drawImage(imgB, imgA.getWidth(), 0, null);
                g2.dispose();
                rawImage = stitched;
                isValidImage = false;
                isValidFilteredImage = false;
            }
        } else {
            BufferedImage image = currentPair == null ? null : (currentPair.getFrameA() == null ? null : currentPair.getFrameA().getImage());
            if (image != null) {
                rawImage = image;
                isValidImage = false;
                isValidFilteredImage = false;
            }
        }
        super.draw(panel, g);
    }

    @Override
    public int getFrameCount() {
        return frameCount;
    }

    @Override
    public int getFrameNumber() {
        return frameNumber;
    }

    @Override
    public void setFrameNumber(int n) {
        if (n == frameNumber) {
            return;
        }
        frameNumber = n;
        currentPair = null;
        firePropertyChange("frame", null, Integer.valueOf(frameNumber));
    }

    @Override
    public int getStartFrameNumber() {
        return startFrameNumber;
    }

    @Override
    public void setStartFrameNumber(int n) {
        startFrameNumber = Math.max(0, n);
    }

    @Override
    public int getEndFrameNumber() {
        return endFrameNumber;
    }

    @Override
    public void setEndFrameNumber(int n) {
        endFrameNumber = n;
    }

    @Override
    public double getFrameTime(int frame) {
        if (currentPair == null) {
            try {
                currentPair = pipeline.takePair();
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return -1;
            }
        }
        return currentPair == null ? -1 : currentPair.getTimestampMS();
    }

    @Override
    public double getFrameDuration(int frame) {
        return 0;
    }

    @Override
    public void step() {
        setFrameNumber(frameNumber + 1);
    }

    @Override
    public void back() {
        setFrameNumber(Math.max(0, frameNumber - 1));
    }

    @Override
    public void play() {
        super.play();
    }

    @Override
    public void stop() {
        super.stop();
    }

    @Override
    public void dispose() {
        pipeline.stop();
        super.dispose();
    }

    public XuggleDualStreamPipeline.FramePair getCurrentPair() {
        return currentPair;
    }

    public StereoCalibrationManager.CalibrationData getCalibrationData() {
        return calibrationData;
    }

    public void setCalibrationData(StereoCalibrationManager.CalibrationData calibrationData) {
        this.calibrationData = calibrationData;
    }

    public BufferedImage getCurrentLeftImage() {
        XuggleDualStreamPipeline.FramePair pair = getCurrentPair();
        if (pair == null || pair.getFrameA() == null) {
            return null;
        }
        return pair.getFrameA().getImage();
    }

    public BufferedImage getCurrentRightImage() {
        XuggleDualStreamPipeline.FramePair pair = getCurrentPair();
        if (pair == null || pair.getFrameB() == null) {
            return null;
        }
        return pair.getFrameB().getImage();
    }
}
