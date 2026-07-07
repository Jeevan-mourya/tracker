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
    public static void main(String[] args) {
        try {
            long ticks;
            try {
                // try C-style function name (older API)
                ticks = opencv_core.cvGetTickCount();
            } catch (Throwable e1) {
                try {
                    // try the newer getTickCount if available
                    ticks = opencv_core.getTickCount();
                } catch (Throwable e2) {
                    // fallback: if nothing else available, report failure
                    System.err.println("Unable to call OpenCV tick function: " + e2.getMessage());
                    System.exit(2);
                    return;
                }
            }
            System.out.println("OpenCV tick count: " + ticks);
            System.out.println("JavaCV native bridge appears to be working.");
        } catch (UnsatisfiedLinkError ule) {
            System.err.println("Native library load failed: " + ule.getMessage());
            ule.printStackTrace();
            System.exit(3);
        }
    }
}
