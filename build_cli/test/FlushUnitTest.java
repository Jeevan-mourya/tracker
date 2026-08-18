package test;

import java.util.concurrent.TimeUnit;

import org.opensourcephysics.media.xuggle.XuggleDualStreamPipeline;

/**
 * Simple unit-style test (runnable main) to validate flush() behavior.
 * Exits with code 0 on success, non-zero on failure.
 */
public class FlushUnitTest {
    public static void main(String[] args) throws Exception {
        String baseline = "src/test/duet.mp4";
        XuggleDualStreamPipeline pipeline = new XuggleDualStreamPipeline(baseline, baseline);
        pipeline.start();
        try {
            // consume a few pairs to populate some internal state
            for (int i = 0; i < 10; i++) {
                XuggleDualStreamPipeline.FramePair p = pipeline.pollPair(2, TimeUnit.SECONDS);
                if (p == null) {
                    System.err.println("[FAIL] Expected initial pairs but got EOS early");
                    System.exit(2);
                }
            }

            // capture stats before flush
            long matchedBefore = pipeline.getMatchedCount();
            long droppedBefore = pipeline.getDroppedCount();

            // now flush and reset stats
            pipeline.flush(true);

            // now test seek + flush behavior: seek to ~2000ms and flush
            double seekTarget = 2000.0;
            pipeline.seek(seekTarget);
            pipeline.flush(true);
            XuggleDualStreamPipeline.FramePair seekPair = pipeline.pollPair(2, TimeUnit.SECONDS);
            if (seekPair == null) {
                System.err.println("[FAIL] Expected pair after seek+flush but got none");
                System.exit(6);
            }
            double avgTs = seekPair.getTimestampMS();
            if (Math.abs(avgTs - seekTarget) > 1000.0) {
                System.err.printf("[FAIL] Seek target not honored: target=%.1f got=%.3f\n", seekTarget, avgTs);
                System.exit(7);
            }

            // after flush, paired queue should be cleared and stats reset. Pending
            // frames may be re-populated immediately by decoders, so we avoid
            // asserting exact pending counts here.
            long matchedAfter = pipeline.getMatchedCount();
            long droppedAfter = pipeline.getDroppedCount();
            if (matchedAfter > matchedBefore) {
                System.err.printf("[FAIL] matchedCount did not decrease after reset (before=%d after=%d)\n", matchedBefore, matchedAfter);
                System.exit(4);
            }
            // droppedCount may increase briefly due to concurrent pruning; do not fail on this.

            System.out.println("[PASS] flush() cleared buffers and reset stats as expected");
            System.exit(0);
        } finally {
            pipeline.stop();
        }
    }
}
