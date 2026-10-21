import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./icons";
import { api } from "./api";
import { WaterScene } from "./art";

type Topic = { id: string; title: string; icon: string; words: RegExp; q: string; a: string[]; src: string };
const GEN = "General public-health education. Check the wording against current national guidance.";

const TOPICS: Topic[] = [
  { id: "bmi", title: "BMI", icon: "pulse", words: /\bbmi\b|body mass|overweight|underweight/i, q: "What is BMI?",
    a: ["BMI is weight in kilograms divided by height in metres squared. For adults it is a quick screening number, not a diagnosis.", "It does not suit children, pregnant women or very muscular people. Some South Asian groups can have more health risk at a lower BMI, so ask a health worker how to read yours."], src: GEN },
  { id: "diet", title: "Balanced diet", icon: "leaf", words: /balanced|meal|diet|plate|nutrition|food|eat/i, q: "What is a balanced meal?",
    a: ["A balanced plate usually has a cereal or millet, a pulse or other protein food (dal, eggs, curd, fish, paneer), vegetables including leafy greens, and fruit when you can get it.", "Cut back on very salty, sugary and deep-fried foods. The Diet and Wellness page can build a budget-friendly plan around your preferences and allergies."], src: "General guidance in line with WHO healthy-diet advice and Indian dietary guidelines. Verify wording at source." },
  { id: "water", title: "Water and ORS", icon: "leaf", words: /water|hydrat|thirst|ors\b|dehydrat|diarrh|loose motion|vomit/i, q: "How much water should I drink, and what is ORS?",
    a: ["Most healthy adults do well by drinking water regularly through the day and more in hot weather or when working outdoors. Pale yellow urine is a simple sign you are drinking enough.", "For loose motions or vomiting, oral rehydration solution (ORS) replaces lost water and salts. Use packets as the pack directs and with clean boiled and cooled water. See a doctor soon if there is blood in the stool, the person cannot keep fluids down, is very sleepy, or it is a baby or young child."], src: GEN },
  { id: "hands", title: "Handwashing", icon: "shield", words: /hand ?wash|wash.*hand|hygiene|soap|germ|infection/i, q: "When should I wash my hands?",
    a: ["Wash with soap and clean water for at least 20 seconds: before eating or cooking, after using the toilet, after cleaning a child, and after coughing, sneezing or touching animals.", "It is one of the simplest ways to prevent diarrhoea and many infections."], src: GEN },
  { id: "fever", title: "Fever", icon: "pulse", words: /fever|temperature|bukhar|chills/i, q: "What should I do about a fever?",
    a: ["Rest, drink plenty of fluids and dress lightly. Do not use medicines I cannot advise on without asking a doctor or pharmacist.", "Get medical help soon for a fever that lasts more than 3 days, or comes with a stiff neck, a rash, confusion, trouble breathing, or severe pain. Any fever in a baby under 3 months, or in a pregnant woman, needs a health professional promptly."], src: GEN },
  { id: "bp", title: "Blood pressure", icon: "pulse", words: /blood pressure|\bbp\b|hypertens|systolic|diastolic/i, q: "How do I measure blood pressure properly?",
    a: ["Sit quietly for 5 minutes with your back supported, feet flat and the arm resting at heart level. Do not talk, and avoid tea, coffee, smoking or exercise for 30 minutes before.", "One reading does not decide anything. A health professional looks at repeated readings. Readings that stay at or above 140/90 should be checked by a doctor. A very high reading with chest pain, severe headache, weakness or confusion is an emergency: call 112."], src: GEN },
  { id: "diabetes", title: "Diabetes signs", icon: "pulse", words: /diabet|sugar|glucose|insulin resist/i, q: "What are common signs of high blood sugar?",
    a: ["Common signs are feeling very thirsty, passing urine often, tiredness, blurred vision, slow-healing wounds and unexplained weight loss. Many people have no signs at all.", "Only a blood test can tell. Ask a health worker about testing if you are over 30, overweight or have family history. This site cannot diagnose diabetes."], src: GEN },
  { id: "activity", title: "Physical activity", icon: "pulse", words: /exercise|activity|walk|steps|workout|fitness|yoga/i, q: "How much activity do adults need?",
    a: ["WHO advises adults to aim for at least 150 minutes a week of moderate activity, such as brisk walking, plus muscle-strengthening activity on 2 days. Any movement is better than none, so start small.", "If you have a heart condition, chest pain or are new to exercise after illness, ask a doctor first."], src: "WHO physical activity guidance for adults." },
  { id: "sleep", title: "Sleep", icon: "pulse", words: /sleep|insomnia|tired|rest/i, q: "How much sleep do I need?",
    a: ["Most adults need about 7 to 9 hours. A regular bedtime, a dark quiet room, less screen time and caffeine late in the day all help.", "See a doctor if you snore loudly with pauses in breathing, are always exhausted, or cannot sleep for weeks."], src: GEN },
  { id: "salt", title: "Salt and sugar", icon: "leaf", words: /salt|sodium|sugar|sweet|pickle|oil|fat/i, q: "How much salt is too much?",
    a: ["WHO advises less than 5 grams of salt a day, about one level teaspoon, counting salt in pickles, papad, chips and packaged foods.", "Choose fresh foods, add salt late, and limit sugary drinks and sweets."], src: "WHO guidance on salt intake." },
  { id: "anaemia", title: "Anaemia and iron", icon: "leaf", words: /anaemi|anemi|iron|haemoglobin|hemoglobin|pale|weak/i, q: "How can I prevent anaemia?",
    a: ["Include iron-rich foods such as green leafy vegetables, pulses, jaggery, eggs, meat or fish, with a vitamin C food like lemon or amla to help absorption.", "Tiredness, a pale look and breathlessness can signal anaemia, but only a blood test confirms it. Pregnant women and adolescent girls should ask the health centre about iron and folic acid supplements."], src: GEN },
  { id: "pregnancy", title: "Pregnancy care", icon: "pin", words: /pregnan|antenatal|delivery|baby|mother|anc\b|newborn/i, q: "What care is needed during pregnancy?",
    a: ["Register early with the nearest health centre or ASHA/ANM, attend all antenatal check-ups, and plan where to deliver in advance.", "Go to a facility urgently for bleeding, severe headache or blurred vision, fits, high fever, swelling of the face and hands, reduced baby movements or leaking fluid. Call 108 or 112 if you cannot reach care."], src: GEN },
  { id: "vaccine", title: "Vaccination", icon: "shield", words: /vaccin|immuni[sz]|injection|polio|measles|booster|dose schedule/i, q: "Where do I find vaccination information?",
    a: ["Children and pregnant women get free vaccines under the national immunisation programme. Ask your ASHA, ANM or nearest health centre for the current schedule and keep the vaccination card safe.", "I cannot say which vaccines a particular person needs. A health worker can."], src: GEN },
  { id: "cough", title: "Long cough and TB", icon: "search", words: /\btb\b|tubercul|cough|sputum|night sweat/i, q: "When is a cough a concern?",
    a: ["A cough lasting 2 weeks or more, especially with fever, night sweats, weight loss or blood in the sputum, should be tested at a health centre. TB testing and treatment are free in government facilities.", "Cough with severe breathlessness or blue lips is an emergency: call 112."], src: GEN },
  { id: "mosquito", title: "Dengue and malaria", icon: "shield", words: /dengue|malaria|mosquito|chikungunya|stagnant/i, q: "How do I prevent mosquito-borne illness?",
    a: ["Do not let water stand in coolers, tyres, pots or roof tanks for more than a week. Use nets and repellents, and wear long sleeves at dusk.", "Fever with severe body pain, rash, bleeding gums or vomiting needs a doctor soon and a blood test. Do not take painkillers without asking a doctor."], src: GEN },
  { id: "heat", title: "Heat and sun", icon: "pulse", words: /heat|sun ?stroke|hot weather|loo\b|summer/i, q: "How do I stay safe in very hot weather?",
    a: ["Drink water often, avoid heavy work at midday, wear light loose clothes, cover your head, and rest in shade.", "Confusion, a very hot dry skin, fainting or a fast pulse can mean heatstroke. Move to shade, cool the body with wet cloths and call 112 or go to a hospital now."], src: GEN },
  { id: "water-safety", title: "Safe drinking water", icon: "leaf", words: /boil|safe water|drinking water|clean water|contaminat|well water/i, q: "How do I make water safe to drink?",
    a: ["Bring water to a rolling boil for at least one minute, then cool it covered. Store it in a clean covered container and pour rather than dipping with hands.", "Chlorine tablets from the health centre also work when boiling is not possible."], src: GEN },
  { id: "mind", title: "Mental wellbeing", icon: "help", words: /stress|anxiety|depress|mental|sad|lonely|worry|panic|mood/i, q: "Where can I get help for stress or low mood?",
    a: ["Talking to someone you trust, regular sleep, daily activity and limiting alcohol all help. Persistent sadness, loss of interest or constant worry for 2 weeks or more is worth discussing with a health professional.", "Tele-MANAS offers free, confidential support: call 14416 or 1800-891-4416. If you are thinking of harming yourself, call 112 or go to the nearest hospital now and tell someone near you."], src: "Tele-MANAS (Government of India)." },
  { id: "smoking", title: "Tobacco and alcohol", icon: "shield", words: /tobacco|smok|cigarette|bidi|gutkha|alcohol|drink(ing)? habit|quit/i, q: "How can I cut down tobacco or alcohol?",
    a: ["Quitting tobacco at any age improves health quickly. Set a quit date, tell family, avoid triggers and ask your health centre about counselling and support.", "Ask your nearest health centre about free quit-support services. Suddenly stopping heavy drinking can be dangerous, so seek medical advice before stopping."], src: GEN },
];

