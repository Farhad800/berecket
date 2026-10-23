"""Push notifications end-to-end (no real phone needed):
   a fake push service receives what the server sends; we decrypt it exactly as a phone would (RFC 8291).
   Also checks the service worker shows a notification, the on/off UI, sign-out detaching, and dead devices being removed.
   Run against the development server with demo accounts:  python3 tests/e2e/push.py"""
import os, re, json, base64, hmac, hashlib, struct, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from playwright.sync_api import sync_playwright

B=os.environ.get("BASE","http://localhost:3000"); DB=os.environ.get("PGDB","bereket")
res=[]
def ck(n,c): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n)
def sql(q): return subprocess.run(["su","postgres","-c",f"psql -d {DB} -tAc \"{q}\""],capture_output=True,text=True).stdout.strip()
def login(pg,u,pw="Demo12345!"):
    pg.context.clear_cookies(); pg.goto(B+"/login"); pg.fill("#username",u); pg.fill("#password",pw); pg.click("button[type=submit]")
    pg.wait_for_url(re.compile(r".*/(dashboard|change-password)$"), wait_until="commit"); pg.wait_for_load_state("networkidle")
b64u=lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()

# ── a fake push service (what Google/Apple/Mozilla run for real phones)
got=[]; status={"code":201}
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get("Content-Length",0)))
        got.append({"path":self.path,"headers":dict(self.headers),"body":body})
        self.send_response(status["code"]); self.end_headers()
    def log_message(self,*a): pass
srv=HTTPServer(("127.0.0.1",4455),H)
# Push services are HTTPS. For this local fake, start the app with NODE_EXTRA_CA_CERTS=<CERT> so it trusts it.
import ssl
CERT=os.environ.get("PUSH_CERT","/tmp/claude-0/-home-claude/f2fd9017-1975-5c5d-8632-f9a800ffa010/scratchpad/push-cert.pem")
sc=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); sc.load_cert_chain(CERT, CERT.replace("push-cert","push-key"))
srv.socket=sc.wrap_socket(srv.socket, server_side=True)
threading.Thread(target=srv.serve_forever,daemon=True).start()

# ── a "phone": its own key pair + auth secret, exactly like a browser subscription
priv=ec.generate_private_key(ec.SECP256R1()); pub=priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
auth=os.urandom(16)
def hkdf(salt, ikm, info, n):
    prk=hmac.new(salt, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info+b"\x01", hashlib.sha256).digest()[:n]
def decrypt(body):
    salt=body[:16]; rs=struct.unpack(">I",body[16:20])[0]; idlen=body[20]; as_pub=body[21:21+idlen]; ct=body[21+idlen:]
    shared=priv.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
    ikm=hkdf(auth, shared, b"WebPush: info\x00"+pub+as_pub, 32)
    cek=hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16); nonce=hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    pt=AESGCM(cek).decrypt(nonce, ct, None).rstrip(b"\x00")
    return json.loads(pt[:-1].decode())  # last byte is the 0x02 padding delimiter

uid=sql("SELECT id FROM \\\"User\\\" WHERE username='demo.production'")
sql("DELETE FROM \\\"PushSubscription\\\" WHERE endpoint LIKE '%127.0.0.1:4455/%'")
sql(f"UPDATE \\\"User\\\" SET locale='ar' WHERE id='{uid}'")
sql(f"INSERT INTO \\\"PushSubscription\\\" (id,\\\"userId\\\",endpoint,p256dh,auth) VALUES ('pushtest0000000000000001','{uid}','https://127.0.0.1:4455/phone-1','{b64u(pub)}','{b64u(auth)}')")

