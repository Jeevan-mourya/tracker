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

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * A dual-stream Xuggle pipeline that decodes two videos in parallel and pairs frames
 * that are close in absolute timestamp.
 * <p>
 * This is a first-phase implementation for dual-camera 3D analysis.
 */
public class XuggleDualStreamPipeline {

    public static final int DEFAULT_MAX_TIMESTAMP_DIFFERENCE_MS = 34;

    private final FrameBufferManager bufferManager;
    private final XuggleStreamDecoder decoderA;
    private final XuggleStreamDecoder decoderB;
    private Thread threadA;
    private Thread threadB;
    private volatile boolean running;

    public XuggleDualStreamPipeline(String pathA, String pathB) throws IOException {
        this(pathA, pathB, DEFAULT_MAX_TIMESTAMP_DIFFERENCE_MS);
    }

    public XuggleDualStreamPipeline(String pathA, String pathB, int maxTimestampDifferenceMS) throws IOException {
        Objects.requireNonNull(pathA, "pathA");
        Objects.requireNonNull(pathB, "pathB");
        if (maxTimestampDifferenceMS < 0) {
            throw new IllegalArgumentException("maxTimestampDifferenceMS must be non-negative");
        }
        this.bufferManager = new FrameBufferManager(maxTimestampDifferenceMS);
        this.decoderA = new XuggleStreamDecoder(pathA, 0, bufferManager);
        this.decoderB = new XuggleStreamDecoder(pathB, 1, bufferManager);
    }

    public synchronized void start() {
        if (running) {
            return;
        }
        running = true;
        threadA = new Thread(decoderA, "XuggleStreamDecoder-A");
        threadB = new Thread(decoderB, "XuggleStreamDecoder-B");
        threadA.setDaemon(true);
        threadB.setDaemon(true);
        threadA.start();
        threadB.start();
    }

    public FramePair takePair() throws InterruptedException {
        return bufferManager.takePairedFrame();
    }

    public FramePair pollPair(long timeout, TimeUnit unit) throws InterruptedException {
        return bufferManager.pollPairedFrame(timeout, unit);
    }

