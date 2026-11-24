import Cocoa
import WebKit
import LocalAuthentication
import UserNotifications

let ENV = ProcessInfo.processInfo.environment
let HOST = ENV["LH_HOST"] ?? "https://letterhome.ca"   // LH_HOST is only for testing against a local copy
let NAVY = NSColor(srgbRed: 0x17/255.0, green: 0x29/255.0, blue: 0x3d/255.0, alpha: 1)
let RED = NSColor(srgbRed: 0xc4/255.0, green: 0x20/255.0, blue: 0x2b/255.0, alpha: 1)

func isMine(_ u: URL?) -> Bool {
    if let t = ENV["LH_HOST"], let th = URL(string: t)?.host, u?.host == th { return true }
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
        let stream = """
        (function(){ if(!/^\\/admin/.test(location.pathname)||/login/.test(location.pathname)||window.__lhEv)return; window.__lhEv=true;
        var since=''; var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
        var post=function(o){try{webkit.messageHandlers.mac.postMessage(o)}catch(e){}};
        (async function(){ var back=3000; for(;;){ try{
          var r=await fetch('/api/admin/events'+(since?'?since='+encodeURIComponent(since):''),{credentials:'same-origin',redirect:'manual',headers:{Accept:'text/event-stream'}});
          if(r.status!==200||!r.body){ post({ev:{type:'signedout'}}); await sleep(back); back=Math.min(back*2,60000); continue; }
          back=3000; var rd=r.body.getReader(), dec=new TextDecoder(), buf='';
          for(;;){ var x=await rd.read(); if(x.done)break; buf+=dec.decode(x.value,{stream:true}); var i;
            while((i=buf.indexOf('\\n\\n'))>=0){ var blk=buf.slice(0,i); buf=buf.slice(i+2);
              var l=blk.split('\\n').filter(function(t){return t.indexOf('data: ')===0})[0]; if(!l)continue;
              var j=JSON.parse(l.slice(6)); if(j.at)since=j.at; post({ev:j}); } }
        }catch(e){} await sleep(back); } })(); })();
        """
        cfg.userContentController.addUserScript(WKUserScript(source: stream, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
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

        var startPath = "/admin"
        if let last = defaults.string(forKey: "lastPath"), last.hasPrefix("/admin"), !last.hasPrefix("/admin/login") { startPath = last }
        web.load(URLRequest(url: URL(string: HOST + startPath)!))
        setLocked(lockEnabled)
        if lockEnabled { authenticate() }

        let nc = NSWorkspace.shared.notificationCenter
        nc.addObserver(self, selector: #selector(systemLocked), name: NSWorkspace.screensDidSleepNotification, object: nil)
        nc.addObserver(self, selector: #selector(systemLocked), name: NSWorkspace.willSleepNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(systemLocked), name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)

        let un = UNUserNotificationCenter.current()
        un.delegate = self
        un.setNotificationCategories([UNNotificationCategory(identifier: "mailreply", actions: [UNTextInputNotificationAction(identifier: "reply", title: "Reply", options: [], textInputButtonTitle: "Send", textInputPlaceholder: "Reply")], intentIdentifiers: [], options: [])])
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
    @objc func toggleQuiet(_ item: NSMenuItem) {
        let on = !defaults.bool(forKey: "quietOn"); defaults.set(on, forKey: "quietOn"); item.state = on ? .on : .off
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
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
        if let u = w.url, isMine(u), u.path.hasPrefix("/admin"), !u.path.hasPrefix("/admin/login") { defaults.set(u.path, forKey: "lastPath") }
        if ENV["LH_SNAPSHOT"] != nil { FileHandle.standardError.write(("loaded " + (w.url?.absoluteString ?? "nil") + "\n").data(using: .utf8)!) }
        testHook(w)
    }
    // Test mode (LH_LOGIN=user:pass, LH_PATH, LH_SNAPSHOT): signs in to a local copy, opens a page, saves a picture of it and quits.
    var testStep = 0
    func testHook(_ w: WKWebView) {
        guard let snap = ENV["LH_SNAPSHOT"], let login = ENV["LH_LOGIN"], let u = w.url else { return }
        let parts = login.split(separator: ":", maxSplits: 1).map(String.init)
        if u.path.hasPrefix("/admin/login"), testStep == 0, parts.count == 2 {
            testStep = 1
            let js = "const f=document.querySelector('form'); f.querySelector('[name=username]').value=\(jsq(parts[0])); f.querySelector('[type=password]').value=\(jsq(parts[1])); f.submit();"
            w.evaluateJavaScript(js)
        } else if !u.path.hasPrefix("/admin/login") {
            if testStep < 2, let p = ENV["LH_PATH"], u.path != p { testStep = 2; DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.goTo(p) }; return }
            testStep = 3
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                self.web.takeSnapshot(with: nil) { img, _ in
                    if let img = img, let t = img.tiffRepresentation, let r = NSBitmapImageRep(data: t), let png = r.representation(using: .png, properties: [:]) {
                        try? png.write(to: URL(fileURLWithPath: snap))
                    }
                    NSApp.terminate(nil)
                }
            }
        }
    }
    func jsq(_ s: String) -> String { "'" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'") + "'" }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { if ENV["LH_SNAPSHOT"] != nil { FileHandle.standardError.write("fail \(e)\n".data(using: .utf8)!) }; showOffline() }
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
        if let d = m.body as? [String: Any], let ev = d["ev"] as? [String: Any] { liveEvent(ev); return }
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
        _ = firstRun
    }
    // Live alerts, the same set the Android app gives: orders, extra payments, customer messages, new email (with reply).
    var quietNow: Bool {
        guard defaults.bool(forKey: "quietOn") else { return false }
        let st = defaults.object(forKey: "quietStart") as? Int ?? 22, en = defaults.object(forKey: "quietEnd") as? Int ?? 7
        let h = Calendar.current.component(.hour, from: Date())
        return st == en ? false : (st < en ? (h >= st && h < en) : (h >= st || h < en))
    }
    var seenAlerts = Set<String>()
    func liveEvent(_ j: [String: Any]) {
        let type = j["type"] as? String ?? ""
        if type == "tick" { return }
        if type == "signedout" {
            if !defaults.bool(forKey: "signedOutShown") { defaults.set(true, forKey: "signedOutShown"); notify("Signed out", "Open Letterhome Admin and sign in again to keep getting alerts.", "/admin", loud: false) }
            return
        }
        defaults.set(false, forKey: "signedOutShown")
        let key = type + ":" + String(describing: j["id"] ?? "")
        if type != "mail" { if seenAlerts.contains(key) { return }; seenAlerts.insert(key) }
        func money(_ c: Any?) -> String { String(format: "$%.2f", Double((c as? Int) ?? 0) / 100) }
        switch type {
        case "order":
            let id = j["id"] as? Int ?? 0, name = j["name"] as? String ?? "", dest = j["dest"] as? String ?? ""
            notify("New order #\(id)", money(j["price_cents"]) + (name.isEmpty ? "" : " · letter to \(name)") + (dest.isEmpty ? "" : " (\(dest))"), "/admin/orders/\(id)", loud: true)
            NSApp.requestUserAttention(.informationalRequest)
        case "message":
            notify("Message from \(j["name"] as? String ?? "a customer")", j["preview"] as? String ?? "", "/admin/contacts?id=\(j["id"] as? Int ?? 0)", loud: !quietNow)
        case "extra":
            let oid = j["order_id"] as? Int ?? 0
            notify("Extra payment received", money(j["amount_cents"]) + " " + (j["currency"] as? String ?? "") + " paid for order #\(oid)", "/admin/orders/\(oid)", loud: true)
        case "mail":
            let raw = j["from"] as? String ?? ""
            let name = raw.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression).replacingOccurrences(of: "\"", with: "").trimmingCharacters(in: .whitespaces)
            var addr = raw.trimmingCharacters(in: .whitespaces)
            if let r = raw.range(of: "<[^>]*>", options: .regularExpression) { addr = String(raw[r]).trimmingCharacters(in: CharacterSet(charactersIn: "<>")) }
            let box = j["box"] as? String ?? "", id = j["id"] as? String ?? "", folder = j["folderId"] as? String ?? ""
            let subject = j["subject"] as? String ?? ""
            func enc(_ t: String) -> String { t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "" }
            var info: [String: Any] = ["path": "/admin/mail?box=\(enc(box))&id=\(enc(id))&folder=\(enc(folder))"]
            if box != "test", !addr.isEmpty { info["reply"] = ["box": box, "mid": id, "to": addr, "subject": subject] }
            notify("New email (\(j["label"] as? String ?? box))", (name.isEmpty ? "" : name + ": ") + subject, info["path"] as! String, loud: !quietNow, extra: info)
        default: break
        }
    }
    func sendReply(_ info: [String: String], _ text: String) {
        let js = """
        const m = await (await fetch('/api/admin/me',{credentials:'same-origin'})).json();
        const f = new FormData(); f.append('to', to); f.append('subject', /^re:/i.test(subject) ? subject : 'Re: ' + (subject||'')); f.append('body', text); if (mid) f.append('replyTo', mid);
        const r = await fetch('/api/admin/mail/' + box + '/send', {method:'POST', credentials:'same-origin', headers:{'X-CSRF-Token': m.csrfToken||''}, body:f});
        return r.ok;
        """
        let args: [String: Any] = ["box": info["box"] ?? "", "mid": info["mid"] ?? "", "to": info["to"] ?? "", "subject": info["subject"] ?? "", "text": text]
        web.callAsyncJavaScript(js, arguments: args, in: nil, in: .page) { res in
            var ok = false
            if case .success(let v) = res, let b = v as? Bool { ok = b }
            self.notify(ok ? "Reply sent" : "Reply not sent. Open the app to answer.", info["to"] ?? "", "/admin/mail", loud: false)
        }
    }
    func notify(_ title: String, _ body: String, _ path: String, loud: Bool = true, extra: [String: Any]? = nil) {
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body; c.sound = loud ? .default : nil; c.userInfo = extra ?? ["path": path]
        if extra?["reply"] != nil { c.categoryIdentifier = "mailreply" }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler h: @escaping (UNNotificationPresentationOptions) -> Void) {
        h(NSApp.isActive && !locked ? [] : [.banner, .list, .sound])
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler h: @escaping () -> Void) {
        let ui = r.notification.request.content.userInfo
        if let tr = r as? UNTextInputNotificationResponse, let rp = ui["reply"] as? [String: String] {
            let t = tr.userText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { DispatchQueue.main.async { self.sendReply(rp, t) } }
            h(); return
        }
        let p = ui["path"] as? String ?? "/admin"
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
        let quietItem = add(app, "Silence Email Alerts 10 pm to 7 am", #selector(toggleQuiet(_:)))
        quietItem.state = defaults.bool(forKey: "quietOn") ? .on : .off
        _ = add(app, "Lock Now", #selector(lockNow), "l", [.command, .control])
        app.addItem(.separator())
        _ = add(app, "Hide Letterhome Admin", #selector(NSApplication.hide(_:)), "h", target: NSApp)
        _ = add(app, "Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option], target: NSApp)
        app.addItem(.separator())
        _ = add(app, "Quit Letterhome Admin", #selector(NSApplication.terminate(_:)), "q", target: NSApp)

        let file = sub("File")
        _ = add(file, "Close Window", #selector(NSWindow.performClose(_:)), "w", target: nil)

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
