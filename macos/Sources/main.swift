import Cocoa
import WebKit
import LocalAuthentication
import UserNotifications

let HOST = "https://letterhome.ca"
let NAVY = NSColor(srgbRed: 0x17/255.0, green: 0x29/255.0, blue: 0x3d/255.0, alpha: 1)
let RED = NSColor(srgbRed: 0xc4/255.0, green: 0x20/255.0, blue: 0x2b/255.0, alpha: 1)

func isMine(_ u: URL?) -> Bool {
    guard let h = u?.host?.lowercased(), u?.scheme == "https" else { return false }
    return h == "letterhome.ca" || h.hasSuffix(".letterhome.ca") || h == "letterhome.us" || h.hasSuffix(".letterhome.us")
        || h == "letterhome.co.uk" || h.hasSuffix(".letterhome.co.uk")
}

final class LockView: NSView {
    let onUnlock: () -> Void
    private let status = NSTextField(labelWithString: "")
    init(onUnlock: @escaping () -> Void) {
        self.onUnlock = onUnlock
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NAVY.cgColor
        let name = NSTextField(labelWithString: "Letterhome")
        name.font = NSFontManager.shared.convert(NSFont(name: "Georgia", size: 40) ?? NSFont.systemFont(ofSize: 40), toHaveTrait: .italicFontMask)
        name.textColor = .white
        let sub = NSTextField(labelWithString: "Admin is locked")
        sub.font = .systemFont(ofSize: 14, weight: .medium)
        sub.textColor = NSColor.white.withAlphaComponent(0.6)
        let btn = NSButton(title: "Unlock with Touch ID or Password", target: self, action: #selector(tap))
        btn.bezelStyle = .rounded
        btn.controlSize = .large
        btn.bezelColor = RED
        btn.contentTintColor = .white
        btn.keyEquivalent = "\r"
        status.font = .systemFont(ofSize: 12)
        status.textColor = NSColor.white.withAlphaComponent(0.55)
        let stack = NSStackView(views: [name, sub, btn, status])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14
        stack.setCustomSpacing(26, after: sub)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -20)
        ])
    }
    required init?(coder: NSCoder) { fatalError() }
    @objc func tap() { onUnlock() }
    func message(_ t: String) { status.stringValue = t }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, UNUserNotificationCenterDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var lockView: LockView!
    var locked = true
    var authenticating = false
    var leftAt: Date?
    var since = ""
    var lastBadge = 0
    var pollTimer: Timer?
    let defaults = UserDefaults.standard

    var lockEnabled: Bool { defaults.object(forKey: "lockEnabled") == nil ? true : defaults.bool(forKey: "lockEnabled") }

    func applicationDidFinishLaunching(_ n: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.applicationNameForUserAgent = "LetterhomeMac/1.0"
        cfg.userContentController.add(self, name: "mac")
        cfg.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('mac-app');", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.allowsMagnification = false
        web.setValue(false, forKey: "drawsBackground")
        web.autoresizingMask = [.width, .height]

        let size = NSSize(width: 1280, height: 820)
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Letterhome Admin"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NAVY
        window.minSize = NSSize(width: 900, height: 600)
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.setFrameAutosaveName("LetterhomeMain")
        if !window.setFrameUsingName("LetterhomeMain") { window.center() }

        let content = NSView(frame: NSRect(origin: .zero, size: size))
        content.wantsLayer = true
        web.frame = content.bounds
        content.addSubview(web)
        lockView = LockView(onUnlock: { [weak self] in self?.authenticate() })
        lockView.frame = content.bounds
        lockView.autoresizingMask = [.width, .height]
        content.addSubview(lockView)
        window.contentView = content
        window.makeKeyAndOrderFront(nil)

        web.load(URLRequest(url: URL(string: HOST + "/admin")!))
        setLocked(lockEnabled)
        if lockEnabled { authenticate() }

        let nc = NSWorkspace.shared.notificationCenter
        nc.addObserver(self, selector: #selector(systemLocked), name: NSWorkspace.screensDidSleepNotification, object: nil)
        nc.addObserver(self, selector: #selector(systemLocked), name: NSWorkspace.willSleepNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(systemLocked), name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)

        let un = UNUserNotificationCenter.current()
        un.delegate = self
        un.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        pollTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in self?.poll() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.poll() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil); return true
    }
    func applicationDidResignActive(_ n: Notification) { leftAt = Date() }
    func applicationDidBecomeActive(_ n: Notification) {
        if lockEnabled, !locked, let t = leftAt, Date().timeIntervalSince(t) > 60 { setLocked(true) }
        if locked && lockEnabled { authenticate() }
    }

    // MARK: lock
    @objc func systemLocked() { if lockEnabled { setLocked(true) } }
    func setLocked(_ on: Bool) {
        locked = on
        lockView.isHidden = !on
        web.isHidden = on
        if on { lockView.message("") }
    }
    func authenticate() {
        guard locked, !authenticating else { return }
        authenticating = true
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Cancel"
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
            authenticating = false
            lockView.message("This Mac has no password set, so it cannot be locked.")
            setLocked(false)
            return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock Letterhome Admin") { ok, e in
            DispatchQueue.main.async {
                self.authenticating = false
                if ok { self.setLocked(false); self.leftAt = nil; self.poll() }
                else { self.lockView.message(e?.localizedDescription ?? "Could not unlock") }
            }
        }
    }
    @objc func toggleLock(_ item: NSMenuItem) {
        let on = !lockEnabled
        defaults.set(on, forKey: "lockEnabled")
        item.state = on ? .on : .off
        if !on { setLocked(false) }
    }
    @objc func lockNow() { if lockEnabled { setLocked(true); authenticate() } else { NSSound.beep() } }

    // MARK: navigation
    func goTo(_ path: String) {
        guard !locked else { return }
        let js = "typeof go==='function' ? (go('\(path)'), true) : false"
        web.evaluateJavaScript(js) { r, _ in
            if (r as? Bool) != true, let u = URL(string: HOST + path) { self.web.load(URLRequest(url: u)) }
        }
    }
    @objc func menuGo(_ item: NSMenuItem) { if let p = item.representedObject as? String { goTo(p) } }
    @objc func reload() { web.reload() }
    @objc func back() { web.goBack() }
    @objc func forward() { web.goForward() }
    @objc func search() { web.evaluateJavaScript("typeof openSearch==='function' && openSearch()") }
    @objc func zoomIn() { web.pageZoom = min(2, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.6, web.pageZoom - 0.1) }
    @objc func zoomReset() { web.pageZoom = 1 }
    @objc func openSite() { NSWorkspace.shared.open(URL(string: HOST)!) }

    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if a.shouldPerformDownload { decisionHandler(.download); return }
        if let u = a.request.url, u.scheme == "https" || u.scheme == "http" {
            if isMine(u) { decisionHandler(.allow) }
            else if a.navigationType == .linkActivated || a.targetFrame == nil { NSWorkspace.shared.open(u); decisionHandler(.cancel) }
            else { decisionHandler(.allow) }
        } else if let u = a.request.url, u.scheme == "mailto" || u.scheme == "tel" {
            NSWorkspace.shared.open(u); decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }
    func webView(_ w: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(r.canShowMIMEType ? .allow : .download)
    }
    func webView(_ w: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ w: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ d: WKDownload, decideDestinationUsing r: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var url = dir.appendingPathComponent(suggestedFilename)
        var i = 1
        while FileManager.default.fileExists(atPath: url.path) {
            let base = (suggestedFilename as NSString).deletingPathExtension, ext = (suggestedFilename as NSString).pathExtension
            url = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(i)" : "\(base) \(i).\(ext)"); i += 1
        }
        completionHandler(url)
    }
    func downloadDidFinish(_ d: WKDownload) { NSApp.dockTile.badgeLabel = NSApp.dockTile.badgeLabel }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { showOffline() }
    func showOffline() {
        let html = "<meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:-apple-system,sans-serif;background:#17293d;color:#fff;text-align:center;padding:26vh 24px 0'><h2 style='font-weight:600;margin:0 0 8px'>No connection</h2><p style='opacity:.65;margin:0 0 22px'>Letterhome Admin cannot reach the server.</p><a href='\(HOST)/admin' style='display:inline-block;padding:10px 20px;background:#c4202b;color:#fff;border-radius:10px;text-decoration:none'>Try again</a></body>"
        web.loadHTMLString(html, baseURL: URL(string: HOST + "/admin"))
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { if isMine(u) { w.load(a.request) } else { NSWorkspace.shared.open(u) } }
        return nil
    }
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }
    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = p; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        let tf = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24)); tf.stringValue = defaultText ?? ""; a.accessoryView = tf
        a.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn ? tf.stringValue : nil) }
    }
    func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let o = NSOpenPanel(); o.allowsMultipleSelection = p.allowsMultipleSelection; o.canChooseDirectories = p.allowsDirectories
        o.beginSheetModal(for: window) { completionHandler($0 == .OK ? o.urls : nil) }
    }

    // page to app messages (window dragging from the page's top bar)
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let s = m.body as? String else { return }
        if s == "drag", let e = NSApp.currentEvent { window.performDrag(with: e) }
        else if s == "zoom" { window.zoom(nil) }
    }

    // MARK: alerts and Dock badge
    func poll() {
        let js = "const r = await fetch('/api/admin/notifications' + (since ? '?since=' + encodeURIComponent(since) : ''), {credentials:'same-origin'}); if (!r.ok) return null; return await r.text();"
        web.callAsyncJavaScript(js, arguments: ["since": since], in: nil, in: .page) { res in
            guard case .success(let v) = res, let txt = v as? String, let d = txt.data(using: .utf8),
                  let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
            self.handle(j)
        }
    }
    func handle(_ j: [String: Any]) {
        let firstRun = since.isEmpty
        if let now = j["now"] as? String { since = now }
        let mailN = (j["mailUnread"] as? [[String: Any]] ?? []).reduce(0) { $0 + (($1["unread"] as? Int) ?? 0) }
        let badge = mailN + (j["unreadContacts"] as? Int ?? 0) + (j["unreadApplicants"] as? Int ?? 0)
        NSApp.dockTile.badgeLabel = badge > 0 ? String(badge) : nil
        lastBadge = badge
        if firstRun { return }
        var items: [(String, String, String)] = []
        for o in j["orders"] as? [[String: Any]] ?? [] {
            let id = o["id"] as? Int ?? 0
            let cents = o["price_cents"] as? Int ?? 0
            items.append(("New order #\(id)", "\(o["recipient_name"] as? String ?? "") to \(o["destination_country"] as? String ?? "")  $\(String(format: "%.2f", Double(cents) / 100))", "/admin/orders/\(id)"))
        }
        for c in j["contacts"] as? [[String: Any]] ?? [] {
            items.append(("Message from \(c["name"] as? String ?? "someone")", c["preview"] as? String ?? "", "/admin/contacts"))
        }
        for m in j["mail"] as? [[String: Any]] ?? [] {
            items.append(("\(m["from"] as? String ?? "New email")", m["subject"] as? String ?? "", "/admin/mail"))
        }
        for (t, b, p) in items.prefix(4) { notify(t, b, p) }
        if items.count > 4 { notify("\(items.count - 4) more", "Open Letterhome Admin to see them", "/admin") }
    }
    func notify(_ title: String, _ body: String, _ path: String) {
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body; c.sound = .default; c.userInfo = ["path": path]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler h: @escaping (UNNotificationPresentationOptions) -> Void) {
        h(NSApp.isActive ? [] : [.banner, .sound])
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler h: @escaping () -> Void) {
        let p = r.notification.request.content.userInfo["path"] as? String ?? "/admin"
        DispatchQueue.main.async { NSApp.activate(ignoringOtherApps: true); self.window.makeKeyAndOrderFront(nil); self.goTo(p) }
        h()
    }

    // MARK: menus
    func buildMenu() {
        let main = NSMenu()
        func add(_ menu: NSMenu, _ title: String, _ sel: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = self) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: sel, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods; i.target = target; menu.addItem(i); return i
        }
        func sub(_ title: String) -> NSMenu {
            let item = NSMenuItem(); main.addItem(item)
            let m = NSMenu(title: title); item.submenu = m; return m
        }
        let app = sub("Letterhome Admin")
        _ = add(app, "About Letterhome Admin", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), target: NSApp)
        app.addItem(.separator())
        let lockItem = add(app, "Require Touch ID or Password", #selector(toggleLock(_:)))
        lockItem.state = lockEnabled ? .on : .off
        _ = add(app, "Lock Now", #selector(lockNow), "l", [.command, .control])
        app.addItem(.separator())
        _ = add(app, "Hide Letterhome Admin", #selector(NSApplication.hide(_:)), "h", target: NSApp)
        _ = add(app, "Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option], target: NSApp)
        app.addItem(.separator())
        _ = add(app, "Quit Letterhome Admin", #selector(NSApplication.terminate(_:)), "q", target: NSApp)

        let edit = sub("Edit")
        _ = add(edit, "Undo", Selector(("undo:")), "z", target: nil)
        _ = add(edit, "Redo", Selector(("redo:")), "z", [.command, .shift], target: nil)
        edit.addItem(.separator())
        _ = add(edit, "Cut", #selector(NSText.cut(_:)), "x", target: nil)
        _ = add(edit, "Copy", #selector(NSText.copy(_:)), "c", target: nil)
        _ = add(edit, "Paste", #selector(NSText.paste(_:)), "v", target: nil)
        _ = add(edit, "Select All", #selector(NSText.selectAll(_:)), "a", target: nil)

        let go = sub("Go")
        let pages: [(String, String, String)] = [("Dashboard", "/admin", "1"), ("Orders", "/admin/orders", "2"), ("Inbox", "/admin/mail", "3"), ("People", "/admin/customers", "4"), ("Marketing", "/admin/broadcast", "5"), ("Reports", "/admin/insights", "6"), ("System", "/admin/settings", "7")]
        for (t, p, k) in pages { add(go, t, #selector(menuGo(_:)), k).representedObject = p }
        go.addItem(.separator())
        _ = add(go, "Search", #selector(search), "k")
        _ = add(go, "Back", #selector(back), "[")
        _ = add(go, "Forward", #selector(forward), "]")

        let view = sub("View")
        _ = add(view, "Reload", #selector(reload), "r")
        view.addItem(.separator())
        _ = add(view, "Actual Size", #selector(zoomReset), "0")
        _ = add(view, "Zoom In", #selector(zoomIn), "+")
        _ = add(view, "Zoom Out", #selector(zoomOut), "-")
        view.addItem(.separator())
        _ = add(view, "Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control], target: nil)

        let win = sub("Window")
        _ = add(win, "Minimize", #selector(NSWindow.performMiniaturize(_:)), "m", target: nil)
        _ = add(win, "Zoom", #selector(NSWindow.performZoom(_:)), "", target: nil)
        NSApp.windowsMenu = win

        let help = sub("Help")
        _ = add(help, "letterhome.ca", #selector(openSite))
        NSApp.helpMenu = help
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
