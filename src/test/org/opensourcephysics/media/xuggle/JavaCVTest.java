package test.org.opensourcephysics.media.xuggle;

import java.util.logging.Logger;
import org.bytedeco.opencv.global.opencv_core;

/**
 * Minimal JavaCV native-binding sanity test.
 *
 * Compile with:
 *   javac -cp "unused/osp.jar:libraries/*" src/test/JavaCVTest.java -d out
 * Run with:
 *   java -cp "out:unused/osp.jar:libraries/*" JavaCVTest
 *
 * This program attempts to call an OpenCV native function (tick counter).
 */
public class JavaCVTest {

    private static final Logger logger = Logger.getLogger(JavaCVTest.class.getName());
    public static void main(String[] args) {
        long ticks = getOpenCVTickCount();
        logger.info(() -> "OpenCV tick count: " + ticks);
        logger.info(() -> "JavaCV native bridge appears to be working.");
    }

    private static long getOpenCVTickCount() {
        try {
            return opencv_core.cvGetTickCount();
        } catch (UnsatisfiedLinkError | NoSuchMethodError firstException) {
            try {
                return opencv_core.getTickCount();
            } catch (UnsatisfiedLinkError | NoSuchMethodError secondException) {
                logger.severe(() -> "Unable to call OpenCV tick function: " + secondException.getMessage());
                throw new AssertionError("Test failed due to native tick function failure", secondException);
            }
        }
    }
}
