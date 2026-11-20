import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleHelp, Copy, FileLock2, FilePlus2, Fingerprint, FolderOpen, KeyRound, LockKeyhole, Menu, MoreHorizontal, ShieldCheck, Sparkles, Wallet, X, Zap } from "lucide-react";
import { connectTari, disconnectTari, proveWalletOwnership, shortAddress, type WalletSession } from "./tari";
import { decryptContent, encryptContent, getLocker, loadLocker, loadMyLockers, createRemoteLocker, recordRemoteClaim, deleteRemoteLocker, readLockers, removeLocker, saveLocker, type Locker } from "./storage";

function Brand({ light = false }: { light?: boolean }) {
  return <Link to="/" className={"brand" + (light ? " brand-light" : "")}><span className="brand-mark"><LockKeyhole size={17}/></span><span>contari<span className="brand-period">.</span></span></Link>;
}

function Button({ children, to, onClick, variant = "primary", type = "button", disabled = false }: { children: React.ReactNode; to?: string; onClick?: () => void; variant?: "primary" | "secondary" | "quiet" | "dark"; type?: "button" | "submit"; disabled?: boolean }) {
  const cls = "button button-" + variant;
  if (to) return <Link className={cls} to={to}>{children}</Link>;
  return <button className={cls} type={type} onClick={onClick} disabled={disabled}>{children}</button>;
}

function SiteHeader() {
  const [menu, setMenu] = useState(false);
  return <header className="site-header"><Brand/><nav className={menu ? "nav-open" : ""}><Link to="/how-it-works">How it works</Link><a href="#privacy">Privacy</a><Link to="/app">Workspace</Link></nav><div className="header-actions"><Button to="/app" variant="dark">Open Contari <ArrowUpRight size={15}/></Button><button className="mobile-menu" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">{menu ? <X/> : <Menu/>}</button></div></header>;
}

function Footer() {
  return <footer className="site-footer"><Brand/><span>Built on Tari Ootle · Content stays encrypted until you unlock it.</span><div><Link to="/how-it-works">How it works</Link><Link to="/app">Workspace</Link><a href="https://tari.com/ootle" target="_blank" rel="noreferrer">Tari Ootle <ArrowUpRight size={12}/></a></div></footer>;
}

