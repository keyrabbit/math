import UIKit
import WebKit

/// Hosts the game.
///
/// The web layer already knows about safe areas (`viewport-fit=cover` plus
/// `env(safe-area-inset-*)` throughout the CSS), so the web view is deliberately pinned to the
/// **full** bounds rather than the safe area — insetting it here would double-pad every screen
/// and leave black bars beside the canvas.
final class WebHostViewController: UIViewController {

    private var webView: WKWebView!
    private var schemeHandler: BundleSchemeHandler!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0x15 / 255, green: 0x0A / 255, blue: 0x06 / 255, alpha: 1)

        guard let handler = BundleSchemeHandler() else {
            presentFatal("The bundled web build is missing. Run `npm run build:native` and re-package.")
            return
        }
        schemeHandler = handler

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
        // The game synthesises all of its audio; it must be allowed to start on the first tap
        // rather than requiring a separate gesture per sound.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // Kill the behaviours that make a web view feel like a browser rather than an app:
        // long-press callouts, text selection, and double-tap-to-zoom.
        let hardening = """
        (function () {
          var css = document.createElement('style');
          css.textContent =
            '*{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}' +
            'html,body{overscroll-behavior:none;touch-action:manipulation;}';
          document.documentElement.appendChild(css);
          document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, {passive:false});
        })();
        """
        config.userContentController.addUserScript(
            WKUserScript(source: hardening, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.allowsBackForwardNavigationGestures = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.load(URLRequest(url: BundleSchemeHandler.rootURL))

        NotificationCenter.default.addObserver(
            self, selector: #selector(flush),
            name: UIApplication.willResignActiveNotification, object: nil)
    }

    /// Mirror the web layer's own `pagehide` flush. On iOS the page is often suspended without
    /// `pagehide` ever firing, so without this a session's last few answers can be lost.
    @objc private func flush() {
        webView?.evaluateJavaScript(
            "(function(){try{window.crumb.store.recordPlaytime();window.crumb.store.flush();}catch(e){}})()"
        )
    }

    // Full-bleed, and the game manages its own idle state.
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .all }

    private func presentFatal(_ message: String) {
        let label = UILabel(frame: view.bounds.insetBy(dx: 24, dy: 24))
        label.text = message
        label.numberOfLines = 0
        label.textColor = .white
        label.textAlignment = .center
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(label)
    }
}

extension WebHostViewController: WKNavigationDelegate, WKUIDelegate {

    /// Refuse to navigate anywhere except the bundled app. There is nowhere legitimate to go, and
    /// for a children's app that is worth enforcing rather than assuming.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let url = navigationAction.request.url
        decisionHandler(url?.scheme == BundleSchemeHandler.scheme ? .allow : .cancel)
    }

    /// `window.open` is never used by the game; deny it rather than spawning a second web view.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        nil
    }
}
