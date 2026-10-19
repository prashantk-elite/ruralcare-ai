"""Symptom information and next-step guidance.

This is NOT a diagnosis tool and has not been clinically validated. Safety comes first and is deterministic:
  1. Fixed emergency rules (checklist, keywords, age and risk rules) decide urgency without any AI.
  2. An optional AI service may only add wording and may only make the advice MORE cautious, never less.
  3. Every AI answer is schema-checked and filtered before it can reach the user, and an AI failure never blocks a result.
Private symptom text is saved for the owner only and is never written to logs or shown to administrators."""
import json, os, re, time
from typing import Optional, Literal
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError
import account, llm

M = None  # the main module, set by register()
ENGINE_VERSION = "rules-1.0"


def T(en, hi):
    return {"en": en, "hi": hi}


NOT_A_DIAGNOSIS = T(
    "This result is general information, not a medical diagnosis. It has not been clinically validated and cannot replace an examination by a qualified health professional.",
    "यह परिणाम सामान्य जानकारी है, चिकित्सकीय निदान नहीं। इसकी नैदानिक रूप से पुष्टि नहीं हुई है और यह किसी योग्य स्वास्थ्य पेशेवर की जांच का विकल्प नहीं है।")
EMERGENCY_MESSAGE = T(
    "Your reported symptoms may require urgent medical attention. Please seek emergency medical care now. Do not rely on this website to rule out a serious condition.",
    "आपके बताए लक्षणों में तुरंत चिकित्सा सहायता की आवश्यकता हो सकती है। कृपया अभी आपातकालीन चिकित्सा सहायता लें। किसी गंभीर स्थिति को खारिज करने के लिए इस वेबसाइट पर निर्भर न रहें।")
URGENCY = {
    1: T("General self-care information", "सामान्य स्व-देखभाल जानकारी"),
    2: T("Medical consultation recommended", "डॉक्टर से परामर्श की सलाह"),
    3: T("Urgent or emergency medical attention", "तत्काल या आपातकालीन चिकित्सा सहायता"),
}

# Contact numbers are shown only with the source they were checked against.
EMERGENCY_NUMBERS = [
    {"number": "112", "label": T("National emergency number (police, health, fire, disaster)", "राष्ट्रीय आपातकालीन नंबर (पुलिस, स्वास्थ्य, अग्निशमन, आपदा)"),
     "note": T("", ""), "source": "Ministry of Home Affairs, Emergency Response Support System",
     "source_url": "https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss", "verified_on": "2026-10-18"},
    {"number": "108", "label": T("Emergency ambulance (National Health Mission service in many states)", "आपातकालीन एम्बुलेंस (कई राज्यों में राष्ट्रीय स्वास्थ्य मिशन की सेवा)"),
     "note": T("Availability and operator differ by state. If 108 does not connect, call 112.", "उपलब्धता और संचालक राज्य के अनुसार अलग हैं। 108 न लगे तो 112 पर कॉल करें।"),
     "source": "Lok Sabha reply on National Health Mission ambulances (2019 data)", "source_url": "https://eparlib.nic.in/bitstream/123456789/973366/1/AU4441.pdf", "verified_on": "2026-10-18"},
]
CRISIS_NUMBERS = [
    {"number": "14416", "alt": "1800-891-4416", "label": T("Tele-MANAS: free mental health support, 24 hours a day, in about 20 languages", "टेली-मानस: निःशुल्क मानसिक स्वास्थ्य सहायता, 24 घंटे, लगभग 20 भाषाओं में"),
     "note": T("", ""), "source": "IIT Kanpur counselling page describing Tele-MANAS (confirm at mohfw.gov.in)", "source_url": "https://iitk.ac.in/counsel/TeleManas.php", "verified_on": "2026-10-18"},
]

SPECIALTIES = ["General Physician", "Cardiologist", "Dermatologist", "Neurologist", "Orthopedic Specialist", "Gastroenterologist",
               "Pulmonologist", "Endocrinologist", "ENT Specialist", "Pediatrician", "Gynecologist", "Mental Health Professional",
               "Eye Specialist (Ophthalmologist)"]
DURATIONS = [("under_1d", "Less than a day", "एक दिन से कम"), ("1_3d", "1 to 3 days", "1 से 3 दिन"), ("4_7d", "4 to 7 days", "4 से 7 दिन"),
             ("1_2w", "1 to 2 weeks", "1 से 2 सप्ताह"), ("over_2w", "More than 2 weeks", "2 सप्ताह से अधिक")]
SEVERITIES = [("mild", "Mild: I can do my usual things", "हल्का: मैं अपने सामान्य काम कर सकता/सकती हूं"),
              ("moderate", "Moderate: it is hard to do some things", "मध्यम: कुछ काम करना कठिन है"),
              ("severe", "Severe: I cannot do my usual things", "गंभीर: मैं सामान्य काम नहीं कर पा रहा/रही")]
AGE_GROUPS = [("infant", "Baby under 1 year", "1 साल से छोटा शिशु"), ("child", "Child 1 to 12 years", "बच्चा, 1 से 12 साल"),
              ("teen", "Teenager 13 to 17 years", "किशोर, 13 से 17 साल"), ("adult", "Adult 18 to 59 years", "वयस्क, 18 से 59 साल"),
              ("older", "Older adult 60 years or more", "वरिष्ठ, 60 साल या अधिक")]
CONDITIONS = [("diabetes", "Diabetes", "मधुमेह"), ("hypertension", "High blood pressure", "उच्च रक्तचाप"), ("heart_disease", "Heart disease", "हृदय रोग"),
              ("lung_disease", "Asthma or long-term lung disease", "दमा या फेफड़ों की पुरानी बीमारी"), ("kidney_disease", "Kidney disease", "गुर्दे की बीमारी"),
              ("weak_immunity", "Weak immunity (for example HIV, cancer treatment, steroid use)", "कमज़ोर रोग प्रतिरोधक क्षमता (जैसे HIV, कैंसर का इलाज, स्टेरॉइड)"),
              ("pregnancy", "Pregnant", "गर्भवती")]
RISK_CONDITIONS = {"diabetes", "heart_disease", "lung_disease", "kidney_disease", "weak_immunity", "pregnancy"}