function Landing() {
  return <div className="marketing"><SiteHeader/><main>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> PRIVATE CONTENT, CONTROLLED BY YOU</div><h1>Some things are<br/>only for the <em>right people.</em></h1><p className="hero-lede">Share a link. Keep the content locked. Let people prove they own their Tari wallet before they get to read it.</p><div className="hero-actions"><Button to="/app/create">Create a locker <ArrowRight size={16}/></Button><Button to="/how-it-works" variant="secondary">See how it works</Button></div><div className="hero-footnote"><ShieldCheck size={15}/> Encrypted in your browser. Wallet proof before access.</div></div>
      <div className="hero-art">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="content-sheet"><div className="sheet-head"><span className="sheet-icon"><FileLock2 size={18}/></span><div><b>Private drop</b><small>Shared with a link</small></div><span className="sheet-menu"><MoreHorizontal size={18}/></span></div><div className="sheet-lines"><i/><i/><i/><i/></div><div className="sheet-lock"><div className="lock-circle"><LockKeyhole size={24}/></div><b>Content is locked</b><small>Connect a Tari wallet to continue</small></div><div className="sheet-bottom"><span><span className="mini-dot"/> AES-256 encrypted</span><span>CONTARI / 001</span></div></div>
        <div className="proof-float"><span className="proof-icon"><Fingerprint size={17}/></span><span><b>Wallet challenge signed</b><small>Ownership proof requested</small></span><CheckCircle2 size={17} className="proof-check"/></div>
        <div className="chain-float"><span className="chain-mark">T</span><span><b>Powered by Tari</b><small>Ootle smart contracts</small></span></div>
      </div>
    </section>
    <section className="trust-strip"><span>FOR THE MOMENTS WHEN A PUBLIC LINK IS TOO OPEN</span><div><span><LockKeyhole size={15}/> Client-side encryption</span><span><Fingerprint size={15}/> Wallet ownership proof</span><span><Zap size={15}/> Tari Ootle</span></div></section>
    <section className="feature-section" id="privacy"><div className="section-heading"><div className="eyebrow">A DIFFERENT KIND OF SHARING</div><h2>The link is easy.<br/><em>The access is yours to decide.</em></h2><p>Contari keeps the content encrypted and asks visitors to connect a Tari wallet before opening it.</p></div><div className="feature-grid"><article><span className="feature-number">01</span><LockKeyhole/><h3>Lock the content</h3><p>Write a private note or message. Contari encrypts it in your browser before saving it.</p></article><article><span className="feature-number">02</span><Fingerprint/><h3>Ask for a wallet proof</h3><p>Visitors sign a fresh ownership challenge with their Tari wallet. No seed phrase ever touches Contari.</p></article><article><span className="feature-number">03</span><ShieldCheck/><h3>Keep a claim record</h3><p>See who opened a locker and when. The Tari contract layer is designed to make those records verifiable.</p></article></div></section>
    <section className="how-preview"><div><div className="eyebrow">MADE FOR SHARING WITH INTENT</div><h2>Give access a little more meaning.</h2><p>Early access, private announcements, creator drops, community notes and more. If the content is not for everyone, Contari gives you a better way to share it.</p><Button to="/how-it-works" variant="secondary">Explore the flow <ArrowRight size={15}/></Button></div><div className="usecase-list"><div><span>01</span><b>Early access</b><small>Share a preview with your community first.</small></div><div><span>02</span><b>Private updates</b><small>Keep sensitive project notes out of public feeds.</small></div><div><span>03</span><b>Creator drops</b><small>Give your supporters a direct way to unlock a release.</small></div></div></section>
    <section className="bottom-cta"><div className="cta-mark"><LockKeyhole size={24}/></div><div><div className="eyebrow">YOUR CONTENT, YOUR CALL</div><h2>Ready to make your first locker?</h2><p>Start with a note. Connect a Tari wallet. See the full flow.</p></div><Button to="/app/create">Create your first locker <ArrowRight size={16}/></Button></section>
  </main><Footer/></div>;
}

function HowItWorks() {
  return <div className="marketing"><SiteHeader/><main className="info-page"><Link to="/" className="back-link"><ArrowLeft size={15}/> Back home</Link><div className="eyebrow">HOW CONTARI WORKS</div><h1>From private note<br/>to <em>wallet-verified access.</em></h1><p className="info-lede">Contari encrypts content in your browser. A visitor needs the shared link and a Tari wallet ownership signature before the demo reveals the content.</p><div className="steps-list"><article><span>01</span><div><h3>Create your locker</h3><p>Write the content, choose who can open it and create a unique locker link. The browser encrypts the content with AES-GCM.</p></div></article><article><span>02</span><div><h3>Share the link</h3><p>The encrypted content is stored with the locker. The decryption key travels in the URL fragment, which browsers do not send to servers.</p></div></article><article><span>03</span><div><h3>Prove wallet ownership</h3><p>The visitor connects a Tari wallet and signs a fresh challenge tied to that locker. Contari never asks for a seed phrase.</p></div></article><article><span>04</span><div><h3>Unlock and record</h3><p>After the wallet returns a matching ownership challenge response, the browser decrypts the content and records the claim locally. Full Schnorr verification is not yet implemented.</p></div></article></div><div className="notice"><ShieldCheck size={18}/><p><b>Prototype note:</b> this repository currently stores locker records in the creator’s browser. Cross-device storage, server-side signature verification and on-chain claim transactions must be configured before real public use. Do not store confidential or valuable content in this demo.</p></div><Button to="/app/create">Try the demo <ArrowRight size={15}/></Button></main><Footer/></div>;
}

