import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleHelp, Copy, FileLock2, FilePlus2, Fingerprint, FolderOpen, KeyRound, LockKeyhole, Menu, MoreHorizontal, ShieldCheck, Sparkles, Wallet, X, Zap } from "lucide-react";
import { connectTari, disconnectTari, proveWalletOwnership, shortAddress, type WalletSession } from "./tari";
import { decryptContent, encryptContent, getLocker, loadLocker, loadMyLockers, createRemoteLocker, readLockers, saveLocker, type Locker } from "./storage";

import { registerLockerOnOotle, claimLockerOnOotle, getOotleTransactionResult, getConfiguredOotleComponent, isValidOotleComponentAddress } from "./ootle";

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
  return <footer className="site-footer"><Brand/><span>Tari wallet access · Ootle mainnet deployment pending.</span><div><Link to="/how-it-works">How it works</Link><Link to="/app">Workspace</Link><a href="https://tari.com/ootle" target="_blank" rel="noreferrer">Tari Ootle <ArrowUpRight size={12}/></a></div></footer>;
}

function Landing() {
  return <div className="marketing"><SiteHeader/><main>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> ENCRYPTED LINKS FOR SELECTIVE SHARING</div><h1>Share a link.<br/>Choose who gets in.</h1><p className="hero-lede">Keep a note or drop encrypted. Let any Tari wallet in, or choose the exact addresses that can access it.</p><div className="hero-actions"><Button to="/app/create">Create a locker <ArrowRight size={16}/></Button><Button to="/how-it-works" variant="secondary">See how it works</Button></div><div className="hero-footnote"><ShieldCheck size={15}/> Encrypted in your browser. Access designed around Tari wallets.</div></div>
      <div className="hero-art">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="content-sheet"><div className="sheet-head"><span className="sheet-icon"><FileLock2 size={18}/></span><div><b>Private drop</b><small>Shared with a link</small></div><span className="sheet-menu"><MoreHorizontal size={18}/></span></div><div className="sheet-lines"><i/><i/><i/><i/></div><div className="sheet-lock"><div className="lock-circle"><LockKeyhole size={24}/></div><b>Content is locked</b><small>Connect a Tari wallet to continue</small></div><div className="sheet-bottom"><span><span className="mini-dot"/> AES-256 encrypted</span><span>CONTARI / 001</span></div></div>
        <div className="proof-float"><span className="proof-icon"><Fingerprint size={17}/></span><span><b>Wallet challenge signed</b><small>Ownership proof requested</small></span><CheckCircle2 size={17} className="proof-check"/></div>
        <div className="chain-float"><span className="chain-mark">T</span><span><b>Powered by Tari</b><small>Ootle smart contracts</small></span></div>
      </div>
    </section>
    <section className="trust-strip"><span>FOR THE MOMENTS WHEN A PUBLIC LINK IS TOO OPEN</span><div><span><LockKeyhole size={15}/> Client-side encryption</span><span><Fingerprint size={15}/> Tari wallet challenge</span><span><Zap size={15}/> Tari Ootle</span></div></section>
    <section className="feature-section" id="privacy"><div className="section-heading"><div className="eyebrow">A DIFFERENT KIND OF SHARING</div><h2>The link is easy.<br/><em>Access that starts with a wallet.</em></h2><p>Choose whether a locker is open to any Tari wallet or only the addresses you select. The Ootle contract is being prepared for mainnet enforcement.</p></div><div className="feature-grid"><article><span className="feature-number">01</span><LockKeyhole/><h3>Lock the content</h3><p>Write a private note or message. Contari encrypts it in your browser before saving it.</p></article><article><span className="feature-number">02</span><Fingerprint/><h3>Ask for a wallet proof</h3><p>Visitors sign a fresh ownership challenge with their Tari wallet. No seed phrase ever touches Contari.</p></article><article><span className="feature-number">03</span><ShieldCheck/><h3>Enforce access on Tari</h3><p>Use a published Ootle contract to check wallet ownership and apply the access list.</p></article></div></section>
    <section className="how-preview"><div><div className="eyebrow">MADE FOR SHARING WITH INTENT</div><h2>Give access a little more meaning.</h2><p>Early access, private announcements, creator drops, community notes and more. If the content is not for everyone, Contari gives you a better way to share it.</p><Button to="/how-it-works" variant="secondary">Explore the flow <ArrowRight size={15}/></Button></div><div className="usecase-list"><div><span>01</span><b>Early access</b><small>Share a preview with your community first.</small></div><div><span>02</span><b>Private updates</b><small>Keep sensitive project notes out of public feeds.</small></div><div><span>03</span><b>Creator drops</b><small>Give your supporters a direct way to unlock a release.</small></div></div></section>
    <section className="bottom-cta"><div className="cta-mark"><LockKeyhole size={24}/></div><div><div className="eyebrow">YOUR CONTENT, YOUR CALL</div><h2>Ready to make your first locker?</h2><p>Start with a note. Connect a Tari wallet. See the full flow.</p></div><Button to="/app/create">Create your first locker <ArrowRight size={16}/></Button></section>
  </main><Footer/></div>;
}

