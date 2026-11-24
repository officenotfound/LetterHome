import Cocoa
// Draws the app icon: navy rounded square, cream envelope, red stamp, airmail stripe along the top edge.
let S: CGFloat = 1024
let img = NSImage(size: NSSize(width: S, height: S))
img.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext
let rect = CGRect(x: 100, y: 100, width: 824, height: 824)
let bg = NSBezierPath(roundedRect: rect, xRadius: 185, yRadius: 185)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 28, color: NSColor.black.withAlphaComponent(0.35).cgColor)
NSColor(srgbRed: 0.09, green: 0.16, blue: 0.24, alpha: 1).setFill(); bg.fill()
ctx.restoreGState()
bg.addClip()
NSGradient(colors: [NSColor(srgbRed: 0.13, green: 0.22, blue: 0.33, alpha: 1), NSColor(srgbRed: 0.07, green: 0.12, blue: 0.19, alpha: 1)])!.draw(in: rect, angle: -90)
// airmail stripe
let stripeH: CGFloat = 34
var x: CGFloat = rect.minX - 80
var i = 0
let cols = [NSColor(srgbRed: 0.77, green: 0.13, blue: 0.17, alpha: 1), NSColor(srgbRed: 0.96, green: 0.94, blue: 0.9, alpha: 1), NSColor(srgbRed: 0.17, green: 0.29, blue: 0.45, alpha: 1)]
while x < rect.maxX + 80 {
    let p = NSBezierPath()
    p.move(to: CGPoint(x: x, y: rect.maxY - stripeH)); p.line(to: CGPoint(x: x + 58, y: rect.maxY - stripeH))
    p.line(to: CGPoint(x: x + 58 + stripeH, y: rect.maxY)); p.line(to: CGPoint(x: x + stripeH, y: rect.maxY)); p.close()
    cols[i % 3].setFill(); p.fill(); x += 58; i += 1
}
// envelope
let env = CGRect(x: 232, y: 330, width: 560, height: 380)
let body = NSBezierPath(roundedRect: env, xRadius: 36, yRadius: 36)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -16), blur: 30, color: NSColor.black.withAlphaComponent(0.4).cgColor)
NSColor(srgbRed: 0.97, green: 0.95, blue: 0.9, alpha: 1).setFill(); body.fill()
ctx.restoreGState()
NSColor(srgbRed: 0.8, green: 0.76, blue: 0.68, alpha: 1).setStroke()
let flap = NSBezierPath()
flap.move(to: CGPoint(x: env.minX + 18, y: env.maxY - 22)); flap.line(to: CGPoint(x: env.midX, y: env.midY - 20)); flap.line(to: CGPoint(x: env.maxX - 18, y: env.maxY - 22))
flap.lineWidth = 9; flap.lineJoinStyle = .round; flap.lineCapStyle = .round; flap.stroke()
// stamp
let st = CGRect(x: env.maxX - 190, y: env.minY + 34, width: 130, height: 156)
NSColor(srgbRed: 0.77, green: 0.13, blue: 0.17, alpha: 1).setFill()
NSBezierPath(roundedRect: st, xRadius: 10, yRadius: 10).fill()
NSColor(srgbRed: 0.97, green: 0.95, blue: 0.9, alpha: 1).setStroke()
let inner = NSBezierPath(roundedRect: st.insetBy(dx: 14, dy: 14), xRadius: 4, yRadius: 4); inner.lineWidth = 6; inner.stroke()
// address lines
NSColor(srgbRed: 0.72, green: 0.68, blue: 0.6, alpha: 1).setFill()
for (k, w) in [(0, 220.0), (1, 160.0)] { NSBezierPath(roundedRect: CGRect(x: env.minX + 54, y: env.minY + 128 - CGFloat(k) * 44, width: CGFloat(w), height: 18), xRadius: 9, yRadius: 9).fill() }
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