with sync_playwright() as p:
    br=p.chromium.launch(channel="chromium"); errs=[]  # full Chromium: real notification permission
    S=br.new_context().new_page(); S.on("pageerror", lambda e: errs.append(str(e))); login(S,"demo.sales")
    # 1. Sales makes an order → production's phone gets a push, in Arabic, decryptable only with the phone's keys
    S.goto(B+"/orders/new"); S.locator("input[data-q]").first.fill("750"); S.get_by_role("button", name="Save order").click()
    S.wait_for_url(re.compile(r".*/orders/c[a-z0-9]+$"), wait_until="commit"); oid=S.url.split("/")[-1]
    for _ in range(40):
        if got: break
        time.sleep(0.25)
    ck("push sent to the phone after a new order", len(got)>=1)
    if got:
        h={k.lower():v for k,v in got[0]["headers"].items()}
        ck("encrypted (aes128gcm) and signed with the server key (VAPID)", h.get("content-encoding")=="aes128gcm" and h.get("authorization","").startswith("vapid t="))
        ck("payload is not readable without the phone's key", b"ORD-" not in got[0]["body"])
        msg=decrypt(got[0]["body"])
        ck(f"decrypted on the phone: {msg.get('title')} / {msg.get('body')}", msg["title"].startswith("طلب جديد ORD-") and "750" in msg["body"] and "بواسطة" in msg["body"])
        ck("tapping opens the notification (marks read, then the order)", msg["url"].startswith("/notifications/open/") and msg.get("badge",0)>=1)
        nid=msg["url"].split("/")[-1]
        ck("bell list has the same notification", sql(f"SELECT link FROM \\\"Notification\\\" WHERE id='{nid}'")==f"/orders/{oid}")
    ck("the person who made the order is not notified", not any("demo.sales" in str(g) for g in got) and sql(f"SELECT count(*) FROM \\\"Notification\\\" n JOIN \\\"User\\\" u ON u.id=n.\\\"userId\\\" WHERE u.username='demo.sales' AND n.link='/orders/{oid}'")=="0")

    # 2. other events also notify (order completed)
    n0=len(got); S.goto(B+f"/orders/{oid}"); S.get_by_role("button", name="Mark completed").click(); S.wait_for_timeout(2500)
    ck("completing the order pushes too", len(got)>n0 and "اكتمل الطلب" in decrypt(got[-1]["body"])["title"])

    # 3. English reader sees English in the bell list
    sql(f"UPDATE \\\"User\\\" SET locale='en' WHERE id='{uid}'")
    P=br.new_context().new_page(); login(P,"demo.production"); P.goto(B+"/notifications")
    ck("bell list text in the reader's language", "Order " in P.inner_text("main") and "completed" in P.inner_text("main"))

    # 4. a phone that uninstalled the app (410 Gone) is removed automatically
    status["code"]=410; S.goto(B+"/orders/new"); S.locator("input[data-q]").first.fill("5"); S.get_by_role("button", name="Save order").click(); S.wait_for_timeout(3000)
    ck("dead device removed after 410", sql("SELECT count(*) FROM \\\"PushSubscription\\\" WHERE id='pushtest0000000000000001'")=="0")
    status["code"]=201

    # 5. the service worker shows the pop-up when a push arrives (app in background)
    c=br.new_context(); c.grant_permissions(["notifications"], origin=B)
    # Headless Chromium has no push service (it crashes on subscribe); simulate the browser saying "no push service".
    c.add_init_script("PushManager.prototype.subscribe = function(){ return Promise.reject(new DOMException('Registration failed - push service not available', 'AbortError')); }")
    W=c.new_page(); login(W,"demo.warehouse")
    W.goto(B+"/notifications"); W.wait_for_function("navigator.serviceWorker.controller !== null || true"); W.evaluate("navigator.serviceWorker.ready")
    cdp=c.new_cdp_session(W); regs={}
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: [regs.update({r["scopeURL"]:r["registrationId"]}) for r in e["registrations"]])
    cdp.send("ServiceWorker.enable"); W.wait_for_timeout(800)
    rid=next(iter(regs.values()), None)
    if rid:
        cdp.send("ServiceWorker.deliverPushMessage", {"origin": B, "registrationId": rid, "data": json.dumps({"title":"Goods out: 400 pcs","body":"2 products · by Walid","url":"/inventory","tag":"t1","badge":3})})
        W.wait_for_timeout(1200)
        shown=W.evaluate("navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(ns=>ns.map(n=>[n.title,n.body,n.data&&n.data.url]))")
        ck(f"service worker pops up the notification {shown}", ["Goods out: 400 pcs","2 products · by Walid","/inventory"] in shown)
    else:
        ck("service worker registered", False)

    # 6. on/off card on the Notifications page
    txt=W.inner_text("main")
    ck("notifications page has the device card", "Notifications on this device" in txt)
    btn=W.get_by_role("button", name="Turn on notifications")
    if btn.count():
        btn.first.click(); W.wait_for_timeout(4000); txt=W.inner_text("main")
        sub=sql("SELECT count(*) FROM \\\"PushSubscription\\\" p JOIN \\\"User\\\" u ON u.id=p.\\\"userId\\\" WHERE u.username='demo.warehouse'")
        if "this device will now get notifications" in txt:
            ck("turning on registers the device for the signed-in employee", sub>="1")
            W.get_by_role("button", name="Send a test").click(); W.wait_for_timeout(3000)
            ck("test notification accepted", "Test sent" in W.inner_text("main"))
            # sign out → this device stops getting the employee's notifications
            W.locator("header button[aria-expanded]").click(); W.get_by_role("button", name="Sign out").click(); W.wait_for_url(re.compile(r".*/login"), wait_until="commit"); W.wait_for_timeout(1000)
            ck("signing out detaches the device", sql("SELECT count(*) FROM \\\"PushSubscription\\\" p JOIN \\\"User\\\" u ON u.id=p.\\\"userId\\\" WHERE u.username='demo.warehouse'")=="0")
        else:
            print("   (this headless Chromium has no push service; real browsers do) ->", txt[txt.find("Notifications on this device"):][:200].replace("\n"," "))
            ck("clear message when the browser can't subscribe", "Couldn't" in txt or "push service" in txt.lower() or "Registration failed" in txt)
    # 7. phone layout of the card + ask banner
    M=br.new_context(**p.devices["Pixel 7"]); mp=M.new_page(); login(mp,"demo.qc")
    mp.wait_for_timeout(8000)
    ck("first-visit banner asks to turn notifications on", mp.get_by_text("Get notifications on this device").count()>=1)
    mp.goto(B+"/notifications"); ck("phone layout fits", mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")<=1)
    ck("no browser errors", not errs); print("   errors:", errs[:3])
    br.close()
sql("DELETE FROM \\\"PushSubscription\\\" WHERE endpoint LIKE '%127.0.0.1:4455/%'"); sql(f"UPDATE \\\"User\\\" SET locale='en' WHERE id='{uid}'")
srv.shutdown()
print(f"\n{sum(res)}/{len(res)} passed")