function HowItWorks() {
  return <div className="marketing"><SiteHeader/><main className="info-page"><Link to="/" className="back-link"><ArrowLeft size={15}/> Back home</Link><div className="eyebrow">HOW CONTARI WORKS</div><h1>From private note<br/>to <em>wallet-based access.</em></h1><p className="info-lede">Contari encrypts content in your browser. A visitor needs the shared link and can sign a Tari wallet ownership challenge before the demo reveals the content.</p><div className="steps-list"><article><span>01</span><div><h3>Create your locker</h3><p>Write the content, choose who can open it and create a unique locker link. The browser encrypts the content with AES-GCM.</p></div></article><article><span>02</span><div><h3>Share the link</h3><p>The encrypted content is stored with the locker. The decryption key travels in the URL fragment, which browsers do not send to servers.</p></div></article><article><span>03</span><div><h3>Prove wallet ownership</h3><p>The visitor connects a Tari wallet. For selected-wallet lockers, the address must match the creator’s list.</p></div></article><article><span>04</span><div><h3>Unlock and record</h3><p>The preview can request a wallet signature. Full protection requires the published Ootle contract and secure key release. The current preview link still contains the decryption key.</p></div></article></div><div className="notice"><ShieldCheck size={18}/><p><b>Prototype note:</b> encrypted locker records sync through Supabase. Connect a Tari wallet before creating a locker. The wallet address identifies the creator. The wallet signature response is requested but not independently verified, and Ootle does not enforce access yet. The complete link contains the decryption key, so treat it as a bearer secret and do not use this prototype for valuable or highly confidential content.</p></div><Button to="/app/create">Try the demo <ArrowRight size={15}/></Button></main><Footer/></div>;
}