const EMERGENCY = /chest pain|can'?t breathe|cannot breathe|short(ness)? of breath|faint|unconscious|seizure|fit\b|stroke|bleeding|suicid|poison|snake|overdose|self[- ]harm/i;
const MEDICINE = /medicine|medication|tablet|capsule|dose|dosage|antibiotic|prescri|paracetamol|painkiller/i;

type Msg = { who: "me" | "bot"; text: string[]; src?: string; urgent?: boolean; ai?: boolean };

export function Guide() {
  const [log, setLog] = useState<Msg[]>([]); const [q, setQ] = useState(""); const box = useRef<HTMLDivElement>(null);
  const [aiOn, setAiOn] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/assistant/status").then(r => setAiOn(!!r.available)).catch(() => setAiOn(false)); }, []);
  useEffect(() => { const b = box.current; if (b && log.length) b.scrollTop = b.scrollHeight; }, [log]);

  const reply = (text: string): Msg => {
    if (EMERGENCY.test(text)) return { who: "bot", urgent: true, text: ["This may be an emergency. Call 112 now (or 108 for an ambulance) or go to the nearest hospital. I cannot help with emergencies."] };
    if (MEDICINE.test(text)) return { who: "bot", text: ["I cannot advise on medicines or doses. Please ask your doctor or pharmacist."] };
    const hit = TOPICS.map(t => ({ t, n: (text.match(new RegExp(t.words.source, "gi")) || []).length })).filter(x => x.n).sort((a, b) => b.n - a.n)[0];
    if (hit) return { who: "bot", text: hit.t.a, src: hit.t.src };
    return { who: "bot", text: ["I do not have an approved answer for that. Please ask a qualified health professional, or pick one of the topics above."] };
  };
  const ask = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setQ(""); setLog(l => [...l, { who: "me", text: [t] }]);
    const local = reply(t);
    // Emergency and medicine questions are always answered by fixed rules and never sent to the AI.
    if (!aiOn || local.urgent || MEDICINE.test(t)) { setLog(l => [...l, local]); return; }
    setBusy(true);
    try {
      const history = log.filter(m => !m.urgent).slice(-4).map(m => ({ role: m.who === "me" ? "user" : "assistant", text: m.text.join(" ").slice(0, 1500) }));
      const r = await api("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message: t, history }) });
      if (r.status === "ok" && r.answer) setLog(l => [...l, { who: "bot", text: [r.answer], ai: true }]);
      else if (r.answer) setLog(l => [...l, { who: "bot", text: [r.answer], urgent: !!r.urgent }]);
      else setLog(l => [...l, local]);
    } catch { setLog(l => [...l, local]); }
    finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };

  return <>
    <h1>Arogya Guide</h1>
    <p className="sub">Simple health education in plain language. Pick a topic or type a question.</p>
    <WaterScene className="guideart" />
    <div className="note">{aiOn ? "Educational only. Answers are written by an AI assistant (Google Gemini) and may contain mistakes. Do not type your name, phone number or other personal details. Your health records are never shared with it. If it is unavailable, answers come from a small approved list." : "Educational only. Answers come from a small approved list. No personal records are used and no AI model is connected."} For how you feel right now, use the <Link to="/symptoms">Symptom Checker</Link>. In an emergency call <a href="tel:112">112</a>.</div>
    <div className="card"><h2>Popular topics</h2>
      <div className="topics">{TOPICS.map(t => <button key={t.id} type="button" className="topic" onClick={() => { void ask(t.q); }}><Icon name={t.icon} size={16} />{t.title}</button>)}</div></div>
    <div className="card chat" ref={box} aria-live="polite" aria-label="Conversation">
      {!log.length && <div className="empty"><b>Ask me something</b><p className="muted">For example: "What is a balanced meal?" or "How do I stay safe in hot weather?" Tap any topic above to start.</p></div>}
      {log.map((m, i) => <div key={i} className={"bubble " + m.who + (m.urgent ? " urgent" : "")}>
        <span className="who">{m.who === "me" ? "You" : m.ai ? "Guide (AI)" : "Guide"}</span>{m.text.map((p, n) => <p key={n}>{p}</p>)}{m.src && <span className="tag">Source: {m.src}</span>}{m.ai && <span className="tag">AI-generated. General information only, not medical advice.</span>}</div>)}
    </div>
    <form className="card" onSubmit={submit}><label htmlFor="q">Your question</label>
      <div className="pwrow"><input id="q" value={q} maxLength={300} placeholder="Type a question, for example: how much water should I drink?" onChange={e => setQ(e.target.value)} /><button className="btn" disabled={!q.trim() || busy}>{busy ? "Thinking…" : "Send"}</button></div>
      {log.length > 0 && <p className="small"><button type="button" className="linkbtn" onClick={() => setLog([])}>Clear conversation</button></p>}</form>
    <p className="muted small">The Guide cannot diagnose, advise on medicines or replace a doctor. Please check numbers and schedules with your local health centre.</p>
  </>;
}