# Universal emergency checklist, shown to everyone before anything else.
RED_FLAGS = {
    "rf_breathing": T("Severe difficulty breathing, or I can only say a few words at a time, or my lips or face look blue", "सांस लेने में बहुत कठिनाई, या मैं एक बार में कुछ ही शब्द बोल पा रहा/रही हूं, या होंठ या चेहरा नीला दिख रहा है"),
    "rf_chest": T("Strong chest pain, pressure or tightness, or pain spreading to the arm, jaw or back, or with sweating or breathlessness", "सीने में तेज़ दर्द, दबाव या जकड़न, या दर्द का हाथ, जबड़े या पीठ तक फैलना, या पसीना या सांस फूलना"),
    "rf_stroke": T("Sudden weakness or numbness on one side, drooping face, trouble speaking or understanding, or sudden confusion", "अचानक एक तरफ कमज़ोरी या सुन्नपन, चेहरा टेढ़ा होना, बोलने या समझने में परेशानी, या अचानक भ्रम"),
    "rf_faint": T("Fainting, a fit (seizure), or very hard to wake up", "बेहोशी, दौरा पड़ना, या जगाना बहुत कठिन होना"),
    "rf_bleeding": T("Heavy bleeding that will not stop, or vomiting blood or coughing up blood", "भारी रक्तस्राव जो रुक नहीं रहा, या खून की उल्टी या खांसी में खून"),
    "rf_allergy": T("Swelling of the lips, face or throat after a sting, food or medicine, or a sudden rash with trouble breathing", "डंक, भोजन या दवा के बाद होंठ, चेहरे या गले में सूजन, या अचानक दाने के साथ सांस में तकलीफ"),
    "rf_headache": T("A sudden, very severe headache, the worst I have ever had", "अचानक बहुत तेज़ सिरदर्द, जो अब तक का सबसे बुरा है"),
    "rf_snake_poison": T("Snake bite, another poisonous bite or sting, poisoning, or swallowing something harmful such as pesticide or kerosene", "सांप या अन्य ज़हरीले जीव का काटना, ज़हर, या कीटनाशक या मिट्टी का तेल जैसी हानिकारक चीज़ निगलना"),
    "rf_self_harm": T("Thoughts of harming myself or ending my life", "खुद को नुकसान पहुंचाने या जीवन समाप्त करने के विचार"),
    "rf_pregnancy": T("I am pregnant and have heavy bleeding, severe belly pain, or my baby has stopped moving", "मैं गर्भवती हूं और भारी रक्तस्राव, पेट में तेज़ दर्द है, या बच्चे ने हिलना बंद कर दिया है"),
    "rf_baby": T("A baby who is limp, will not feed, is very hard to wake, or is breathing fast with the chest pulling in", "शिशु जो निढाल है, दूध नहीं पी रहा, जगाना बहुत कठिन है, या तेज़ सांस के साथ छाती अंदर धंस रही है"),
}
RED_FLAG_REASON = {
    "rf_breathing": "Severe breathing difficulty can be life-threatening.",
    "rf_chest": "Chest pain with these features can be a sign of a heart emergency.",
    "rf_stroke": "These can be signs of a stroke, where minutes matter.",
    "rf_faint": "Fainting, fits or being hard to wake need emergency assessment.",
    "rf_bleeding": "Heavy bleeding, or blood in vomit or cough, needs emergency care.",
    "rf_allergy": "These can be signs of a severe allergic reaction.",
    "rf_headache": "A sudden severe headache needs urgent assessment.",
    "rf_snake_poison": "Bites, poisoning or swallowing harmful substances need emergency treatment even if you feel well.",
    "rf_self_harm": "Thoughts of self-harm deserve immediate support from people who can help.",
    "rf_pregnancy": "These are warning signs in pregnancy that need urgent care.",
    "rf_baby": "These are danger signs in a baby.",
}
# Plain substring checks (lower-case). They are deliberately broad: a false alarm is safer than a missed emergency.
EMERGENCY_KEYWORDS = [
    "can't breathe", "cant breathe", "cannot breathe", "unable to breathe", "difficulty breathing", "trouble breathing", "gasping",
    "chest pain", "chest tightness", "chest pressure", "heart attack", "stroke", "face drooping", "slurred speech",
    "unconscious", "fainted", "passed out", "seizure", "convulsion", "vomiting blood", "vomited blood", "coughing blood",
    "coughing up blood", "heavy bleeding", "bleeding heavily", "won't stop bleeding", "wont stop bleeding", "snake", "poison", "overdose",
    "pesticide", "kerosene", "suicid", "kill myself", "end my life", "want to die", "self harm", "self-harm", "harm myself",
    "worst headache", "throat swelling", "swollen throat", "anaphyla", "baby not breathing", "not moving",
    "सीने में दर्द", "सांस लेने में", "सांस नहीं", "बेहोश", "दौरा", "खून की उल्टी", "खून की उलटी", "सांप", "ज़हर", "जहर", "आत्महत्या", "मरना चाहता", "मरना चाहती",
]

# id, English, Hindi, specialty, safe-for-self-care, direct-to-specialist, base timeframe, follow-ups, explanations, self-care
def S(id, en, hi, spec, benign, direct, tf, q, explain, care):
    return {"id": id, "en": en, "hi": hi, "spec": spec, "benign": benign, "direct": direct, "tf": tf, "q": q, "explain": explain, "care": care}