function AppShell({ children, wallet, onConnect, onDisconnect, walletError }: { children: React.ReactNode; wallet: WalletSession | null; onConnect: () => void; onDisconnect: () => void; walletError?: string }) {
  const [mobile, setMobile] = useState(false);
  return <div className="workspace"><aside className={mobile ? "sidebar sidebar-open" : "sidebar"}><div className="sidebar-top"><Brand/><button className="sidebar-close" onClick={() => setMobile(false)}><X size={18}/></button></div><div className="workspace-label">WORKSPACE</div><nav className="side-nav"><NavLink to="/app" end onClick={() => setMobile(false)}><FolderOpen size={17}/> Overview</NavLink><NavLink to="/app/create" onClick={() => setMobile(false)}><FilePlus2 size={17}/> New locker</NavLink><NavLink to="/app/library" onClick={() => setMobile(false)}><LockKeyhole size={17}/> My lockers</NavLink><NavLink to="/app/settings" onClick={() => setMobile(false)}><Wallet size={17}/> Wallet & network</NavLink></nav><div className="sidebar-bottom"><div className="network-chip"><span className="network-dot"/> Ootle mainnet contract pending</div><button className="help-link" onClick={() => window.location.href="/how-it-works"}><CircleHelp size={16}/> How Contari works</button><div className="sidebar-user"><div className="user-avatar">C</div><div><b>{wallet ? shortAddress(wallet.address) : "Guest workspace"}</b><small>{wallet ? wallet.network : "Connect a wallet to unlock"}</small></div><MoreHorizontal size={17}/></div></div></aside><div className="workspace-main"><header className="workspace-top"><button className="mobile-menu workspace-menu" onClick={() => setMobile(!mobile)}><Menu size={19}/></button><div><span className="crumb">Workspace</span><ChevronRight size={14}/><span className="crumb-current">Contari</span></div><div className="top-right">{wallet ? <button className="wallet-pill" onClick={onDisconnect}><span className="wallet-dot"/> {shortAddress(wallet.address)}</button> : <button className="connect-small" onClick={onConnect}><Wallet size={15}/> Connect Tari wallet</button>}</div>{walletError&&<div className="wallet-error" role="status">{walletError}</div>}</header>{children}</div></div>;
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

function Dashboard({ wallet, onConnect }: { wallet: WalletSession | null; onConnect: () => void }) {
  const [lockers, setLockers] = useState(readLockers());
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!wallet) { setLockers([]); return; }
    loadMyLockers(wallet.address).then(rows => { setLoadError(""); setLockers(rows); })
      .catch(error => setLoadError(error instanceof Error ? error.message : "Could not load lockers."));
  }, [wallet?.address]);
  const selected = lockers.filter(item => item.gate === "allowlist").length;
  return <div className="page-content">
    <div className="page-title-row"><div><div className="eyebrow">WORKSPACE</div><h1>Your lockers.</h1><p>Content created with your connected Tari wallet.</p></div><Button to="/app/create"><FilePlus2 size={16}/> Create locker</Button></div>
    {!wallet && <div className="wallet-prompt"><div><b>Connect a Tari wallet</b><p>Your wallet address is your Contari identity. No email account is required.</p></div><Button onClick={onConnect}><Wallet size={15}/> Connect wallet</Button></div>}
    <div className="stat-grid"><div className="stat-card"><span>YOUR LOCKERS</span><b>{lockers.length.toString().padStart(2,"0")}</b><small>Created by this wallet</small></div><div className="stat-card"><span>SELECTED ACCESS</span><b>{selected.toString().padStart(2,"0")}</b><small>Lockers with an address list</small></div><div className="stat-card"><span>WALLET STATUS</span><b className="stat-status">{wallet ? "Connected" : "Not connected"}</b><small>{wallet ? shortAddress(wallet.address) : "Connect to manage lockers"}</small></div></div>
    <div className="content-heading"><div><h2>Recent lockers</h2><p>{wallet ? "Your latest lockers" : "Connect your wallet to see your content"}</p></div><Link to="/app/library">View all <ArrowRight size={14}/></Link></div>
    {loadError && <p className="form-error">{loadError}</p>}
    {lockers.length ? <div className="locker-list">{lockers.slice(0,4).map(item => <LockerRow key={item.id} locker={item}/>)}</div> : <EmptyState/>}
    <div className="workspace-note"><LockKeyhole size={18}/><div><b>Your wallet is your account</b><p>Connect the same Tari wallet to see the lockers created with it. No email or password account.</p></div><Button to="/app/settings" variant="secondary">Wallet settings <ArrowRight size={14}/></Button></div>
  </div>;
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
      if (!wallet) throw new Error("Connect your Tari wallet before creating a locker.");
      const encrypted = await encryptContent(content);
      const id = crypto.randomUUID().replaceAll("-","").slice(0,12);
      const locker: Locker = { id, title: title.trim(), description: description.trim(), ciphertext: encrypted.ciphertext, iv: encrypted.iv, createdAt: new Date().toISOString(), creator: wallet?.address || "Local demo creator", gate, allowedWallets, claims: [] };
      const componentAddress = getConfiguredOotleComponent();
      if (componentAddress) await registerLockerOnOotle(wallet.wallet, componentAddress, id, wallet.network, gate, allowedWallets);
      await createRemoteLocker(locker);
      navigate("/l/" + id + "#key=" + encrypted.key + "&owner=1");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the locker. Check your wallet connection and Supabase project settings."); }
    finally { setBusy(false); }
  }
  return <div className="page-content narrow"><Link to="/app" className="back-link"><ArrowLeft size={15}/> Back to workspace</Link><div className="eyebrow">NEW PRIVATE DROP</div><h1>Create a locker.</h1><p className="page-intro">Connect your Tari wallet, write the content, and choose who can open it.</p><form className="form-card" onSubmit={submit}><label>Locker title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. The next chapter" maxLength={80}/></label><label>Short description <span>OPTIONAL</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="A little context for people opening the link" maxLength={160}/></label><label>Your content<textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Write your private note, announcement or message here..." rows={8}/><small>Encrypted in your browser with AES-GCM before it is saved.</small></label><div className="form-divider"/><div className="form-label">WHO CAN OPEN THIS?</div><div className="gate-options"><button type="button" className={gate==="wallet"?"gate-option selected":"gate-option"} onClick={()=>setGate("wallet")}><span className="gate-radio"/><span><b>Any Tari wallet</b><small>Any Tari wallet on the supported network can request access.</small></span></button><button type="button" className={gate==="allowlist"?"gate-option selected":"gate-option"} onClick={()=>setGate("allowlist")}><span className="gate-radio"/><span><b>Selected wallets</b><small>Only addresses you list can request access.</small></span></button></div>{gate==="allowlist"&&<label>Allowed wallet addresses<textarea rows={3} value={allowed} onChange={e=>setAllowed(e.target.value)} placeholder="otl_... one address per line"/></label>}{error&&<p className="form-error">{error}</p>}<div className="form-actions"><Button to="/app" variant="secondary">Cancel</Button><button className="button button-primary" type="submit" disabled={busy}>{busy?"Encrypting...":<>Encrypt & create locker <ArrowRight size={15}/></>}</button></div></form><div className="notice compact"><ShieldCheck size={17}/><p>Preview mode: the share link currently carries the decryption key. Anyone with the full link can extract it. Do not use this preview for sensitive content. Mainnet protection requires the published Ootle contract and a secure key-release flow.</p></div></div>;
}

