import { useEffect } from "react";
const HI: Record<string, string> = {
"Health Dashboard":"स्वास्थ्य डैशबोर्ड","Symptom Checker":"लक्षण जांच","Health Records":"स्वास्थ्य रिकॉर्ड","Diet and Wellness":"आहार और स्वास्थ्य","Health History":"स्वास्थ्य इतिहास","Find a Doctor":"डॉक्टर खोजें","Profile and Settings":"प्रोफ़ाइल और सेटिंग्स","Add health record":"स्वास्थ्य रिकॉर्ड जोड़ें","Check symptoms":"लक्षण जांचें","Save record":"रिकॉर्ड सहेजें","Cancel":"रद्द करें","Save changes":"बदलाव सहेजें","Recent records":"हाल के रिकॉर्ड","Trends":"रुझान","Today":"आज","Choose what to track":"क्या ट्रैक करना है चुनें","Blood pressure":"रक्तचाप","Heart rate":"हृदय गति","Daily steps":"दैनिक कदम","Sleep":"नींद","Water intake":"पानी का सेवन","Blood glucose":"रक्त शर्करा","Weight":"वज़न","Measurement type":"माप का प्रकार","Date and time":"तारीख और समय","Notes (optional)":"टिप्पणी (वैकल्पिक)","Delete":"हटाएं","Start symptom check":"लक्षण जांच शुरू करें","Not feeling well?":"तबीयत ठीक नहीं?","Emergency":"आपातकाल","Name":"नाम","Preferred language":"पसंदीदा भाषा","Units":"इकाइयां",
"Health Screening":"स्वास्थ्य जांच","Participants":"प्रतिभागी","Register participant":"प्रतिभागी पंजीकृत करें","Register":"पंजीकरण करें","Age band (adults)":"आयु वर्ग (वयस्क)","Community code":"समुदाय कोड","Participant":"प्रतिभागी","Select…":"चुनें…",
"Age (years)":"आयु (वर्ष)","Height (cm)":"ऊंचाई (सेमी)","Weight (kg)":"वज़न (किग्रा)","Next":"आगे","Back":"पीछे","Save screening":"जांच सहेजें","Saving…":"सहेजा जा रहा है…","Review":"समीक्षा","Review & consent":"समीक्षा और सहमति","Measurements":"माप",
"Run research assessment":"अनुसंधान आकलन चलाएं","New screening":"नई जांच","Assessment":"आकलन","Systolic BP (mmHg), optional":"सिस्टोलिक रक्तचाप (mmHg), वैकल्पिक","Diastolic BP (mmHg), optional":"डायस्टोलिक रक्तचाप (mmHg), वैकल्पिक","Glucose (mg/dL), optional":"ग्लूकोज़ (mg/dL), वैकल्पिक",
"Glucose measurement type":"ग्लूकोज़ माप का प्रकार","Not measured":"मापा नहीं गया","Personalized Nutrition Planner":"व्यक्तिगत पोषण योजना","Dietary preference":"आहार वरीयता","Vegetarian":"शाकाहारी","Egg-inclusive vegetarian":"अंडा-सहित शाकाहारी","Non-vegetarian":"मांसाहारी",
"Budget tier (relative)":"बजट स्तर (सापेक्ष)","Low":"कम","Medium":"मध्यम","Higher":"अधिक","Allergies and restrictions":"एलर्जी और प्रतिबंध","Generate plan":"योजना बनाएं","Regenerate plan":"योजना फिर बनाएं","Print plan":"योजना प्रिंट करें","Generating…":"बन रहा है…",
"Breakfast":"नाश्ता","Lunch":"दोपहर का भोजन","Evening snack":"शाम का नाश्ता","Dinner":"रात का भोजन","Why these foods?":"ये खाद्य पदार्थ क्यों?","Follow-ups":"फॉलो-अप","Schedule":"समय तय करें","Add":"जोड़ें","Mark completed":"पूर्ण करें","Status":"स्थिति","Due":"देय",
"Sign in":"साइन इन","Sign out":"साइन आउट","Email":"ईमेल","Password":"पासवर्ड","Community Health Dashboard":"सामुदायिक स्वास्थ्य डैशबोर्ड","Communities represented":"प्रतिनिधित्व वाले समुदाय","By community":"समुदाय के अनुसार","By age band":"आयु वर्ग के अनुसार",
"Research Lab":"अनुसंधान प्रयोगशाला","Overview":"अवलोकन","Evaluation":"मूल्यांकन","Explainability":"व्याख्यात्मकता","Comparison":"तुलना","Report":"रिपोर्ट","Help and Documentation":"सहायता और दस्तावेज़","Notifications":"सूचनाएं","Settings":"सेटिंग्स","Account":"खाता","Privacy":"गोपनीयता",
"Administration":"प्रशासन","System health":"सिस्टम स्थिति","Users":"उपयोगकर्ता","Model versions":"मॉडल संस्करण","Consent & privacy":"सहमति और गोपनीयता","Withdraw consent":"सहमति वापस लें","Delete participant":"प्रतिभागी हटाएं","Screenings":"जांचें","Records & Consent":"रिकॉर्ड और सहमति","Screening history":"जांच इतिहास",
"Arogya Guide":"रूरलकेयर गाइड","Your question":"आपका प्रश्न","Send":"भेजें","Nutrition Insights":"पोषण अंतर्दृष्टि","Submit feedback":"प्रतिक्रिया भेजें","Calendar":"कैलेंडर","Agenda":"एजेंडा","List":"सूची","Overdue":"विलंबित","Upcoming":"आगामी","Completed":"पूर्ण","Loading…":"लोड हो रहा है…",
"Follow-up Management":"फॉलो-अप प्रबंधन","Satisfaction (1 to 5)":"संतुष्टि (1 से 5)","Followed the plan":"योजना का पालन","Food access":"भोजन की उपलब्धता","Create user":"उपयोगकर्ता बनाएं","Suspend":"निलंबित करें","Reactivate":"पुनः सक्रिय करें","Role":"भूमिका","Participant (follow-up)":"प्रतिभागी (फॉलो-अप)","Due date":"नियत तिथि","Previous":"पिछला",
"Dashboard":"डैशबोर्ड","Screening":"जांच","Nutrition":"पोषण","Guide":"गाइड","Help":"सहायता","Admin":"प्रशासन","Audit log":"ऑडिट लॉग","Nutrition insights":"पोषण अंतर्दृष्टि","How it works":"यह कैसे काम करता है","Platform features":"प्लेटफ़ॉर्म की विशेषताएं","Responsible AI":"जिम्मेदार AI","Open the demo":"डेमो खोलें","Appearance":"रूप-रंग","Choose how the site looks":"साइट कैसी दिखे, चुनें","Light":"लाइट","Dark":"डार्क","System":"सिस्टम","Create account":"खाता बनाएं","Confirm password":"पासवर्ड की पुष्टि करें","Home":"होम","Welcome to Arogya AI":"रूरलकेयर AI में आपका स्वागत है","Nutrition planner":"पोषण योजना"};
const orig = new WeakMap<Node, string>();
function walk(root: Node, hi: boolean) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n: Node | null;
  while ((n = w.nextNode())) {
    const raw = n.nodeValue || "", key = raw.trim();
    if (hi) { const t = HI[key]; if (t) { if (!orig.has(n)) orig.set(n, raw); n.nodeValue = raw.replace(key, t); } }
    else if (orig.has(n)) { n.nodeValue = orig.get(n)!; orig.delete(n); }
  }
}
export function useAutoTranslate(lang: string) {
  useEffect(() => {
    const hi = lang === "hi"; document.documentElement.lang = lang; walk(document.body, hi); if (!hi) return;
    const opts = { childList: true, subtree: true, characterData: true }; let busy = false;
    const ob = new MutationObserver(() => { if (busy) return; busy = true; ob.disconnect(); walk(document.body, true); ob.observe(document.body, opts); busy = false; });
    ob.observe(document.body, opts); return () => ob.disconnect();
  }, [lang]);
}