SYMPTOMS = [
    S("fever", "Fever or feeling feverish", "बुखार", "General Physician", False, False, "24h", ["fever_high", "fever_neck", "fever_rash"],
      ["A common viral infection such as a cold or flu", "Infections that are common in many places, such as dengue, malaria or typhoid, which need a test to tell apart",
       "A urinary, chest or skin infection", "Less often, another condition that a doctor needs to examine"],
      ["Rest and drink plenty of fluids", "Wear light clothing and keep the room comfortable", "Note the temperature and when the fever started, to tell the doctor",
       "Ask a doctor or pharmacist before taking any medicine"]),
    S("cough", "Cough", "खांसी", "Pulmonologist", True, False, "few_days", ["cough_breath"],
      ["A cold or throat irritation", "Allergy, or irritation from dust or smoke", "A chest infection, especially with fever or breathlessness",
       "Asthma, or another long-lasting cause that needs examination"],
      ["Drink warm fluids and rest", "Stay away from smoke and dust", "Cover your mouth when you cough and wash hands often"]),
    S("sore_throat", "Sore throat", "गले में दर्द या खराश", "ENT Specialist", True, False, "few_days", ["throat_swallow"],
      ["A viral throat infection, which is the most common cause", "A bacterial throat infection", "Allergy or irritation from smoke or dust"],
      ["Sip warm fluids", "Rest your voice", "Adults and older children can gargle with warm salt water"]),
    S("runny_nose", "Runny or blocked nose, sneezing", "नाक बहना या बंद होना, छींकें", "ENT Specialist", True, False, "few_days", [],
      ["A common cold", "Allergy to dust, pollen or smoke", "A sinus infection if it lasts long or comes with facial pain"],
      ["Drink plenty of fluids and rest", "Avoid dust and smoke", "Wash hands often to avoid spreading it"]),
    S("headache", "Headache", "सिरदर्द", "Neurologist", True, False, "few_days", ["headache_neuro", "headache_new"],
      ["A tension headache from stress, poor sleep or eye strain", "Not drinking enough water or skipping meals", "Migraine",
       "Less often, blood pressure or another cause that needs checking"],
      ["Rest in a quiet, dim room", "Drink water and eat regular meals", "Keep a regular sleep routine", "Ask a doctor or pharmacist before taking any medicine"]),
    S("body_ache", "Body ache or muscle pain", "बदन या मांसपेशियों में दर्द", "General Physician", True, False, "few_days", [],
      ["A viral infection", "Overwork or unusual physical effort", "Poor sleep or stress"],
      ["Rest and drink fluids", "Gentle stretching and a warm bath can ease stiff muscles"]),
    S("fatigue", "Tiredness or weakness", "थकान या कमज़ोरी", "General Physician", True, False, "few_days", [],
      ["Poor sleep or stress", "Anaemia (low blood iron), which is common", "An infection that is starting or recovering",
       "Thyroid problems or diabetes, which a blood test can check"],
      ["Keep a regular sleep routine", "Eat regular balanced meals, including leafy greens and pulses", "Drink enough fluids"]),
    S("dizziness", "Dizziness", "चक्कर आना", "General Physician", False, False, "24h", ["dizzy_faint"],
      ["Dehydration, or standing up too quickly", "Low blood sugar from not eating", "Anaemia", "An inner-ear problem", "Blood pressure that is too high or too low"],
      ["Sit or lie down until it passes", "Drink fluids and get up slowly", "Do not drive or climb until you feel steady"]),
    S("weight_loss", "Weight loss without trying", "बिना कारण वज़न घटना", "General Physician", False, False, "week", [],
      ["Eating less because of stress or low mood", "Thyroid problems or diabetes", "Long-lasting infections such as tuberculosis", "Other conditions that need tests"],
      ["Write down how much weight you have lost and over how long, to tell the doctor"]),
    S("chest_pain", "Chest pain or discomfort", "सीने में दर्द या बेचैनी", "Cardiologist", False, True, "today", ["chest_pressure"],
      ["Muscle strain or acidity", "Anxiety or panic", "A chest infection", "A heart-related cause, which only a doctor can rule out"],
      []),
    S("palpitations", "Fast or pounding heartbeat", "दिल की धड़कन तेज़ या ज़ोर से महसूस होना", "Cardiologist", False, True, "24h", ["palp_signs"],
      ["Anxiety, too much tea or coffee, or lack of sleep", "Fever, anaemia or thyroid problems", "A heart rhythm problem, which a doctor can check"],
      ["Sit down and rest", "Avoid tea, coffee and tobacco until you are checked"]),
    S("shortness_of_breath", "Shortness of breath", "सांस फूलना", "Pulmonologist", False, False, "today", ["sob_rest"],
      ["Asthma or a chest infection", "Anaemia", "A heart-related cause", "Anxiety"],
      ["Sit upright and stay calm", "Do not do heavy work until you are checked"]),
    S("wheezing", "Wheezing or whistling when breathing", "सांस लेते समय सीटी जैसी आवाज़", "Pulmonologist", False, False, "24h", ["sob_rest"],
      ["Asthma", "An allergy", "A chest infection"],
      ["Stay away from smoke, dust and cold air", "Sit upright and stay calm"]),
    S("swelling_legs", "Swollen feet or legs", "पैरों या टखनों में सूजन", "General Physician", False, False, "24h", ["leg_one"],
      ["Standing or sitting for a long time, or hot weather", "Swelling related to pregnancy", "A heart, kidney or liver condition", "A blood clot, especially if only one leg is swollen"],
      ["Raise your legs when resting", "Avoid standing for very long periods"]),
    S("abdominal_pain", "Belly (abdominal) pain", "पेट दर्द", "Gastroenterologist", False, False, "24h", ["abd_severe", "abd_right_low"],
      ["Indigestion, gas or constipation", "A stomach infection or food-related illness", "Acidity or a stomach ulcer", "Gallstones, appendicitis or another problem a doctor must examine"],
      ["Rest and take small sips of fluids", "Avoid oily and spicy food for now"]),
    S("nausea_vomiting", "Nausea or vomiting", "जी मिचलाना या उल्टी", "Gastroenterologist", True, False, "few_days", ["dehydration"],
      ["A stomach infection or food-related illness", "Acidity", "Pregnancy, if it could apply", "Infections such as typhoid or hepatitis if it lasts"],
      ["Take small, frequent sips of clean water or oral rehydration solution (ORS) mixed as shown on the packet", "Rest and eat light food when you feel able", "Wash hands well to avoid spreading infection"]),
    S("diarrhea", "Loose motions (diarrhoea)", "दस्त", "Gastroenterologist", True, False, "few_days", ["diarrhea_blood", "dehydration"],
      ["A stomach infection from food or water", "Food that did not agree with you", "Less often, a longer-lasting gut problem"],
      ["Drink oral rehydration solution (ORS) mixed with clean water as shown on the packet, and other safe fluids", "Keep eating light food as you can", "Wash hands with soap after the toilet and before eating"]),
    S("constipation", "Constipation", "कब्ज", "Gastroenterologist", True, False, "few_days", [],
      ["Too little fibre or water in the diet", "Little physical activity", "Changes in routine"],
      ["Drink enough water", "Eat vegetables, fruit, whole grains and pulses", "Walk or stay active each day"]),
    S("heartburn", "Burning in the chest or upper belly (acidity)", "सीने या ऊपरी पेट में जलन (एसिडिटी)", "Gastroenterologist", True, False, "few_days", ["heartburn_alarm"],
      ["Acid reflux or gastritis", "Large, oily or spicy meals", "Less often, an ulcer"],
      ["Eat smaller meals and avoid lying down right after eating", "Limit very spicy and oily food", "Avoid tobacco and alcohol"]),
    S("blood_in_stool", "Blood in the stool, or black stool", "मल में खून या काला मल", "Gastroenterologist", False, False, "24h", [],
      ["Piles or a small tear near the anus", "An infection of the gut", "An ulcer or another problem that needs examination"],
      []),
    S("burning_urination", "Burning or pain when passing urine", "पेशाब में जलन या दर्द", "General Physician", False, False, "24h", ["uti_signs"],
      ["A urinary tract infection, which is common", "Not drinking enough water", "Kidney stones"],
      ["Drink water regularly through the day"]),
    S("thirst_urination", "Very thirsty or passing urine very often", "बहुत प्यास या बार-बार पेशाब", "Endocrinologist", False, False, "few_days", ["dm_signs"],
      ["High blood sugar, which a simple blood test can check", "An infection", "Drinking a lot of fluids"],
      ["Note how often you pass urine and how thirsty you feel, to tell the doctor"]),
    S("blood_in_urine", "Blood in the urine", "पेशाब में खून", "General Physician", False, False, "24h", [],
      ["A urinary infection", "Kidney or bladder stones", "Other problems that need tests"],
      []),
    S("rash", "Skin rash or spots", "त्वचा पर दाने या चकत्ते", "Dermatologist", False, True, "few_days", ["rash_severe"],
      ["Allergy or skin irritation", "A fungal or bacterial skin infection, or scabies", "A viral illness such as chickenpox or measles", "A reaction to a medicine"],
      ["Keep the skin clean and dry and avoid scratching", "Stop using any new soap, cream or cosmetic you started recently", "Do not apply steroid creams unless a doctor advises"]),
    S("itching", "Itchy skin", "त्वचा में खुजली", "Dermatologist", True, True, "few_days", [],
      ["Dry skin", "Allergy or insect bites", "Scabies or a fungal infection, which can spread in families"],
      ["Avoid scratching and keep nails short", "Wear loose cotton clothes", "Use mild soap and keep skin clean and dry"]),
    S("wound_swelling", "Wound, boil or swelling that is red, warm or painful", "घाव, फोड़ा या सूजन (लाल, गर्म, दर्द वाली)", "General Physician", False, False, "24h", ["wound_spread"],
      ["A skin infection", "A boil or abscess", "An insect bite or injury that has become infected"],
      ["Keep the area clean, dry and covered", "Do not squeeze or cut a boil"]),
    S("joint_pain", "Joint pain", "जोड़ों में दर्द", "Orthopedic Specialist", True, False, "few_days", ["joint_hot"],
      ["Strain from overuse", "Arthritis", "Aching joints during a viral illness", "An old or unnoticed injury"],
      ["Rest the joint, then move it gently", "A warm cloth can ease stiffness"]),
    S("back_pain", "Back pain", "पीठ या कमर दर्द", "Orthopedic Specialist", True, False, "few_days", ["back_red"],
      ["Muscle strain or poor posture", "A problem with the spinal discs", "Less often, a kidney or other cause"],
      ["Stay gently active instead of staying in bed", "Avoid lifting heavy loads", "A warm cloth can ease muscle tightness"]),
    S("numbness", "Numbness, tingling or weakness in an arm or leg", "हाथ-पैर में सुन्नपन, झुनझुनी या कमज़ोरी", "Neurologist", False, False, "24h", [],
      ["A pinched nerve, for example from posture", "Low vitamin B12, or nerve damage linked to diabetes", "Another nerve condition that needs examination"],
      ["Avoid sitting or lying in one position for long"]),
    S("ear_pain", "Ear pain", "कान दर्द", "ENT Specialist", False, True, "24h", ["ear_signs"],
      ["An ear infection", "Wax build-up", "Pain spreading from the throat or teeth"],
      ["Keep the ear dry", "Do not put oil, drops or any object in the ear unless a doctor says so"]),
    S("red_eye", "Red, painful or watery eye", "आंख लाल, दर्द या पानी आना", "Eye Specialist (Ophthalmologist)", False, True, "24h", ["eye_vision"],
      ["Conjunctivitis (an infection or allergy)", "Dust or irritation", "Less often, an eye problem that needs quick treatment"],
      ["Wash hands often and do not rub the eye", "Clean around the eye with clean water", "Do not use eye drops unless a doctor advises"]),
    S("low_mood", "Feeling very low, anxious or worried", "बहुत उदास, चिंतित या घबराहट महसूस करना", "Mental Health Professional", True, True, "few_days", [],
      ["Stress from life events or worries", "Anxiety", "Depression, which is common and treatable", "Poor sleep or a physical illness that affects mood"],
      ["Talk to someone you trust about how you feel", "Keep a regular routine for sleep and meals, and get some activity each day",
       "Free support is available at any time through Tele-MANAS: 14416 or 1800-891-4416"]),
    S("sleep_problems", "Trouble sleeping", "नींद न आना", "General Physician", True, False, "few_days", [],
      ["Stress or worry", "Irregular sleep times, or tea and coffee late in the day", "Pain or another health problem"],
      ["Go to bed and wake up at the same times each day", "Avoid tea, coffee and screens in the late evening", "Keep the bedroom dark and quiet"]),
    S("menstrual", "Period problems (heavy, painful, missed or irregular)", "माहवारी की समस्या (अधिक रक्तस्राव, दर्द, देर या अनियमित)", "Gynecologist", False, True, "few_days", ["period_heavy"],
      ["Hormone changes", "Anaemia, or thyroid problems", "Pregnancy", "Fibroids or other conditions that a gynecologist can check"],
      ["Note the dates and how heavy the bleeding is, to tell the doctor"]),
]
SYM = {s["id"]: s for s in SYMPTOMS}