function LockerView({ wallet, onConnect }: { wallet: WalletSession | null; onConnect: () => Promise<void> }) {
  const { id = "" } = useParams();
  const [locker, setLocker] = useState<Locker | undefined>(() => getLocker(id));
  const [loadError, setLoadError] = useState("");
  useEffect(() => { let active = true; loadLocker(id).then(value => { if (active) setLocker(value); }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load this locker."); }); return () => { active = false; }; }, [id]);
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
      if (locker.gate === "allowlist" && !locker.allowedWallets.some(address => address.trim().toLowerCase() === activeWallet!.address.trim().toLowerCase())) throw new Error("This Tari wallet is not on the access list.");
      if (!key) throw new Error("This link is missing its decryption key. Ask the creator to share the complete link.");
      const componentAddress = getConfiguredOotleComponent();
      let proof: unknown;
      if (componentAddress) {
        const chain = await claimLockerOnOotle(activeWallet.wallet, componentAddress, locker.id, activeWallet.network, activeWallet.address);
        if (!activeWallet.capabilities?.transactionResultLookup) throw new Error("This Tari wallet cannot look up transaction results. Content remains locked until confirmation can be checked.");
        const finalResult = await getOotleTransactionResult(activeWallet.wallet, chain.transactionId);
        proof = { type: "ootle-transaction", transactionId: chain.transactionId, response: finalResult };
      } else {
        proof = await proveWalletOwnership(activeWallet, locker.id);
      }
      const plain = await decryptContent(locker.ciphertext, locker.iv, key);
      setMessage(componentAddress ? "Ootle claim committed: " + (proof as { transactionId: string }).transactionId : "Wallet challenge received. This preview is not a verified mainnet unlock.");
      setContent(plain);
      setStatus("open");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not unlock this content."); setStatus("error"); }
  }
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true); setTimeout(()=>setCopied(false),1800);
  }
  if (!locker) return <div className="public-locker"><div className="missing-card"><LockKeyhole size={26}/><h1>{loadError ? "Could not load locker" : "Locker not found"}</h1><p>{loadError || "This locker may have been removed or the link is incorrect."}</p><Button to="/app">Go to workspace</Button></div></div>;
  return <div className="public-locker"><div className="public-top"><Brand/><span>PRIVATE CONTENT LINK</span><div className="public-top-actions"><Button to="/app" variant="quiet">Workspace <ArrowUpRight size={14}/></Button></div></div><div className="public-card"><div className="public-card-top"><span className="public-icon"><FileLock2 size={21}/></span><span className="secure-label"><span className="mini-dot"/> ENCRYPTED CONTENT</span></div><div className="public-title"><div className="eyebrow">CONTARI / {locker.id.toUpperCase()}</div><h1>{locker.title}</h1><p>{locker.description || "The creator has shared something privately with you."}</p></div>{status==="open"?<div className="unlocked-content"><div className="unlock-success"><CheckCircle2 size={18}/> {getConfiguredOotleComponent() ? "Ootle claim submitted" : "Wallet challenge received (preview)"}</div><div className="content-paper">{content}</div><div className="claim-detail"><Fingerprint size={15}/> {message || "Wallet claim attempt recorded."} · {shortAddress(wallet?.address || "connected wallet")}</div></div>:<div className="locked-panel"><div className="big-lock"><LockKeyhole size={27}/></div><h2>This content is locked.</h2><p>{getConfiguredOotleComponent() ? "Connect your Tari wallet and approve an Ootle transaction. The contract checks the authenticated signer against the wallet address and applies the locker access rule." : "Connect your Tari wallet. The Ootle registry must be deployed and configured before wallet access can be enforced on-chain."}</p><div className="access-row"><span><Fingerprint size={15}/> Tari wallet ownership</span><span><ShieldCheck size={15}/> Fresh signature</span></div>{status==="error"&&<div className="form-error">{message}</div>}<button className="button button-dark unlock-button" onClick={unlock} disabled={status==="unlocking"}>{status==="unlocking"?"Waiting for wallet approval...":<><Wallet size={16}/> Connect & unlock <ArrowRight size={15}/></>}</button><button className="copy-link" onClick={copyLink}><Copy size={14}/>{copied?"Link copied":"Copy complete link"}</button></div>}<div className="public-foot"><span>Encrypted with AES-GCM</span><span>Wallet signature requested</span></div></div><p className="public-caption">Shared through <Brand/> · Your wallet stays in your control.</p></div>;
}

