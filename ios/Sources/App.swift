import UIKit
import WebKit

/// Les Petits Lecteurs — application iPhone / iPad.
/// Charge l'application en ligne (toujours à jour). Sans connexion : version intégrée.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = WebViewController()
        w.makeKeyAndVisible()
        window = w
        return true
    }
}

/// Sert les fichiers intégrés (dossier www) via le schéma app:// pour que les leçons se chargent hors ligne.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url,
              let root = Bundle.main.resourceURL?.appendingPathComponent("www") else {
            task.didFailWithError(URLError(.badURL)); return
        }
        var path = url.path
        if path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst()))
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json",
                     "mp3": "audio/mpeg", "png": "image/png", "woff2": "font/woff2", "svg": "image/svg+xml"]
        let mime = types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": mime, "Content-Length": String(data.count)])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let remote = URL(string: "https://mansstyle59.github.io/les-petits-lecteurs/app/?mode=mobile&app=ios")!
    private let local = URL(string: "app://local/app/index.html?mode=mobile&app=ios")!
    private var web: WKWebView!
    private var fellBack = false

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "app")
        cfg.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        web.scrollView.contentInsetAdjustmentBehavior = .never   // la page gère elle-même la zone de sécurité
        web.scrollView.bounces = false
        web.isOpaque = true
        web.backgroundColor = .white
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: remote, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 8))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    // Pas de connexion : version intégrée
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fallBack()
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fallBack()
    }
    private func fallBack() {
        guard !fellBack else { return }
        fellBack = true
        web.load(URLRequest(url: local))
    }

    // Espace enfant : aucune sortie vers d'autres sites
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let host = action.request.url?.host ?? ""
        let scheme = action.request.url?.scheme ?? ""
        decisionHandler(scheme == "app" || host == "mansstyle59.github.io" || scheme == "about" ? .allow : .cancel)
    }

    // Micro pour l'exercice de parole (iOS 15+)
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let ok = origin.host == "mansstyle59.github.io" || origin.protocol == "app"
        decisionHandler(ok && type == .microphone ? .grant : .deny)
    }
}