# Follow-up questions. `yes` is the minimum urgency level when the answer is yes; `tf` is the timeframe for level 2.
def Q(id, en, hi, yes, tf="24h"):
    return {"id": id, "en": en, "hi": hi, "yes": yes, "tf": tf}


FOLLOWUPS = {q["id"]: q for q in [
    Q("fever_high", "Is the fever very high (about 39.4 C or 103 F or more), or do you shiver and shake uncontrollably?", "क्या बुखार बहुत तेज़ है (लगभग 39.4 C या 103 F से अधिक), या आपको बहुत कंपकंपी हो रही है?", 2, "today"),
    Q("fever_neck", "Do you also have a stiff neck, or does bright light hurt your eyes?", "क्या गर्दन अकड़ी हुई है, या तेज़ रोशनी से आंखों में दर्द होता है?", 3),
    Q("fever_rash", "Is there a new rash together with the fever?", "क्या बुखार के साथ नए दाने भी हैं?", 2, "today"),
    Q("cough_breath", "Are you breathing fast, or short of breath even when resting?", "क्या आप तेज़ सांस ले रहे हैं, या आराम करते समय भी सांस फूल रही है?", 2, "today"),
    Q("throat_swallow", "Is it hard to swallow your own saliva, are you drooling, or can you not open your mouth fully?", "क्या अपनी लार निगलना कठिन है, लार टपक रही है, या मुंह पूरा नहीं खुल रहा?", 3),
    Q("headache_neuro", "With the headache, do you have vision changes, confusion, weakness, a stiff neck, or fever?", "सिरदर्द के साथ क्या नज़र में बदलाव, भ्रम, कमज़ोरी, गर्दन में अकड़न या बुखार है?", 3),
    Q("headache_new", "Is this a new kind of headache for you, or did it start after a head injury or after the age of 50?", "क्या यह आपके लिए नए तरह का सिरदर्द है, या सिर में चोट के बाद या 50 की उम्र के बाद शुरू हुआ?", 2, "24h"),
    Q("dizzy_faint", "Did you faint, or do you have weakness, trouble speaking, or double vision?", "क्या आप बेहोश हुए, या कमज़ोरी, बोलने में परेशानी या दोहरा दिखना है?", 3),
    Q("chest_pressure", "Does it feel like pressure, tightness or heaviness, or spread to the arm, jaw or back, or come with sweating or breathlessness?", "क्या यह दबाव, जकड़न या भारीपन जैसा लगता है, हाथ, जबड़े या पीठ तक फैलता है, या पसीना या सांस फूलने के साथ है?", 3),
    Q("palp_signs", "Do the palpitations come with chest pain, fainting, or breathlessness?", "क्या धड़कन तेज़ होने के साथ सीने में दर्द, बेहोशी या सांस फूलना है?", 3),
    Q("sob_rest", "Is the breathing trouble there even at rest, or does it wake you at night?", "क्या सांस की तकलीफ आराम करते समय भी है, या रात में नींद से जगा देती है?", 3),
    Q("leg_one", "Is only one leg swollen, painful, red or warm?", "क्या सिर्फ एक पैर में सूजन, दर्द, लालिमा या गर्मी है?", 2, "today"),
    Q("abd_severe", "Is the pain severe and constant, or is your belly hard, or do you keep vomiting with the pain?", "क्या दर्द तेज़ और लगातार है, पेट सख्त है, या दर्द के साथ बार-बार उल्टी हो रही है?", 3),
    Q("abd_right_low", "Is the pain mostly in the lower right belly, with fever or vomiting?", "क्या दर्द ज़्यादातर पेट के निचले दाएं हिस्से में है, बुखार या उल्टी के साथ?", 2, "today"),
    Q("dehydration", "Do you have a very dry mouth, passed little or no urine for 8 hours, or feel very weak or sleepy?", "क्या मुंह बहुत सूखा है, 8 घंटे से कम या बिल्कुल पेशाब नहीं हुआ, या बहुत कमज़ोरी या नींद महसूस हो रही है?", 2, "today"),
    Q("diarrhea_blood", "Is there blood in the stool, or is the stool black?", "क्या मल में खून है या मल काला है?", 2, "today"),
    Q("heartburn_alarm", "Do you have trouble swallowing, repeated vomiting, black stools, or weight loss?", "क्या निगलने में तकलीफ, बार-बार उल्टी, काला मल या वज़न घटना है?", 2, "24h"),
    Q("uti_signs", "Do you have fever, chills, pain in the back or side, or vomiting?", "क्या बुखार, ठंड लगना, पीठ या बगल में दर्द, या उल्टी है?", 2, "today"),
    Q("dm_signs", "Are you also vomiting, breathing fast, very drowsy, or does your breath smell fruity?", "क्या उल्टी, तेज़ सांस, बहुत नींद या सांस में फल जैसी गंध भी है?", 3),
    Q("rash_severe", "Is the rash spreading fast, blistering, peeling painfully, or are there sores in the mouth or eyes?", "क्या दाने तेज़ी से फैल रहे हैं, छाले हैं, दर्दनाक छिलके उतर रहे हैं, या मुंह या आंखों में घाव हैं?", 2, "today"),
    Q("wound_spread", "Are there red streaks spreading from it, fever, or pus with severe pain?", "क्या उससे लाल लकीरें फैल रही हैं, बुखार है, या तेज़ दर्द के साथ मवाद है?", 3),
    Q("joint_hot", "Is the joint very swollen, hot and red, or can you not move it or put weight on it, or did it follow an injury?", "क्या जोड़ बहुत सूजा, गर्म और लाल है, हिल नहीं रहा या वज़न नहीं सह रहा, या चोट के बाद हुआ?", 2, "today"),
    Q("back_red", "Do you have leg weakness or numbness, loss of control of urine or stool, or fever with the back pain?", "क्या पैरों में कमज़ोरी या सुन्नपन, पेशाब या मल पर नियंत्रण न रहना, या पीठ दर्द के साथ बुखार है?", 3),
    Q("ear_signs", "Is there fluid or pus from the ear, hearing loss, or swelling behind the ear?", "क्या कान से पानी या मवाद आ रहा है, सुनाई कम हुआ है, या कान के पीछे सूजन है?", 2, "today"),
    Q("eye_vision", "Has your vision changed, was there an injury, did something enter the eye, or is the pain severe?", "क्या नज़र बदली है, चोट लगी, आंख में कुछ गया, या दर्द तेज़ है?", 3),
    Q("period_heavy", "Are you soaking through a pad every hour for 2 hours or more, or feeling dizzy or faint with the bleeding?", "क्या 2 घंटे या अधिक समय तक हर घंटे पैड भीग रहा है, या रक्तस्राव के साथ चक्कर या बेहोशी जैसा लग रहा है?", 3),
]}

