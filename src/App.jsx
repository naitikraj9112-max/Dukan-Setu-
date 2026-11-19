import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, Check, CheckCheck, CheckCircle2, ChevronDown,
  CircleHelp, Paperclip, Image as ImageIcon, Menu, Mic, MoreVertical, Package,
  Phone, Plus, Search, Send, Settings, ShoppingBag, Smile,
  Sparkles, Store, UserRound, Video, X
} from "lucide-react";

const initialChats = [
  {
    id: 1, name: "Rahul Sharma", initials: "RS", color: "bg-orange-100 text-orange-700",
    last: "Please send the order by 6 PM", time: "10:42 AM", unread: 2,
    messages: [
      { id: 1, from: "them", type: "text", text: "Namaste bhaiya! Aaj ka samaan chahiye.", time: "10:35 AM" },
      { id: 2, from: "them", type: "voice", duration: "0:08", transcript: "2 kilo chawal, 1 litre doodh aur 3 packet Maggi bhej dena.", time: "10:36 AM" },
      { id: 3, from: "ai", type: "ai", text: "I understood your voice note and prepared an order. Please review the items below.", time: "10:36 AM" },
      { id: 4, from: "ai", type: "order", time: "10:37 AM", status: "Awaiting confirmation",
        items: [{ name: "Rice", detail: "2 kg", price: 120 }, { name: "Milk", detail: "1 litre", price: 32 }, { name: "Maggi noodles", detail: "3 packets", price: 45 }] },
      { id: 5, from: "me", type: "text", text: "Plea send the order by 6 PM", time: "10:42 AM", read: true }
    ]
  },
  {
    id: 2, name: "Priya Nair", initials: "PN", color: "bg-pink-100 text-pink-700",
    last: "Thank you!", time: "9:18 AM", unread: 0,
    messages: [
      { id: 1, from: "them", type: "text", text: "Can I get 1 kg sugar and half a kg tea powder?", time: "9:12 AM" },
      { id: 2, from: "ai", type: "ai", text: "I found both products in the store catalogue.", time: "9:13 AM" },
      { id: 3, from: "ai", type: "order", time: "9:14 AM", status: "Confirmed", items: [{ name: "Sugar", detail: "1 kg", price: 48 }, { name: "Tea powder", detail: "500 g", price: 145 }] },
      { id: 4, from: "them", type: "text", text: "Thank you!", time: "9:18 AM" }
    ]
  },
  {
    id: 3, name: "Arjun Kumar", initials: "AK", color: "bg-blue-100 text-blue-700",
    last: "Do you have fresh curd?", time: "Yesterday", unread: 0,
    messages: [{ id: 1, from: "them", type: "text", text: "Do you have fresh curd today?", time: "Yesterday" }]
  },
  {
    id: 4, name: "Sneha Reddy", initials: "SR", color: "bg-violet-100 text-violet-700",
    last: "Voice message", time: "Yesterday", unread: 0,
    messages: [{ id: 1, from: "them", type: "voice", duration: "0:05", transcript: "Ondu litre oil mattu eradu bread packet beku.", time: "Yesterday" }]
  }
];

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ chat, small = false }) {
  return <div className={`${small ? "h-10 w-10" : "h-11 w-11"} ${chat.color} flex shrink-0 items-center justify-center rounded-full text-sm font-semibold`}>{chat.initials}</div>;
}

function VoiceBubble({ message, outgoing = false }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`flex min-w-[220px] items-center gap-3 ${outgoing ? "text-emerald-950" : "text-slate-700"}`}>
      <button onClick={() => setPlaying(!playing)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-700 text-white hover:bg-emerald-800" aria-label="Play voice note">
        {playing ? <AudioLines size={17} /> : <span className="ml-0.5 text-sm">▶</span>}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 items-center gap-[3px]">
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} className={`w-[3px] rounded-full ${outgoing ? "bg-emerald-700/60" : "bg-slate-400"} ${playing && i < 15 ? "opacity-100" : "opacity-60"}`} style={{ height: `${7 + ((i * 13) % 18)}px` }} />
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">{message.duration || "0:03"} · Voice message</div>
      </div>
    </div>
  );
}