function AppShell({ children, wallet, onConnect, onDisconnect }: { children: React.ReactNode; wallet: WalletSession | null; onConnect: () => void; onDisconnect: () => void }) {
  const [mobile, setMobile] = useState(false);
  return <div className="workspace"><aside className={mobile ? "sidebar sidebar-open" : "sidebar"}><div className="sidebar-top"><Brand/><button className="sidebar-close" onClick={() => setMobile(false)}><X size={18}/></button></div><div className="workspace-label">WORKSPACE</div><nav className="side-nav"><NavLink to="/app" end onClick={() => setMobile(false)}><FolderOpen size={17}/> Overview</NavLink><NavLink to="/app/create" onClick={() => setMobile(false)}><FilePlus2 size={17}/> New locker</NavLink><NavLink to="/app/library" onClick={() => setMobile(false)}><LockKeyhole size={17}/> My lockers</NavLink><NavLink to="/app/settings" onClick={() => setMobile(false)}><Wallet size={17}/> Wallet & network</NavLink></nav><div className="sidebar-bottom"><div className="network-chip"><span className="network-dot"/> Tari Ootle · Testnet ready</div><button className="help-link" onClick={() => window.location.href="/how-it-works"}><CircleHelp size={16}/> How Contari works</button><div className="sidebar-user"><div className="user-avatar">C</div><div><b>{wallet ? shortAddress(wallet.address) : "Guest workspace"}</b><small>{wallet ? wallet.network : "Connect a wallet to unlock"}</small></div><MoreHorizontal size={17}/></div></div></aside><div className="workspace-main"><header className="workspace-top"><button className="mobile-menu workspace-menu" onClick={() => setMobile(!mobile)}><Menu size={19}/></button><div><span className="crumb">Workspace</span><ChevronRight size={14}/><span className="crumb-current">Contari</span></div><div className="top-right">{wallet ? <button className="wallet-pill" onClick={onDisconnect}><span className="wallet-dot"/> {shortAddress(wallet.address)}</button> : <button className="connect-small" onClick={onConnect}><Wallet size={15}/> Connect wallet</button>}</div></header>{children}</div></div>;
}

function useWallet() {
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    setBusy(true); setError("");
    try { const session = await connectTari(); (window as any).__contariWallet = session; setWallet(session); }
    catch (e) { setError(e instanceof Error ? e.message : "Wallet connection failed."); }
    finally { setBusy(false); }
  }
  async function disconnect() { await disconnectTari(wallet || undefined); delete (window as any).__contariWallet; setWallet(null); }
  return { wallet, busy, error, connect, disconnect, setError };
}

function Dashboard({ wallet }: { wallet: WalletSession | null }) {
  const lockers = readLockers();
  const claims = lockers.reduce((sum, item) => sum + item.claims.length, 0);
  return <div className="page-content"><div className="page-title-row"><div><div className="eyebrow">YOUR SPACE</div><h1>Good to see you.</h1><p>Keep your private drops in one place.</p></div><Button to="/app/create"><FilePlus2 size={16}/> Create locker</Button></div><div className="stat-grid"><div className="stat-card"><span>YOUR LOCKERS</span><b>{lockers.length.toString().padStart(2,"0")}</b><small>Synced from your Contari workspace</small></div><div className="stat-card"><span>UNLOCK CLAIMS</span><b>{claims.toString().padStart(2,"0")}</b><small>Recorded on this device</small></div><div className="stat-card"><span>WALLET STATUS</span><b className="stat-status">{wallet ? "Connected" : "Not connected"}</b><small>{wallet ? shortAddress(wallet.address) : "Connect to verify access"}</small></div></div><div className="content-heading"><div><h2>Recent lockers</h2><p>Your latest private links</p></div><Link to="/app/library">View all <ArrowRight size={14}/></Link></div>{loadError && <p className="form-error">{loadError}</p>}{lockers.length ? <div className="locker-list">{lockers.slice(0,4).map(item => <LockerRow key={item.id} locker={item}/>)}</div> : <EmptyState/>}<div className="workspace-note"><Sparkles size={18}/><div><b>Start with a private note</b><p>Write something you want to share with intention. Contari encrypts the content in your browser before saving it.</p></div><Button to="/app/create" variant="secondary">Create a locker <ArrowRight size={14}/></Button></div></div>;
}