TF = {"today": 0, "24h": 1, "few_days": 2, "week": 3}
TF_LABEL = {
    "today": T("today, as soon as you can", "आज ही, जितनी जल्दी हो सके"),
    "24h": T("within 24 hours", "24 घंटे के भीतर"),
    "few_days": T("within the next 2 to 3 days", "अगले 2 से 3 दिन में"),
    "week": T("within the next week", "अगले एक सप्ताह में"),
}
WARNING_SIGNS = [
    T("Trouble breathing, or chest pain or pressure", "सांस लेने में तकलीफ, या सीने में दर्द या दबाव"),
    T("Fainting, a fit, confusion, or being very hard to wake", "बेहोशी, दौरा, भ्रम, या जगाना बहुत कठिन होना"),
    T("Sudden weakness on one side, or trouble speaking", "अचानक एक तरफ कमज़ोरी, या बोलने में परेशानी"),
    T("Bleeding that will not stop, or vomiting or coughing up blood", "रुकता न हुआ रक्तस्राव, या खून की उल्टी या खांसी में खून"),
    T("Symptoms getting quickly worse, or a very high fever that does not settle", "लक्षणों का तेज़ी से बिगड़ना, या बहुत तेज़ बुखार जो कम न हो"),
    T("You cannot keep fluids down, or you are passing very little urine", "आप तरल पदार्थ नहीं रोक पा रहे, या बहुत कम पेशाब हो रहा है"),
]


def keyword_hits(text):
    t = (text or "").lower()
    return [k for k in EMERGENCY_KEYWORDS if k in t]


def questions_for(symptoms, age_group, conditions):
    ids, seen = [], set()
    for sid in symptoms:
        for qid in SYM.get(sid, {}).get("q", []):
            if qid not in seen:
                seen.add(qid)
                ids.append(qid)
    return [{"id": q, "en": FOLLOWUPS[q]["en"], "hi": FOLLOWUPS[q]["hi"]} for q in ids]


class AssessIn(BaseModel):
    symptoms: list[str] = Field(default_factory=list, max_length=12)
    free_text: str = Field("", max_length=1000)
    duration: Literal["under_1d", "1_3d", "4_7d", "1_2w", "over_2w"] = "1_3d"
    severity: Literal["mild", "moderate", "severe"] = "mild"
    age_group: Literal["infant", "child", "teen", "adult", "older"] = "adult"
    conditions: list[str] = Field(default_factory=list, max_length=8)
    red_flags: list[str] = Field(default_factory=list, max_length=12)
    answers: dict[str, Literal["yes", "no", "unsure"]] = Field(default_factory=dict)
    lang: Literal["en", "hi"] = "en"


class QuestionsIn(BaseModel):
    symptoms: list[str] = Field(default_factory=list, max_length=12)
    age_group: Literal["infant", "child", "teen", "adult", "older"] = "adult"
    conditions: list[str] = Field(default_factory=list, max_length=8)


def check_input(b):
    if any(s not in SYM for s in b.symptoms):
        raise HTTPException(422, "Unknown symptom in the list")
    if any(r not in RED_FLAGS for r in b.red_flags):
        raise HTTPException(422, "Unknown warning sign in the list")
    if any(c not in {x[0] for x in CONDITIONS} for c in b.conditions):
        raise HTTPException(422, "Unknown health condition in the list")
    if any(k not in FOLLOWUPS for k in b.answers):
        raise HTTPException(422, "Unknown follow-up question")
    b.free_text = account.clean_text(b.free_text, 1000)
    if not (b.symptoms or b.free_text or b.red_flags):
        raise HTTPException(422, "Choose at least one symptom or describe how you feel")


