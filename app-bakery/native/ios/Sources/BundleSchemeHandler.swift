import UIKit
import WebKit

/// Serves the bundled web build over a real custom scheme instead of `file://`.
///
/// This exists for one reason: **`localStorage` is the entire save system**, and a `WKWebView`
/// loading a `file://` URL gets an opaque origin, under which storage access is unreliable across
/// iOS versions — sometimes empty, sometimes throwing. Giving the page a normal origin
/// (`bakery://app/`) gives it a normal, persistent storage partition, which is exactly what
/// Capacitor and Cordova ended up doing for the same reason.
///
/// It also means every request the page makes is resolved against the app bundle by this class.
/// There is no code path from the page to the network, which for a children's app is worth
/// having as a structural property rather than a promise.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "bakery"
    static let host = "app"
    static var rootURL: URL { URL(string: "\(scheme)://\(host)/index.html")! }

    /// The `www` folder copied out of the web build at package time.
    private let root: URL

    /// Requests still in flight, so a completion never lands on a cancelled task.
    private var active = Set<ObjectIdentifier>()
    private let lock = NSLock()

    init?(resourceName: String = "www") {
        guard let root = Bundle.main.url(forResource: resourceName, withExtension: nil) else {
            return nil
        }
        self.root = root
        super.init()
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        lock.lock(); active.insert(id); lock.unlock()

        guard let url = task.request.url, let resolved = fileURL(for: url) else {
            finish(task, id: id, with: .failure(URLError(.fileDoesNotExist)))
            return
        }

        do {
            let data = try Data(contentsOf: resolved)
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Content-Type": Self.mimeType(for: resolved.pathExtension),
                    "Content-Length": String(data.count),
                    // Same-origin in practice, but Vite emits `crossorigin` on its module script
                    // and this removes any ambiguity about how that is treated.
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store",
                ]
            )!
            finish(task, id: id, with: .success((response, data)))
        } catch {
            finish(task, id: id, with: .failure(error))
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        lock.lock(); active.remove(id); lock.unlock()
    }

    // MARK: - Internals

    /// Map a `bakery://app/<path>` URL onto a file inside the bundled `www` folder.
    ///
    /// Path traversal is refused by resolving the candidate and checking it is still inside the
    /// root, rather than by string-matching `..`.
    private func fileURL(for url: URL) -> URL? {
        guard url.host == Self.host else { return nil }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let candidate = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard candidate.path.hasPrefix(root.standardizedFileURL.path) else { return nil }
        guard FileManager.default.fileExists(atPath: candidate.path) else { return nil }
        return candidate
    }

    private enum Outcome {
        case success((HTTPURLResponse, Data))
        case failure(Error)
    }

    private func finish(_ task: WKURLSchemeTask, id: ObjectIdentifier, with outcome: Outcome) {
        lock.lock()
        let stillActive = active.contains(id)
        active.remove(id)
        lock.unlock()
        // Completing a stopped task is a hard crash in WebKit, not an ignored no-op.
        guard stillActive else { return }

        switch outcome {
        case let .success((response, data)):
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        case let .failure(error):
            task.didFailWithError(error)
        }
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "ico": return "image/x-icon"
        case "wasm": return "application/wasm"
        default: return "application/octet-stream"
        }
    }
}