function EmptyState() {
  return <div className="empty-state"><div className="empty-icon"><LockKeyhole size={22}/></div><h3>No lockers yet</h3><p>Your private content will appear here after you create your first locker.</p><Button to="/app/create">Create your first locker <ArrowRight size={15}/></Button></div>;
}

function LockerRow({ locker }: { locker: Locker }) {
  return <Link to={"/l/" + locker.id} className="locker-row"><span className="locker-row-icon"><FileLock2 size={18}/></span><span className="locker-row-copy"><b>{locker.title}</b><small>{new Date(locker.createdAt).toLocaleDateString()} · {locker.claims.length} unlocks</small></span><span className="locker-gate">{locker.gate === "wallet" ? "Tari wallet" : "Selected wallets"}</span><ArrowUpRight size={16}/></Link>;
}

function CreateLocker({ wallet }: { wallet: WalletSession | null }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [gate, setGate] = useState<"wallet" | "allowlist">("wallet");
  const [allowed, setAllowed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!title.trim() || !content.trim()) { setError("Add a title and the content you want to lock."); return; }
    const allowedWallets = allowed.split(/[\n, ]+/).map(value => value.trim()).filter(Boolean);
    if (gate === "allowlist" && !allowedWallets.length) { setError("Add at least one Tari wallet address, or choose any wallet."); return; }
    setBusy(true);
    try {
      const encrypted = await encryptContent(content);
      const id = crypto.randomUUID().replaceAll("-","").slice(0,12);
      const locker: Locker = { id, title: title.trim(), description: description.trim(), ciphertext: encrypted.ciphertext, iv: encrypted.iv, createdAt: new Date().toISOString(), creator: wallet?.address || "Local demo creator", gate, allowedWallets, claims: [] };
      saveLocker(locker);
      navigate("/l/" + id + "#key=" + encrypted.key + "&owner=1");
    } catch { setError("Your browser could not encrypt this content. Try a modern browser with Web Crypto enabled."); }
    finally { setBusy(false); }
  }
  return <div className="page-content narrow"><Link to="/app" className="back-link"><ArrowLeft size={15}/> Back to workspace</Link><div className="eyebrow">NEW PRIVATE DROP</div><h1>Create a locker.</h1><p className="page-intro">Write the content, choose who can open it, then share the link.</p><form className="form-card" onSubmit={submit}><label>Locker title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. The next chapter" maxLength={80}/></label><label>Short description <span>OPTIONAL</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="A little context for people opening the link" maxLength={160}/></label><label>Your content<textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Write your private note, announcement or message here..." rows={8}/><small>Encrypted in your browser with AES-GCM before it is saved.</small></label><div className="form-divider"/><div className="form-label">WHO CAN OPEN THIS?</div><div className="gate-options"><button type="button" className={gate==="wallet"?"gate-option selected":"gate-option"} onClick={()=>setGate("wallet")}><span className="gate-radio"/><span><b>Any Tari wallet</b><small>Require a fresh wallet ownership signature.</small></span></button><button type="button" className={gate==="allowlist"?"gate-option selected":"gate-option"} onClick={()=>setGate("allowlist")}><span className="gate-radio"/><span><b>Selected wallets</b><small>Only allow the wallet addresses you list.</small></span></button></div>{gate==="allowlist"&&<label>Allowed wallet addresses<textarea rows={3} value={allowed} onChange={e=>setAllowed(e.target.value)} placeholder="otl_... one address per line"/></label>}{error&&<p className="form-error">{error}</p>}<div className="form-actions"><Button to="/app" variant="secondary">Cancel</Button><button className="button button-primary" type="submit" disabled={busy}>{busy?"Encrypting...":<>Encrypt & create locker <ArrowRight size={15}/></>}</button></div></form><div className="notice compact"><ShieldCheck size={17}/><p>The encryption key is placed in the link fragment. Anyone who receives the complete link has the key, but must still pass the wallet check in this demo. Keep the link private.</p></div></div>;
}