def run_rules(b):
    """Deterministic urgency. Returns (level, timeframe_key, reasons, emergency_reasons, flags)."""
    level, tf = 1, None
    reasons, emerg = [], []
    sel = [SYM[s] for s in b.symptoms]
    names = [s["en"].split(" (")[0].lower() for s in sel]
    ids = set(b.symptoms)
    conds = set(b.conditions)

    def bump(lv, why=None, when=None):
        nonlocal level, tf
        level = max(level, lv)
        if lv >= 2 and when and (tf is None or TF[when] < TF[tf]):
            tf = when
        if why and why not in reasons:
            reasons.append(why)

    for r in b.red_flags:
        emerg.append(RED_FLAG_REASON[r])
    if keyword_hits(b.free_text):
        emerg.append("Your description mentions a possible emergency warning sign.")
    if b.age_group == "infant" and ("fever" in ids):
        emerg.append("A fever in a baby under 1 year needs urgent assessment.")
    if b.severity == "severe" and ids & {"chest_pain", "shortness_of_breath", "abdominal_pain", "headache", "dizziness", "palpitations", "numbness"}:
        emerg.append("Severe symptoms of this kind need urgent assessment.")
    for qid, ans in b.answers.items():
        if ans == "yes" and FOLLOWUPS[qid]["yes"] == 3:
            emerg.append("You answered yes to a serious warning question: " + FOLLOWUPS[qid]["en"])
        elif ans == "yes" and qid == "dehydration" and b.age_group in ("infant", "child"):
            emerg.append("Signs of dehydration in a young child need urgent care.")
    if "pregnancy" in conds and ids & {"abdominal_pain", "blood_in_urine", "blood_in_stool", "menstrual"} and b.severity != "mild":
        emerg.append("Belly pain or bleeding during pregnancy needs urgent assessment.")
    if emerg:
        return 3, "today", reasons, emerg

    for s in sel:
        if not s["benign"]:
            bump(2, f"{s['en'].split(' (')[0]} is a symptom that should be checked by a health professional.", s["tf"])
    if b.severity == "severe":
        bump(2, "You described the symptoms as severe.", "today")
    for qid, ans in b.answers.items():
        if ans == "yes":
            fq = FOLLOWUPS[qid]
            bump(fq["yes"], "You answered yes to: " + fq["en"], fq["tf"])
    if b.duration == "over_2w":
        bump(2, "Symptoms lasting more than 2 weeks should be examined.", "week")
        if "cough" in ids:
            bump(2, "A cough lasting more than 2 weeks should be examined. Testing for tuberculosis (TB) is available free at government health facilities in India.", "few_days")
    elif b.duration == "1_2w" and (b.severity != "mild" or any(not s["benign"] for s in sel)):
        bump(2, "Symptoms lasting 1 to 2 weeks should be checked.", "few_days")
    elif b.duration == "4_7d" and b.severity == "moderate" and sel:
        bump(2, "Moderate symptoms that last several days should be checked.", "few_days")
    if "fever" in ids and b.duration in ("4_7d", "1_2w", "over_2w"):
        bump(2, "A fever lasting more than 3 days needs a doctor's assessment.", "24h")
    if b.age_group == "infant":
        bump(2, "Babies under 1 year should be seen by a doctor for any health concern.", "today")
    elif b.age_group == "child" and ("fever" in ids or b.severity != "mild"):
        bump(2, "Young children can get worse quickly, so a doctor should check them.", "24h")
    elif b.age_group == "older" and (ids & {"fever", "dizziness", "shortness_of_breath", "chest_pain", "abdominal_pain"} or b.severity == "severe"):
        bump(2, "Older adults can become unwell more quickly, so a check is advised.", "24h")
    risky = conds & RISK_CONDITIONS
    if risky and (b.severity != "mild" or ids & {"fever", "nausea_vomiting", "diarrhea", "chest_pain", "shortness_of_breath", "abdominal_pain", "thirst_urination", "dizziness"}):
        bump(2, "Your existing health condition can make these symptoms more important.", "24h")
    if "diabetes" in conds and ids & {"thirst_urination", "nausea_vomiting", "wound_swelling", "fever"}:
        bump(2, "With diabetes, these symptoms are best checked promptly.", "today")
    if b.severity == "moderate" and any(s["benign"] for s in sel) and b.duration == "4_7d" and sel:
        pass
    if not sel:
        bump(2, "Your description could not be matched to a known symptom, so a health professional should assess it.", "few_days")
    return level, tf, reasons, []


def pick_specialty(b, level, sel):
    ids = set(b.symptoms)
    if level == 3:
        return {"name": "Emergency care", "first_contact": "Emergency department of the nearest hospital", "note":
                T("Go to the nearest hospital emergency department. Do not wait to see a specialist.", "निकटतम अस्पताल के आपातकालीन विभाग में जाएं। विशेषज्ञ से मिलने का इंतज़ार न करें।")}
    name, why = "General Physician", "A general physician is a good first contact and can refer you if needed."
    cands = [s for s in sel if s["spec"] != "General Physician"]
    if b.age_group in ("infant", "child"):
        name, why = "Pediatrician", "For young children a pediatrician (or the nearest doctor who treats children) is the right first contact."
    elif "pregnancy" in b.conditions and ids & {"abdominal_pain", "nausea_vomiting", "menstrual", "blood_in_urine", "swelling_legs"}:
        name, why = "Gynecologist", "Because you are pregnant, a gynecologist or your antenatal care provider is the right first contact."
    else:
        direct = [s for s in cands if s["direct"]]
        if direct:
            name = direct[0]["spec"]
            why = f"These symptoms are usually assessed directly by a {name.lower()}, but a general physician can also help first."
        elif cands and len({s["spec"] for s in cands}) == 1 and b.duration in ("1_2w", "over_2w"):
            name = cands[0]["spec"]
            why = f"Because the symptoms have lasted a while, a {name.lower()} may be useful after a first check with a general physician."
    return {"name": name, "first_contact": name if name != "General Physician" else "General Physician", "note": T(why, why)}


