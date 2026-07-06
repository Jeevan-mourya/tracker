package test;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import org.opensourcephysics.media.xuggle.XuggleDualStreamPipeline;

/**
 * Command-line test harness for the Xuggle dual-stream synchronization pipeline.
 *
 * This test is designed to run from the tracker project root and defaults to a
 * zero-drift baseline by using the same local video file for both streams.
 *
 * Usage:
 *   java -cp src:unused/osp.jar test.XuggleDualStreamPipelineTest
 *   java -cp src:unused/osp.jar test.XuggleDualStreamPipelineTest <videoA> <videoB>
 */
public class XuggleDualStreamPipelineTest {

    private static final int DEFAULT_MAX_DRIFT_MS = 34;
    private static final int DEFAULT_MEMORY_LOG_INTERVAL_SEC = 10;
    private static final String BASELINE_VIDEO = "src/test/duet.mp4";

    public static void main(String[] args) {
        String videoA;
        String videoB;
        int maxDriftMS = DEFAULT_MAX_DRIFT_MS;
        int memoryLogIntervalSec = DEFAULT_MEMORY_LOG_INTERVAL_SEC;

        if (args.length == 0) {
            File baseline = new File(BASELINE_VIDEO);
            if (!baseline.exists()) {
                System.err.println("[ERROR] Baseline video not found: " + BASELINE_VIDEO);
                System.exit(1);
            }
            videoA = BASELINE_VIDEO;
            videoB = BASELINE_VIDEO;
            System.out.println("[INFO] Running zero-drift baseline test using " + BASELINE_VIDEO + " for both streams.");
        } else if (args.length >= 2) {
            videoA = args[0];
            videoB = args[1];
            if (args.length > 2) {
                maxDriftMS = Integer.parseInt(args[2]);
            }
            if (args.length > 3) {
                memoryLogIntervalSec = Integer.parseInt(args[3]);
            }
        } else {
            System.err.println("Usage: java test.XuggleDualStreamPipelineTest [<videoA> <videoB> [maxDriftMS] [memoryLogIntervalSec]]");
            System.exit(1);
            return;
        }

        try {
            runTest(videoA, videoB, maxDriftMS, memoryLogIntervalSec);
        } catch (Exception ex) {
            System.err.println("[FAIL] Unexpected exception: " + ex.getMessage());
            ex.printStackTrace(System.err);
            System.exit(2);
        }
    }

    private static void runTest(String videoA, String videoB, int maxDriftMS, int memoryLogIntervalSec)
            throws IOException, InterruptedException {
        XuggleDualStreamPipeline pipeline = new XuggleDualStreamPipeline(videoA, videoB, maxDriftMS);
        Runtime runtime = Runtime.getRuntime();

        Thread memoryLogger = new Thread(() -> {
            try {
                while (!Thread.currentThread().isInterrupted()) {
                    printMemoryUsage(runtime);
                    TimeUnit.SECONDS.sleep(memoryLogIntervalSec);
                }
            } catch (InterruptedException ignore) {
                // test ending
            }
        }, "MemoryLogger");
        memoryLogger.setDaemon(true);
        memoryLogger.start();

        long startTime = System.currentTimeMillis();
        double maxObservedDrift = 0;
        long pairCount = 0;

        pipeline.start();
        System.out.println("[INFO] Pipeline started");

        try {
            while (true) {
                XuggleDualStreamPipeline.FramePair pair = pipeline.pollPair(5, TimeUnit.SECONDS);
                if (pair == null) {
                    System.out.println("[INFO] No more synchronized pairs (EOS reached).");
                    break;
                }

                pairCount++;
                double drift = Math.abs(pair.getFrameA().getTimestampMS() - pair.getFrameB().getTimestampMS());
                maxObservedDrift = Math.max(maxObservedDrift, drift);

                if (drift > maxDriftMS) {
                    System.err.printf(Locale.US,
                            "[ERROR] Drift exceeded threshold at pair %d: drift=%.3f ms, threshold=%d ms%n",
                            pairCount, drift, maxDriftMS);
                    break;
                }

                if (pairCount % 50 == 0) {
                    System.out.printf(Locale.US,
                            "[PROGRESS] pairs=%d, currentDrift=%.3f ms, maxDrift=%.3f ms, pendingA=%d, pendingB=%d%n",
                            pairCount, drift, maxObservedDrift, pipeline.getPendingFramesA(), pipeline.getPendingFramesB());
                }

                // exercise flush once during the test to validate clearing behavior
                if (pairCount == 120) {
                    System.out.println("[TEST] flushing buffers and resetting stats");
                    pipeline.flush(true);
                    System.out.printf(Locale.US, "[TEST] matched=%d dropped=%d maxDrift=%.3f pendingA=%d pendingB=%d%n",
                            pipeline.getMatchedCount(), pipeline.getDroppedCount(), pipeline.getMaxObservedDrift(),
                            pipeline.getPendingFramesA(), pipeline.getPendingFramesB());
                }

                validateFrame(pair.getFrameA(), "A", pairCount);
                validateFrame(pair.getFrameB(), "B", pairCount);
            }
        } finally {
            pipeline.stop();
            memoryLogger.interrupt();
            memoryLogger.join(1000);
        }

        long elapsedMS = System.currentTimeMillis() - startTime;
        System.out.println("[INFO] Pipeline shutdown complete.");
        System.out.println("[RESULT] totalPairs=" + pairCount);
        System.out.printf(Locale.US, "[RESULT] maxObservedDrift=%.3f ms (threshold=%d ms)%n", maxObservedDrift,
                maxDriftMS);
        System.out.println("[RESULT] elapsedTimeMS=" + elapsedMS);

        if (pairCount == 0) {
            System.err.println("[FAIL] No synchronized frame pairs were produced.");
            System.exit(3);
        }
        if (maxObservedDrift > maxDriftMS) {
            System.err.println("[FAIL] Drift threshold exceeded.");
            System.exit(4);
        }

        printMemoryUsage(runtime);
        System.out.println("[SUCCESS] XuggleDualStreamPipelineTest completed successfully.");
    }

    private static void validateFrame(XuggleDualStreamPipeline.XuggleFrameData frame, String streamName, long pairCount) {
        if (frame == null) {
            throw new IllegalStateException("Received null frame for stream " + streamName + " at pair " + pairCount);
        }
        BufferedImage image = frame.getImage();
        if (image == null) {
            throw new IllegalStateException("Decoded image is null for stream " + streamName + " at pair " + pairCount);
        }
        if (image.getWidth() <= 0 || image.getHeight() <= 0) {
            throw new IllegalStateException(
                    "Decoded image has invalid dimensions for stream " + streamName + " at pair " + pairCount);
        }
    }

    private static void printMemoryUsage(Runtime runtime) {
        long total = runtime.totalMemory();
        long free = runtime.freeMemory();
        long used = total - free;
        System.out.printf(Locale.US,
                "[MEMORY] used=%s free=%s total=%s max=%s%n",
                formatBytes(used), formatBytes(free), formatBytes(total), formatBytes(runtime.maxMemory()));
    }

    private static String formatBytes(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        double value = bytes;
        String[] units = {"B", "KB", "MB", "GB"};
        int index = 0;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024;
            index++;
        }
        return String.format(Locale.US, "%.2f %s", value, units[index]);
    }
}