function LockerView({ wallet, onConnect }: { wallet: WalletSession | null; onConnect: () => Promise<void> }) {
  const { id = "" } = useParams();
  const locker = getLocker(id);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"locked" | "unlocking" | "open" | "error">("locked");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const key = new URLSearchParams(window.location.hash.slice(1)).get("key") || "";
  useEffect(() => { setIsOwner(new URLSearchParams(window.location.hash.slice(1)).get("owner")==="1"); }, []);
  async function unlock() {
    if (!locker) return;
    setMessage(""); setStatus("unlocking");
    try {
      let activeWallet = wallet;
      if (!activeWallet) { await onConnect(); activeWallet = (window as any).__contariWallet || null; }
      if (!activeWallet) throw new Error("Connect your Tari wallet, then try again.");
      if (locker.gate === "allowlist" && !locker.allowedWallets.some(address => address.toLowerCase() === activeWallet!.address.toLowerCase())) throw new Error("This wallet is not on the access list.");
      if (!key) throw new Error("This link is missing its decryption key. Ask the creator to share the complete link.");
      const proof = await proveWalletOwnership(activeWallet, locker.id);
      const plain = await decryptContent(locker.ciphertext, locker.iv, key);
      setContent(plain);
      updateLocker(locker.id, current => ({...current, claims:[{address:activeWallet!.address,at:new Date().toISOString(),proof:JSON.stringify(proof)},...current.claims]}));
      setStatus("open");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not unlock this content."); setStatus("error"); }
  }
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true); setTimeout(()=>setCopied(false),1800);
  }
  if (!locker) return <div className="public-locker"><div className="missing-card"><LockKeyhole size={26}/><h1>{loadError ? "Could not load locker" : "Locker not found"}</h1><p>{loadError || "This locker may have been removed or the link is incorrect."}</p><Button to="/app">Go to workspace</Button></div></div>;
  return <div className="public-locker"><div className="public-top"><Brand/><span>PRIVATE CONTENT LINK</span><Button to="/app" variant="quiet">Workspace <ArrowUpRight size={14}/></Button></div><div className="public-card"><div className="public-card-top"><span className="public-icon"><FileLock2 size={21}/></span><span className="secure-label"><span className="mini-dot"/> ENCRYPTED CONTENT</span></div><div className="public-title"><div className="eyebrow">CONTARI / {locker.id.toUpperCase()}</div><h1>{locker.title}</h1><p>{locker.description || "The creator has shared something privately with you."}</p></div>{status==="open"?<div className="unlocked-content"><div className="unlock-success"><CheckCircle2 size={18}/> Wallet challenge signed</div><div className="content-paper">{content}</div><div className="claim-detail"><Fingerprint size={15}/> {message || "Content decrypted in this browser"} · {shortAddress(wallet?.address || "connected wallet")}</div></div>:<div className="locked-panel"><div className="big-lock"><LockKeyhole size={27}/></div><h2>This content is locked.</h2><p>Connect your Tari wallet and sign a one-time ownership challenge to prove this wallet is yours.</p><div className="access-row"><span><Fingerprint size={15}/> Tari wallet ownership</span><span><ShieldCheck size={15}/> Fresh signature</span></div>{status==="error"&&<div className="form-error">{message}</div>}<button className="button button-dark unlock-button" onClick={unlock} disabled={status==="unlocking"}>{status==="unlocking"?"Waiting for wallet approval...":<><Wallet size={16}/> Connect & unlock <ArrowRight size={15}/></>}</button><button className="copy-link" onClick={copyLink}><Copy size={14}/>{copied?"Link copied":"Copy complete link"}</button></div>}<div className="public-foot"><span>Encrypted with AES-GCM</span><span>Wallet signature requested</span></div></div><p className="public-caption">Shared through <Brand/> · Your wallet stays in your control.</p></div>;
}