def build_result(b, level, tf, reasons, emerg):
    sel = [SYM[s] for s in b.symptoms]
    ids = set(b.symptoms)
    dur = {d[0]: d[1] for d in DURATIONS}[b.duration]
    symptom_names = [s["en"].split(" (")[0].lower() for s in sel] or ["the symptoms you described"]
    summary = f"You reported {', '.join(symptom_names)} for {dur.lower()}, described as {b.severity}."
    expl, care = [], []
    for s in sel:
        for e in s["explain"][:3]:
            if e not in expl:
                expl.append(e)
        for c in s["care"]:
            if c not in care:
                care.append(c)
    expl = expl[:6] + ["Only a health professional who examines you can say what is causing the symptoms."]
    if level == 3:
        care, expl = [], expl[:3] + expl[-1:]
    elif level == 2:
        care = [c for c in care if "Tele-MANAS" in c or True][:5]
    else:
        care = (care + ["Rest and drink fluids as needed"])[:8]
    spec = pick_specialty(b, level, sel)
    tf_key = tf or ("today" if level == 3 else "few_days")
    if level == 3:
        nxt = T("Seek emergency medical care now. Call 112, or go to the nearest hospital emergency department.", "अभी आपातकालीन चिकित्सा सहायता लें। 112 पर कॉल करें, या निकटतम अस्पताल के आपातकालीन विभाग में जाएं।")
        reason = " ".join((emerg + reasons)[:3])
    elif level == 2:
        sp = spec["name"]
        nxt = T(f"See a health professional {TF_LABEL[tf_key]['en']}. {sp} is a suggested first contact.", f"{TF_LABEL[tf_key]['hi']} किसी स्वास्थ्य पेशेवर से मिलें। पहले संपर्क के लिए सुझाव: {sp}।")
        reason = " ".join(reasons[:3]) or "These symptoms may need a clinical examination."
    else:
        nxt = T("Follow the self-care steps below. See a health professional if symptoms last more than 3 days, get worse, or you feel unsure.", "नीचे दिए स्व-देखभाल के कदम अपनाएं। लक्षण 3 दिन से अधिक रहें, बिगड़ें या आप अनिश्चित हों तो स्वास्थ्य पेशेवर से मिलें।")
        reason = "Nothing you reported points to a warning sign, and the symptoms are the kind that often settle with rest and fluids. This can change, so watch for the warning signs below."
    extra = []
    if "low_mood" in ids or "rf_self_harm" in b.red_flags or any(k in (b.free_text or "").lower() for k in ("suicid", "kill myself", "end my life", "want to die", "self harm", "self-harm", "harm myself", "आत्महत्या", "मरना चाहत")):
        extra = CRISIS_NUMBERS
    return {
        "engine_version": ENGINE_VERSION, "level": level, "urgency_label": URGENCY[level], "summary": summary,
        "possible_explanations": expl, "recommended_next_step": nxt, "timeframe": TF_LABEL[tf_key] if level == 2 else None,
        "specialty": {**spec, "validated": False, "validation_note": T("An unvalidated suggestion from simple rules. It is not a referral.", "सरल नियमों पर आधारित अप्रमाणित सुझाव। यह रेफरल नहीं है।")},
        "reason": reason, "self_care": care, "warning_signs": WARNING_SIGNS if level != 3 else [],
        "emergency": {"show": level == 3, "message": EMERGENCY_MESSAGE, "numbers": EMERGENCY_NUMBERS, "support_numbers": extra} if level == 3 or extra else None,
        "not_a_diagnosis": NOT_A_DIAGNOSIS, "diet_link": level == 1,
        "ai": {"used": False, "status": "not_configured"},
    }


# ---- Optional AI layer (server side only; the key never reaches the browser) ----
class AiOut(BaseModel):
    level: int = Field(ge=1, le=3)
    summary: str = Field(max_length=500)
    possible_explanations: list[str] = Field(default_factory=list, max_length=5)
    self_care: list[str] = Field(default_factory=list, max_length=5)
    specialty: str = ""
    reason: str = Field("", max_length=500)


_BAD = re.compile(r"(\d{1,3}\s?%|percent\b|\b\d+(\.\d+)?\s?(mg|mcg|ml|iu|tablets?|capsules?|drops)\b|\byou (definitely |probably )?have\b|\byou are suffering from\b|\bdiagnos(ed|is)\b|stop taking|https?://)", re.I)


def clean_ai_text(s, limit=300):
    s = account.clean_text(s if isinstance(s, str) else "", limit)
    return None if (not s or _BAD.search(s)) else s


def ai_available():
    return llm.available()


def _call_llm(system, user_msg):
    """One call to the configured AI provider (Gemini or Anthropic). Isolated so it can be replaced in tests."""
    return llm.generate(system, [("user", user_msg)], max_tokens=1024, timeout=12.0)


def ai_review(b, base):
    """Ask the AI for extra wording. Returns (AiOut | None, status). Never raises."""
    system = ("You help people in India understand possible next steps for symptoms. You are not a doctor and must not diagnose. "
              "Never state a diagnosis, a probability or a percentage. Describe only possibilities, using hedged language. "
              "Never advise medicines, doses, or stopping any medicine. When unsure, choose the more cautious urgency. "
              "Urgency level 1 = general self-care information, 2 = see a health professional, 3 = urgent or emergency care. "
              "Use simple plain language. Reply with ONLY a JSON object with these keys: level (1, 2 or 3), summary (string), "
              "possible_explanations (array of up to 5 short strings), self_care (array of up to 5 short strings; empty if level is 3), "
              "specialty (one of: " + "; ".join(SPECIALTIES) + "), reason (string).")
    payload = {"symptoms": [SYM[s]["en"] for s in b.symptoms], "description": b.free_text, "duration": b.duration, "severity": b.severity,
               "age_group": b.age_group, "conditions": b.conditions, "follow_up_yes": [FOLLOWUPS[k]["en"] for k, v in b.answers.items() if v == "yes"],
               "baseline_level": base["level"]}
    try:
        raw = _call_llm(system, json.dumps(payload, ensure_ascii=False))
        lo, hi = raw.find("{"), raw.rfind("}")
        return AiOut(**json.loads(raw[lo:hi + 1])), "ok"
    except (ValidationError, ValueError, KeyError):
        return None, "invalid_output"
    except Exception as e:  # network, timeout, provider errors: keep the message free of any user text
        return None, "timeout" if "timeout" in type(e).__name__.lower() else "error"


def merge_ai(base, ai):
    """The AI may add wording and raise urgency. It can never lower the urgency or remove a warning."""
    out = dict(base)
    out["ai"] = {"used": True, "status": "ok"}
    if ai.level > base["level"]:
        out["level"], out["urgency_label"] = ai.level, URGENCY[ai.level]
        out["reason"] = (base["reason"] + " The AI-assisted review also suggested being more cautious.").strip()
        if ai.level == 3:
            out["emergency"] = {"show": True, "message": EMERGENCY_MESSAGE, "numbers": EMERGENCY_NUMBERS, "support_numbers": (base.get("emergency") or {}).get("support_numbers", [])}
            out["recommended_next_step"] = T("Seek emergency medical care now. Call 112, or go to the nearest hospital emergency department.", "अभी आपातकालीन चिकित्सा सहायता लें। 112 पर कॉल करें, या निकटतम अस्पताल के आपातकालीन विभाग में जाएं।")
            out["self_care"], out["diet_link"], out["timeframe"], out["warning_signs"] = [], False, None, []
        else:
            out["timeframe"], out["diet_link"] = TF_LABEL["24h"], False
            out["recommended_next_step"] = T(f"See a health professional {TF_LABEL['24h']['en']}.", f"{TF_LABEL['24h']['hi']} किसी स्वास्थ्य पेशेवर से मिलें।")
    s = clean_ai_text(ai.summary, 500)
    if s:
        out["ai_summary"] = s
    extra = [e for e in (clean_ai_text(x) for x in ai.possible_explanations) if e]
    out["possible_explanations"] = list(dict.fromkeys(base["possible_explanations"][:-1] + extra))[:8] + base["possible_explanations"][-1:]
    if out["level"] < 3:
        out["self_care"] = list(dict.fromkeys(base["self_care"] + [x for x in (clean_ai_text(x) for x in ai.self_care) if x]))[:8]
    if ai.specialty in SPECIALTIES and ai.specialty != base["specialty"]["name"] and out["level"] < 3:
        out["specialty"] = {**base["specialty"], "also_consider": ai.specialty}
    return out