function Library({ wallet }: { wallet: WalletSession | null }) {
  const [items,setItems] = useState(readLockers());
  const [error,setError] = useState("");
  useEffect(() => {
    if (!wallet) { setItems([]); return; }
    loadMyLockers(wallet.address).then(rows => { setError(""); setItems(rows); })
      .catch(e => setError(e instanceof Error ? e.message : "Could not load lockers."));
  }, [wallet?.address]);
  return <div className="page-content"><div className="page-title-row"><div><div className="eyebrow">YOUR CONTENT</div><h1>My lockers</h1><p>Locker links created by your connected Tari wallet.</p></div><Button to="/app/create"><FilePlus2 size={16}/> New locker</Button></div>
    {!wallet && <div className="wallet-prompt"><b>Connect your Tari wallet to see your lockers.</b></div>}
    {error && <p className="form-error">{error}</p>}
    {items.length ? <div className="locker-list">{items.map(item=><LockerRow key={item.id} locker={item}/>)}</div> : wallet ? <EmptyState/> : null}
  </div>;
}

function Settings({ wallet, onConnect, onDisconnect }: { wallet: WalletSession|null; onConnect:()=>void; onDisconnect:()=>void }) {
  const network = wallet?.network || "not connected";
  const [template,setTemplate] = useState(localStorage.getItem("contari_template") || "");
  const [component,setComponent] = useState(localStorage.getItem("contari_component") || "");
  const [settingsError,setSettingsError] = useState("");
  return <div className="page-content narrow"><div className="eyebrow">CONNECTIONS</div><h1>Wallet & network</h1><p className="page-intro">Connect a Tari wallet and configure the contract addresses when the template is published.</p><div className="settings-card"><div className="settings-head"><span className="settings-icon"><Wallet size={19}/></span><div><b>Tari wallet</b><small>Connect through Tari Universe or the Tari wallet extension.</small></div></div>{wallet?<div className="wallet-connected"><span className="wallet-dot"/><div><b>{shortAddress(wallet.address)}</b><small>{wallet.network}</small></div><button onClick={onDisconnect}>Disconnect</button></div>:<Button onClick={onConnect}><Wallet size={15}/> Connect wallet</Button>}</div><div className="settings-card"><div className="settings-head"><span className="settings-icon"><Zap size={19}/></span><div><b>Ootle contract</b><small>These fields are ready for the published Contari template and component.</small></div></div><label>Template address<input value={template} onChange={e=>setTemplate(e.target.value)} placeholder="template_..."/></label><label>Registry component address<input value={component} onChange={e=>setComponent(e.target.value)} placeholder="component_..."/></label><Button variant="secondary" onClick={()=>{const nextComponent=component.trim();if(nextComponent&&!isValidOotleComponentAddress(nextComponent)){setSettingsError("Enter a component address in the format component_ followed by 64 hexadecimal characters.");return;}localStorage.setItem("contari_template",template.trim());if(nextComponent)localStorage.setItem("contari_component",nextComponent);else localStorage.removeItem("contari_component");setComponent(nextComponent);setSettingsError("");alert("Contract settings saved in this browser.");}}>Save contract settings</Button>{settingsError&&<p className="form-error">{settingsError}</p>}<p className="settings-warning">When a component address is saved, new lockers are registered on Ootle and visitors must submit an on-chain claim before the app decrypts the content. Leave it blank for demo mode. The contract must be deployed to the same network as the connected wallet.</p></div><div className="settings-card network-status"><div><b>Current network</b><small>{wallet?network:"Connect a wallet to read the network."}</small></div><span className="network-chip"><span className="network-dot"/> {wallet?network:"Not connected"}</span></div></div>;
}

function NotFound() { return <div className="missing-card"><h1>Page not found</h1><Button to="/">Back home</Button></div>; }

export default function App() {
  const session = useWallet();
  useEffect(() => { if(session.wallet) (window as any).__contariWallet = session.wallet; else delete (window as any).__contariWallet; }, [session.wallet]);
  return <Routes><Route path="/" element={<Landing/>}/><Route path="/how-it-works" element={<HowItWorks/>}/><Route path="/app" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect} walletError={session.error}><Dashboard wallet={session.wallet} onConnect={session.connect}/></AppShell>}/><Route path="/app/create" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect} walletError={session.error}><CreateLocker wallet={session.wallet}/></AppShell>}/><Route path="/app/library" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect} walletError={session.error}><Library wallet={session.wallet}/></AppShell>}/><Route path="/app/settings" element={<AppShell wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect} walletError={session.error}><Settings wallet={session.wallet} onConnect={session.connect} onDisconnect={session.disconnect}/></AppShell>}/><Route path="/l/:id" element={<LockerView wallet={session.wallet} onConnect={session.connect}/>}/><Route path="*" element={<NotFound/>}/></Routes>;
}