    public void stop() {
        running = false;
        decoderA.requestStop();
        decoderB.requestStop();
        if (threadA != null) {
            threadA.interrupt();
        }
        if (threadB != null) {
            threadB.interrupt();
        }
        // join decoder threads to ensure clean shutdown
        try {
            if (threadA != null) {
                threadA.join(2000);
                if (threadA.isAlive()) {
                    threadA.interrupt();
                }
            }
            if (threadB != null) {
                threadB.join(2000);
                if (threadB.isAlive()) {
                    threadB.interrupt();
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } finally {
            running = false;
        }
    }

    /**
     * Request both decoders to seek to the given absolute timestamp (ms).
     * This only requests the decoder threads to jump to the target; callers
     * should typically call `flush(true)` after `seek()` to clear pending buffers.
     */
    public void seek(double timestampMS) {
        decoderA.requestSeek(timestampMS);
        decoderB.requestSeek(timestampMS);
        // decoders will observe seekRequested flags; no forced interrupt here.
    }

    /**
     * Convenience: request seek then flush pending buffers. If resetStats is true,
     * diagnostic counters are reset.
     */
    public void seekAndFlush(double timestampMS, boolean resetStats) {
        seek(timestampMS);
        flush(resetStats);
    }

    public boolean isRunning() {
        return running && (threadA != null || threadB != null);
    }

    public int getPendingFramesA() {
        return bufferManager.getPendingCount(0);
    }

    public int getPendingFramesB() {
        return bufferManager.getPendingCount(1);
    }

    /**
     * Flush pending buffers and paired queue; by default resets stats.
     */
    public void flush() {
        flush(true);
    }

    /**
     * Flush pending buffers and paired queue. If resetStats is true, resets internal counters.
     */
    public void flush(boolean resetStats) {
        bufferManager.flush(resetStats);
    }

    public long getMatchedCount() { return bufferManager.getMatchedCount(); }
    public long getDroppedCount() { return bufferManager.getDroppedCount(); }
    public double getMaxObservedDrift() { return bufferManager.getMaxObservedDrift(); }
    public long getPairedQueueDroppedCount() { return bufferManager.getPairedQueueDroppedCount(); }

    public static final class FramePair {
        private final XuggleFrameData frameA;
        private final XuggleFrameData frameB;

        public FramePair(XuggleFrameData frameA, XuggleFrameData frameB) {
            this.frameA = frameA;
            this.frameB = frameB;
        }

        public XuggleFrameData getFrameA() {
            return frameA;
        }

        public XuggleFrameData getFrameB() {
            return frameB;
        }

        public double getTimestampMS() {
            return (frameA.getTimestampMS() + frameB.getTimestampMS()) / 2.0;
        }
    }

    public static final class XuggleFrameData {
        private final int streamIndex;
        private final int frameNumber;
        private final double timestampMS;
        private final BufferedImage image;

        public XuggleFrameData(int streamIndex, int frameNumber, double timestampMS, BufferedImage image) {
            this.streamIndex = streamIndex;
            this.frameNumber = frameNumber;
            this.timestampMS = timestampMS;
            this.image = image;
        }

        public int getStreamIndex() {
            return streamIndex;
        }

        public int getFrameNumber() {
            return frameNumber;
        }

        public double getTimestampMS() {
            return timestampMS;
        }

        public BufferedImage getImage() {
            return image;
        }
    }

    private static final class FrameBufferManager {
        private int epoch = 0;
        private final int maxTimestampDifferenceMS;
        private final List<XuggleFrameData> pendingA = new ArrayList<>();
        private final List<XuggleFrameData> pendingB = new ArrayList<>();
        private static final int PAIRED_QUEUE_CAPACITY = 256;
        private final BlockingQueue<FramePair> pairedFrames = new LinkedBlockingQueue<>(PAIRED_QUEUE_CAPACITY);
        private boolean endOfStreamA;
        private boolean endOfStreamB;
        // simple diagnostics
        private long matchedCount = 0;
        private long droppedCount = 0;
        private long pairedQueueDroppedCount = 0;
        private double maxObservedDrift = 0.0;

        FrameBufferManager(int maxTimestampDifferenceMS) {
            this.maxTimestampDifferenceMS = maxTimestampDifferenceMS;
        }

        void addFrame(XuggleFrameData frame) {
            addFrame(frame, getEpoch());
        }

        void addFrame(XuggleFrameData frame, int frameEpoch) {
            synchronized (this) {
                if (frameEpoch != epoch) {
                    return; // discard stale in-flight frame from prior epoch/seek
                }
                List<XuggleFrameData> source = frame.getStreamIndex() == 0 ? pendingA : pendingB;
                List<XuggleFrameData> other = frame.getStreamIndex() == 0 ? pendingB : pendingA;
                XuggleFrameData bestMatch = findBestMatch(frame, other);
                if (bestMatch != null) {
                    other.remove(bestMatch);
                    double diff = Math.abs(frame.getTimestampMS() - bestMatch.getTimestampMS());
                    maxObservedDrift = Math.max(maxObservedDrift, diff);
                    matchedCount++;
                    FramePair p = frame.getStreamIndex() == 0 ? new FramePair(frame, bestMatch)
                            : new FramePair(bestMatch, frame);
                    boolean offered = pairedFrames.offer(p);
                    if (!offered) {
                        // paired queue full, record drop
                        pairedQueueDroppedCount++;
                        droppedCount++;
                    }
                } else {
                    source.add(frame);
                }
                pruneStaleFrames();
            }
        }

        private XuggleFrameData findBestMatch(XuggleFrameData frame, List<XuggleFrameData> otherFrames) {
            XuggleFrameData bestMatch = null;
            double bestDiff = Double.MAX_VALUE;
            for (XuggleFrameData other : otherFrames) {
                double diff = Math.abs(frame.getTimestampMS() - other.getTimestampMS());
                if (diff <= maxTimestampDifferenceMS && diff < bestDiff) {
                    bestDiff = diff;
                    bestMatch = other;
                }
            }
            return bestMatch;
        }

        private void pruneStaleFrames() {
            double cutoff = getLatestTimestamp() - Math.max(1000, maxTimestampDifferenceMS * 10);
            if (cutoff < 0) {
                return;
            }
            pruneList(pendingA, cutoff);
            pruneList(pendingB, cutoff);
        }

        private void pruneList(List<XuggleFrameData> list, double cutoff) {
            Iterator<XuggleFrameData> iterator = list.iterator();
            while (iterator.hasNext()) {
                XuggleFrameData frame = iterator.next();
                if (frame.getTimestampMS() < cutoff) {
                    iterator.remove();
                    droppedCount++;
                }
            }
        }

        private double getLatestTimestamp() {
            double latest = -Double.MAX_VALUE;
            for (XuggleFrameData frame : pendingA) {
                latest = Math.max(latest, frame.getTimestampMS());
            }
            for (XuggleFrameData frame : pendingB) {
                latest = Math.max(latest, frame.getTimestampMS());
            }
            return latest < 0 ? 0 : latest;
        }

        void signalEndOfStream(int streamIndex) {
            synchronized (this) {
                if (streamIndex == 0) {
                    endOfStreamA = true;
                } else {
                    endOfStreamB = true;
                }
                if (endOfStreamA && endOfStreamB) {
                    // no more incoming frames; release waiting consumers if possible
                    pairedFrames.add(new FramePair(null, null));
                }
            }
        }

        /**
         * Clears pending buffers and paired queue. If resetStats is true, also resets
         * internal diagnostic counters.
         */
        int getEpoch() {
            synchronized (this) { return epoch; }
        }

        void flush(boolean resetStats) {
            synchronized (this) {
                epoch++;
                pendingA.clear();
                pendingB.clear();
                pairedFrames.clear();
                if (resetStats) {
                    matchedCount = 0;
                    droppedCount = 0;
                    maxObservedDrift = 0.0;
                    pairedQueueDroppedCount = 0;
                }
            }
        }

        long getMatchedCount() { synchronized (this) { return matchedCount; } }
        long getDroppedCount() { synchronized (this) { return droppedCount; } }
        long getPairedQueueDroppedCount() { synchronized (this) { return pairedQueueDroppedCount; } }
        double getMaxObservedDrift() { synchronized (this) { return maxObservedDrift; } }

        FramePair takePairedFrame() throws InterruptedException {
            FramePair pair;
            while ((pair = pairedFrames.take()) != null) {
                if (pair.getFrameA() == null && pair.getFrameB() == null) {
                    return null;
                }
                return pair;
            }
            return null;
        }

        FramePair pollPairedFrame(long timeout, TimeUnit unit) throws InterruptedException {
            FramePair pair = pairedFrames.poll(timeout, unit);
            if (pair == null) {
                return null;
            }
            if (pair.getFrameA() == null && pair.getFrameB() == null) {
                return null;
            }
            return pair;
        }

        int getPendingCount(int streamIndex) {
            synchronized (this) {
                return streamIndex == 0 ? pendingA.size() : pendingB.size();
            }
        }
    }

    private static final class XuggleStreamDecoder implements Runnable {
        private final String path;
        private final int streamIndex;
        private final FrameBufferManager bufferManager;
        private volatile boolean stopRequested;
        private volatile boolean seekRequested;
        private volatile double seekTargetMS;

        XuggleStreamDecoder(String path, int streamIndex, FrameBufferManager bufferManager) {
            this.path = new java.io.File(path).getAbsolutePath();
            this.streamIndex = streamIndex;
            this.bufferManager = bufferManager;
        }

        void requestStop() { stopRequested = true; }
        void requestSeek(double timestampMS) { seekTargetMS = timestampMS; seekRequested = true; }

        @Override
        public void run() {
            XuggleVideo video = null;
            try {
                System.out.println("[DEBUG-" + streamIndex + "] Opening XuggleVideo for: " + path);
                video = new XuggleVideo(path, null);
                System.out.println("[DEBUG-" + streamIndex + "] Successfully instantiated XuggleVideo.");

                if (!video.isFullyLoaded()) {
                    System.out.println("[DEBUG-" + streamIndex + "] Pre-loading frames into memory...");
                    while (!stopRequested && video.loadMoreFrames(500)) {}
                }
                
                int frameCount = video.getFrameCount();
                System.out.println("[DEBUG-" + streamIndex + "] Total frames detected: " + frameCount);
                
                if (frameCount <= 0) {
                    System.err.println("[FAIL-" + streamIndex + "] Native Xuggler failed to decode any frames.");
                }

                int index = 0;
                double frameDuration = (frameCount > 1) ? (video.getFrameTime(1) - video.getFrameTime(0)) : (1000.0 / 30.0);
                if (frameDuration <= 0) frameDuration = 1000.0 / 30.0;

                while (index < frameCount && !stopRequested) {
                    if (seekRequested) {
                        int target = (int) Math.round(seekTargetMS / frameDuration);
                        index = Math.max(0, Math.min(target, frameCount - 1));
                        seekRequested = false;
                    }
                    int frameEpoch = bufferManager.getEpoch();
                    BufferedImage image = video.getImage(index);
                    if (image == null) {
                        System.out.println("[DEBUG-" + streamIndex + "] getImage(" + index + ") returned null! (stopRequested=" + stopRequested + ")");
                        break;
                    }
                    if (seekRequested || frameEpoch != bufferManager.getEpoch()) {
                        continue; // seek or flush intervened during decode; discard frame
                    }
                    bufferManager.addFrame(new XuggleFrameData(streamIndex, index, video.getFrameTime(index), image), frameEpoch);
                    
                    if (index == 0) {
                        System.out.println("[DEBUG-" + streamIndex + "] Queued first frame successfully.");
                    }
                    index++;
                }
            } catch (Throwable ex) {
                // Catching Throwable exposes native UnsatisfiedLinkError crashes
                System.err.println("[ERROR-" + streamIndex + "] Thread died due to fatal error:");
                ex.printStackTrace();
            } finally {
                if (video != null) video.dispose();
                bufferManager.signalEndOfStream(streamIndex);
                System.out.println("[DEBUG-" + streamIndex + "] Stream decoder thread finished.");
            }
        }
    }
}