def _init():
    c = M.db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS symptom_assessments(id INTEGER PRIMARY KEY, user_id INTEGER, created_at REAL, symptoms_json TEXT,
        inputs_json TEXT, level INTEGER, result_json TEXT, ai_used INTEGER, ai_status TEXT, engine_version TEXT);
    CREATE INDEX IF NOT EXISTS ix_sa_user_time ON symptom_assessments(user_id, created_at)
    """)
    c.commit()
    c.close()


def register(app, m):
    global M
    M = m
    _init()

    def catalog_payload():
        s = M.get_settings()
        return {
            "symptoms": [{"id": x["id"], "en": x["en"], "hi": x["hi"]} for x in SYMPTOMS],
            "red_flags": [{"id": k, "en": v["en"], "hi": v["hi"]} for k, v in RED_FLAGS.items()],
            "durations": [{"id": a, "en": b, "hi": c} for a, b, c in DURATIONS],
            "severities": [{"id": a, "en": b, "hi": c} for a, b, c in SEVERITIES],
            "age_groups": [{"id": a, "en": b, "hi": c} for a, b, c in AGE_GROUPS],
            "conditions": [{"id": a, "en": b, "hi": c} for a, b, c in CONDITIONS],
            "emergency_keywords": EMERGENCY_KEYWORDS, "emergency_message": EMERGENCY_MESSAGE,
            "emergency_numbers": EMERGENCY_NUMBERS, "support_numbers": CRISIS_NUMBERS,
            "checker_enabled": s["symptom_checker_enabled"],
            "ai": {"available": ai_available() and s["ai_enabled"]},
            "not_a_diagnosis": NOT_A_DIAGNOSIS,
        }

    @app.get("/api/symptoms/catalog")
    def catalog(u=Depends(M.user)):
        return catalog_payload()

    @app.post("/api/symptoms/questions")
    def questions(b: QuestionsIn, u=Depends(M.user)):
        if any(s not in SYM for s in b.symptoms):
            raise HTTPException(422, "Unknown symptom in the list")
        return {"questions": questions_for(b.symptoms, b.age_group, b.conditions)}

    @app.post("/api/symptoms/assess", status_code=201)
    def assess(b: AssessIn, u=Depends(M.user)):
        uid = u["uid"]
        settings = M.get_settings()
        if not settings["symptom_checker_enabled"]:
            raise HTTPException(503, "The symptom checker is paused. If you feel very unwell, contact a health professional. In an emergency call 112.")
        check_input(b)
        M.throttle("assess", uid, 30, 3600)
        M.record("assess", uid)
        level, tf, reasons, emerg = run_rules(b)
        base = build_result(b, level, tf, reasons, emerg)
        result, ai_status = base, "not_configured"
        if level == 3:
            ai_status = "skipped_emergency"  # emergency guidance never waits for, or depends on, an AI service
        elif not ai_available():
            ai_status = "not_configured"
        elif not settings["ai_enabled"]:
            ai_status = "disabled"
        else:
            try:
                M.throttle("ai", uid, 12, 3600)
                M.record("ai", uid)
                ai, ai_status = ai_review(b, base)
                if ai is not None:
                    result = merge_ai(base, ai)
            except HTTPException:
                ai_status = "rate_limited"
        result["ai"] = {"used": result["ai"]["used"] and ai_status == "ok", "status": ai_status}
        sym_labels = [SYM[s]["en"].split(" (")[0] for s in b.symptoms]
        c = M.db()
        cur = c.execute("INSERT INTO symptom_assessments(user_id,created_at,symptoms_json,inputs_json,level,result_json,ai_used,ai_status,engine_version) "
                        "VALUES(?,?,?,?,?,?,?,?,?)",
                        (uid, time.time(), json.dumps(sym_labels), json.dumps(b.model_dump()), result["level"], json.dumps(result),
                         int(result["ai"]["used"]), ai_status, ENGINE_VERSION))
        c.commit()
        c.close()
        M.log_event("assessment_completed", uid)
        if ai_status in ("timeout", "error", "invalid_output"):
            M.log_event("ai_error", uid, ai_status)
        return {"id": cur.lastrowid, "result": result}

    @app.get("/api/symptoms/history")
    def history(u=Depends(M.user), limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
        c = M.db()
        total = c.execute("SELECT COUNT(*) n FROM symptom_assessments WHERE user_id=?", (u["uid"],)).fetchone()["n"]
        rows = c.execute("SELECT id, created_at, symptoms_json, level FROM symptom_assessments WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                         (u["uid"], limit, offset)).fetchall()
        c.close()
        return {"items": [{"id": r["id"], "created_at": r["created_at"], "symptoms": json.loads(r["symptoms_json"] or "[]"), "level": r["level"],
                           "urgency_label": URGENCY[r["level"]]} for r in rows], "total": total, "limit": limit, "offset": offset,
                "notice": T("Symptoms change. An earlier result is not a substitute for a current medical evaluation.", "लक्षण बदल सकते हैं। पहले का परिणाम वर्तमान चिकित्सा जांच का विकल्प नहीं है।")}

    @app.get("/api/symptoms/history/{aid}")
    def history_one(aid: int, u=Depends(M.user)):
        c = M.db()
        r = c.execute("SELECT * FROM symptom_assessments WHERE id=? AND user_id=?", (aid, u["uid"])).fetchone()
        c.close()
        if not r:
            raise HTTPException(404, "Assessment not found")
        return {"id": r["id"], "created_at": r["created_at"], "inputs": json.loads(r["inputs_json"]), "result": json.loads(r["result_json"])}

    @app.delete("/api/symptoms/history/{aid}")
    def history_delete(aid: int, u=Depends(M.user)):
        c = M.db()
        n = c.execute("DELETE FROM symptom_assessments WHERE id=? AND user_id=?", (aid, u["uid"])).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Assessment not found")
        return {"deleted": True}

    @app.delete("/api/symptoms/history")
    def history_delete_all(u=Depends(M.user), confirm: str = ""):
        if confirm != "yes":
            raise HTTPException(422, "Add confirm=yes to delete your assessment history")
        c = M.db()
        n = c.execute("DELETE FROM symptom_assessments WHERE user_id=?", (u["uid"],)).rowcount
        c.commit()
        c.close()
        return {"deleted": n}