function Library() {
  const [items,setItems] = useState(readLockers());
  function remove(id:string) { if(confirm("Delete this locker from this browser?")) { removeLocker(id); setItems(readLockers()); } }
  return <div className="page-content"><div className="page-title-row"><div><div className="eyebrow">YOUR CONTENT</div><h1>My lockers</h1><p>Private links you have created in this browser.</p></div><Button to="/app/create"><FilePlus2 size={16}/> New locker</Button></div>{error && <p className="form-error">{error}</p>}{items.length?<div className="locker-list">{items.map(item=><div className="library-row" key={item.id}><LockerRow locker={item}/><button onClick={()=>remove(item.id)} aria-label="Delete locker"><X size={16}/></button></div>)}</div>:<EmptyState/>}</div>;
}

function Settings({ wallet, onConnect, onDisconnect }: { wallet: WalletSession|null; onConnect:()=>void; onDisconnect:()=>void }) {
  const [network,setNetwork] = useState(wallet?.network || "not connected");
  const [template,setTemplate] = useState(localStorage.getItem("contari_template") || "");
  const [component,setComponent] = useState(localStorage.getItem("contari_component") || "");
  return <div className="page-content narrow"><div className="eyebrow">CONNECTIONS</div><h1>Wallet & network</h1><p className="page-intro">Connect a Tari wallet and configure the contract addresses when the template is published.</p><div className="settings-card"><div className="settings-head"><span className="settings-icon"><Wallet size={19}/></span><div><b>Tari wallet</b><small>Connect through Tari Universe or the Tari wallet extension.</small></div></div>{wallet?<div className="wallet-connected"><span className="wallet-dot"/><div><b>{shortAddress(wallet.address)}</b><small>{wallet.network}</small></div><button onClick={onDisconnect}>Disconnect</button></div>:<Button onClick={onConnect}><Wallet size={15}/> Connect wallet</Button>}</div><div className="settings-card"><div className="settings-head"><span className="settings-icon"><Zap size={19}/></span><div><b>Ootle contract</b><small>These fields are ready for the published Contari template and component.</small></div></div><label>Template address<input value={template} onChange={e=>setTemplate(e.target.value)} placeholder="template_..."/></label><label>Registry component address<input value={component} onChange={e=>setComponent(e.target.value)} placeholder="component_..."/></label><Button variant="secondary" onClick={()=>{localStorage.setItem("contari_template",template);localStorage.setItem("contari_component",component);alert("Contract settings saved in this browser.");}}>Save contract settings</Button><p className="settings-warning">On-chain locker registration is not active until a valid template and component are published and connected to the transaction flow.</p></div><div className="settings-card network-status"><div><b>Current network</b><small>{wallet?network:"Connect a wallet to read the network."}</small></div><span className="network-chip"><span className="network-dot"/> {wallet?network:"Not connected"}</span></div></div>;
}

function NotFound() { return <div className="missing-card"><h1>Page not found</h1><Button to="/">Back home</Button></div>; }

export default function App() {
  const session = useWallet();
  useEffect(() => { if(session.wallet) (window as any).__contariWallet = session.wallet; else delete (window as any).__contariWallet; }, [session.wallet]);
  return <Routes><Route path="/" element={<Landing/>}/><Route path="/how-it-works" element={<HowItWorks/>}/><Route path="/app" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect}><Dashboard wallet={session.wallet}/></AppShell>}/><Route path="/app/create" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect}><CreateLocker wallet={session.wallet}/></AppShell>}/><Route path="/app/library" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect}><Library/></AppShell>}/><Route path="/app/settings" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect}><Settings wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect}/></AppShell>}/><Route path="/l/:id" element={<LockerView wallet={session.wallet} onConnect={session.connect}/>}/><Route path="*" element={<NotFound/>}/></Routes>;
}