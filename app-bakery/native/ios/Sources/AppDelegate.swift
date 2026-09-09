import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // A plain window rather than a scene manifest: the app is a single full-screen surface
        // and has no multi-window, state-restoration or shortcut behaviour to describe.
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebHostViewController()
        window.makeKeyAndVisible()
        self.window = window

        // The game is played in short sittings with long pauses while a child thinks; the idle
        // timer would otherwise dim the screen mid-question.
        application.isIdleTimerDisabled = true
        return true
    }
}