function OrderCard({ message, onConfirm, onEdit }) {
  const total = message.items.reduce((sum, item) => sum + Number(item.price), 0);
  const confirmed = message.status === "Confirmed";
  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><ShoppingBag size={16} /> Order summary</div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{message.status}</span>
      </div>
      <div className="space-y-3 px-4 py-3">
        {message.items.map((item, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div><p className="font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.detail}</p></div>
            <span className="font-medium text-slate-700">₹{item.price}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-slate-200 pt-3">
          <div className="flex justify-between text-sm font-bold text-slate-900"><span>Estimated total</span><span>₹{total}</span></div>
          <p className="mt-1 text-[10px] text-slate-500">Final bill may change if stock or prices change.</p>
        </div>
        {!confirmed && (
          <div className="flex gap-2 pt-1">
            <button onClick={onConfirm} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800"><Check size={14} /> Confirm order</button>
            <button onClick={onEdit} className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Modify</button>
          </div>
        )}
        {confirmed && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><CheckCircle2 size={15} /> Order confirmed successfully</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [chats, setChats] = useState(initialChats);
  const [activeId, setActiveId] = useState(1);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const bottomRef = useRef(null);

  const activeChat = chats.find(chat => chat.id === activeId) || chats[0];
  const filteredChats = chats.filter(chat => chat.name.toLowerCase().includes(search.toLowerCase()));
  const updateMessages = (updater) => setChats(current => current.map(chat => chat.id === activeId ? { ...chat, messages: updater(chat.messages) } : chat));

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeChat.messages]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    updateMessages(messages => [...messages, { id: Date.now(), from: "me", type: "text", text, time: formatTime(), read: false }]);
    setDraft("");
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert("Audio recording is not supported in this browser. Try the latest Chrome or Edge on localhost/HTTPS.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        const duration = `0:${String(recordSeconds).padStart(2, "0")}`;
        updateMessages(messages => [...messages, { id: Date.now(), from: "me", type: "voice", duration, audioUrl, time: formatTime(), read: false }]);
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setRecordSeconds(seconds => seconds + 1), 1000);
    } catch {
      alert("Microphone permission was denied. Please allow microphone access in your browser.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const confirmOrder = (messageId) => {
    updateMessages(messages => messages.map(message => message.id === messageId ? { ...message, status: "Confirmed" } : message));
    updateMessages(messages => [...messages, { id: Date.now(), from: "ai", type: "ai", text: "Your order has been marked as confirmed. The store will process it shortly.", time: formatTime() }]);
  };

  const modifyOrder = () => {
    setDraft("I'd like to modify my order: ");
    document.querySelector("textarea")?.focus();
  };

  return (
    <div className="h-dvh overflow-hidden bg-[#e9edef] text-slate-800">
      <div className="mx-auto flex h-full max-w-[1600px] bg-white shadow-xl">
        <aside className={`${mobileChatOpen ? "hidden" : "flex"} w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-[350px] lg:w-[390px]`}>
          <div className="flex h-[68px] items-center justify-between bg-[#f0f2f5] px-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-800 text-white"><Store size={20} /></div>
              <div><h1 className="text-base font-bold tracking-tight text-slate-900">KiranaVoice</h1><p className="text-[11px] text-slate-500">Voice-first grocery ordering</p></div>
            </div>
            <div className="flex items-center gap-1 text-slate-500"><button className="rounded-full p-2 hover:bg-slate-200" title="New chat"><Plus size={19}/></button><button className="rounded-full p-2 hover:bg-slate-200" title="Menu"><MoreVertical size={19}/></button></div>
          </div>
          <div className="border-b border-slate-100 p-3">
            <div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 py-2.5"><Search size={16} className="text-slate-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or start a new chat" className="w-full bg-transparent text-xs outline-none placeholder:text-slate-500"/></div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredChats.map(chat => (
              <button key={chat.id} onClick={() => { setActiveId(chat.id); setMobileChatOpen(true); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-50 ${activeId === chat.id ? "bg-[#f0f2f5]" : "bg-white"}`}>
                <Avatar chat={chat}/>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-800">{chat.name}</p><span className="shrink-0 text-[10px] text-slate-500">{chat.time}</span></div><div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-xs text-slate-500">{chat.last}</p>{chat.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-700 px-1 text-[10px] font-semibold text-white">{chat.unread}</span>}</div></div>
              </button>
            ))}
            {filteredChats.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No chats found.</p>}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 bg-[#f7f8fa] px-4 py-3 text-[11px] text-slate-500"><Sparkles size={14} className="text-emerald-700"/> AI order assistant is ready</div>
        </aside>

        <main className={`${mobileChatOpen ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
          <header className="z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200 bg-[#f0f2f5] px-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button onClick={() => setMobileChatOpen(false)} className="rounded-full p-2 text-slate-600 hover:bg-slate-200 md:hidden"><ArrowLeft size={19}/></button>
              <Avatar chat={activeChat} small/>
              <button onClick={() => setShowInfo(!showInfo)} className="min-w-0 text-left"><p className="truncate text-sm font-semibold text-slate-900">{activeChat.name}</p><p className="text-[11px] text-slate-500">Customer · KiranaVoice chat</p></button>
            </div>
            <div className="flex items-center gap-1 text-slate-500 sm:gap-2"><button className="rounded-full p-2 hover:bg-slate-200" title="Voice call"><Phone size={18}/></button><button className="rounded-full p-2 hover:bg-slate-200" title="Video call"><Video size={19}/></button><button onClick={() => setShowInfo(!showInfo)} className="rounded-full p-2 hover:bg-slate-200" title="Chat information"><MoreVertical size={19}/></button></div>
          </header>

          {showInfo && <div className="border-b border-slate-200 bg-white px-5 py-3 text-xs text-slate-600"><div className="flex items-center justify-between"><span>Customer profile · {activeChat.name}</span><button onClick={() => setShowInfo(false)}><X size={15}/></button></div><p className="mt-1 text-slate-400">Customer details will be connected to the backend later.</p></div>}

          <section className="chat-wallpaper flex-1 overflow-y-auto px-3 py-5 sm:px-6 lg:px-10">
            <div className="mx-auto flex max-w-[850px] flex-col gap-3">
              <div className="mx-auto mb-2 rounded-lg bg-[#fff5d4] px-3 py-2 text-center text-[10px] leading-relaxed text-amber-900 shadow-sm">Messages in this demo are stored locally in your browser session. End-to-end encryption is not implemented.</div>
              {activeChat.messages.map(message => {
                const outgoing = message.from === "me";
                const ai = message.from === "ai";
                return (
                  <div key={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                    <div className={`relative max-w-[88%] rounded-xl px-3 py-2 shadow-sm sm:max-w-[75%] ${outgoing ? "rounded-tr-sm bg-[#d9fdd3]" : ai ? "rounded-tl-sm border border-emerald-100 bg-[#f1fbf4]" : "rounded-tl-sm bg-white"}`}>
                      {ai && <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800"><Sparkles size={12}/> KiranaVoice AI</div>}
                      {message.type === "text" && <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-800">{message.text}</p>}
                      {message.type === "ai" && <p className="max-w-[440px] text-[13px] leading-relaxed text-slate-700">{message.text}</p>}
                      {message.type === "voice" && (
                        <div className="min-w-[220px]">
                          {message.audioUrl ? <audio controls src={message.audioUrl} className="h-9 max-w-full"/> : <VoiceBubble message={message} outgoing={outgoing}/>}
                          {message.transcript && <div className="mt-2 border-t border-slate-200/70 pt-2"><p className="text-[10px] font-semibold text-slate-500">VOICE NOTE TRANSCRIPT</p><p className="mt-1 text-xs leading-relaxed text-slate-700">{message.transcript}</p></div>}
                        </div>
                      )}
                      {message.type === "order" && <OrderCard message={message} onConfirm={() => confirmOrder(message.id)} onEdit={modifyOrder}/>}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-slate-400">{message.time}{outgoing && (message.read ? <CheckCheck size={13} className="text-sky-600"/> : <Check size={12}/>)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>
          </section>

          <footer className="shrink-0 border-t border-slate-200 bg-[#f0f2f5] px-2 py-3 sm:px-5">
            {recording && <div className="mx-auto mb-2 flex max-w-[850px] items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600"/> Recording voice note · 0:{String(recordSeconds).padStart(2, "0")}</span><button onClick={stopRecording} className="font-semibold">Stop & send</button></div>}
            <div className="mx-auto flex max-w-[850px] items-end gap-2">
              <button className="hidden rounded-full p-2.5 text-slate-500 hover:bg-slate-200 sm:block" title="Emoji"><Smile size={21}/></button>
              <button className="rounded-full p-2.5 text-slate-500 hover:bg-slate-200" title="Attach file"><Paperclip size={20}/></button>
              <div className="flex min-h-[44px] flex-1 items-center rounded-xl bg-white px-3 shadow-sm"><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }} rows={1} placeholder="Type a message" className="max-h-28 min-h-[22px] w-full resize-none bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"/></div>
              {draft.trim() ? <button onClick={sendText} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-white shadow-sm hover:bg-emerald-800" title="Send message"><Send size={18}/></button> : <button onClick={recording ? stopRecording : startRecording} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-sm ${recording ? "bg-red-600 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-800"}`} title={recording ? "Stop and send voice note" : "Record voice note"}>{recording ? <Check size={20}/> : <Mic size={20}/>}</button>}
            </div>
            <p className="mt-2 text-center text-[9px] text-slate-400">KiranaVoice demo · Voice notes are recorded locally; backend upload will be added later.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}