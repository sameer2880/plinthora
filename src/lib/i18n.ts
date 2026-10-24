import { useCallback, useSyncExternalStore } from "react";

/**
 * Lightweight app-language support (English / తెలుగు / हिन्दी).
 *
 * Strings are looked up by their English text: `t("Rentals")`. Anything that has no
 * entry in DICT simply stays in English, so screens can be translated gradually —
 * add a line to DICT and wrap the text in `t(...)`.
 */

export type Lang = "en" | "te" | "hi";

export const LANGUAGES: { code: Lang; label: string; english: string }[] = [
  { code: "en", label: "English", english: "English" },
  { code: "te", label: "తెలుగు", english: "Telugu" },
  { code: "hi", label: "हिन्दी", english: "Hindi" },
];

const STORAGE_KEY = "plinthora-lang";
const listeners = new Set<() => void>();
let current: Lang = "en";

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "te" || v === "hi";
}

function applyDocumentLang(lang: Lang) {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

if (typeof window !== "undefined") {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) current = saved;
  } catch {
    /* storage blocked — stay on English */
  }
  applyDocumentLang(current);
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  applyDocumentLang(lang);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* [Telugu, Hindi] */
const DICT: Record<string, [string, string]> = {
  // Navigation
  "Dashboard": ["డాష్‌బోర్డ్", "डैशबोर्ड"],
  "Rentals": ["అద్దెలు", "किराये"],
  "Businesses": ["వ్యాపారాలు", "व्यवसाय"],
  "Users": ["వినియోగదారులు", "उपयोगकर्ता"],
  "Requests": ["అభ్యర్థనలు", "अनुरोध"],
  "Manage Users": ["వినియోగదారుల నిర్వహణ", "उपयोगकर्ता प्रबंधन"],
  "Labour Charges": ["కూలీ ఖర్చులు", "मज़दूरी शुल्क"],
  "Labour": ["కూలీలు", "मज़दूर"],
  "Worker Locations": ["కార్మికుల స్థానాలు", "मज़दूर स्थान"],
  "W Locations": ["కార్మికుల స్థానాలు", "मज़दूर स्थान"],
  "Diary / Notes": ["డైరీ / నోట్స్", "डायरी / नोट्स"],
  "Reports": ["నివేదికలు", "रिपोर्ट"],
  "Export Data": ["డేటా ఎగుమతి", "डेटा एक्सपोर्ट"],
  "Receipts": ["రసీదులు", "रसीदें"],
  "Worker Feedback": ["కార్మికుల అభిప్రాయం", "मज़दूर फ़ीडबैक"],
  "Business Settings": ["వ్యాపార సెట్టింగ్‌లు", "व्यवसाय सेटिंग्स"],
  "My Attendance & Payments": ["నా హాజరు & చెల్లింపులు", "मेरी उपस्थिति और भुगतान"],
  "Attendance": ["హాజరు", "उपस्थिति"],
  "Feedback": ["అభిప్రాయం", "फ़ीडबैक"],

  // Shell / More menu
  "Add Rental": ["అద్దె జోడించు", "किराया जोड़ें"],
  "More": ["మరిన్ని", "और"],
  "Close": ["మూసివేయి", "बंद करें"],
  "Account": ["ఖాతా", "खाता"],
  "Manage account": ["ఖాతా నిర్వహణ", "खाता प्रबंधन"],
  "Worker": ["కార్మికుడు", "मज़दूर"],
  "Sign out": ["సైన్ అవుట్", "साइन आउट"],
  "Language": ["భాష", "भाषा"],
  "App language": ["యాప్ భాష", "ऐप की भाषा"],
  "Choose the language you want to use in the app.": [
    "యాప్‌లో మీరు ఉపయోగించాలనుకునే భాషను ఎంచుకోండి.",
    "ऐप में इस्तेमाल करने के लिए भाषा चुनें।",
  ],
  "Language changed": ["భాష మార్చబడింది", "भाषा बदल दी गई"],

  // Rentals page
  "Manage all material rental records": [
    "అన్ని సామగ్రి అద్దె రికార్డులను నిర్వహించండి",
    "सभी सामग्री किराये के रिकॉर्ड प्रबंधित करें",
  ],
  "New Rental": ["కొత్త అద్దె", "नया किराया"],
  "Search by name, mobile or material": ["పేరు, మొబైల్ లేదా సామగ్రితో వెతకండి", "नाम, मोबाइल या सामग्री से खोजें"],
  "Filters": ["ఫిల్టర్లు", "फ़िल्टर"],
  "Clear": ["క్లియర్", "साफ़ करें"],
  "Status": ["స్థితి", "स्थिति"],
  "Payment": ["చెల్లింపు", "भुगतान"],
  "Date Taken (Issue Date)": ["తీసుకున్న తేదీ (ఇష్యూ తేదీ)", "लेने की तारीख (इश्यू तारीख)"],
  "Showing:": ["చూపుతున్నవి:", "दिखा रहे हैं:"],
  "No rentals found": ["అద్దెలు ఏవీ కనబడలేదు", "कोई किराया नहीं मिला"],
  "Loading rentals…": ["అద్దెలు లోడ్ అవుతున్నాయి…", "किराये लोड हो रहे हैं…"],
  "all": ["అన్నీ", "सभी"],
  "active": ["క్రియాశీలం", "सक्रिय"],
  "overdue": ["గడువు దాటినవి", "अतिदेय"],
  "partial": ["పాక్షికం", "आंशिक"],
  "returned": ["తిరిగి ఇచ్చినవి", "लौटाए गए"],
  "paid": ["చెల్లించినవి", "भुगतान हुआ"],
  "unpaid": ["చెల్లించనివి", "बकाया"],
  "Active": ["క్రియాశీలం", "सक्रिय"],
  "Overdue": ["గడువు దాటింది", "अतिदेय"],
  "Returned": ["తిరిగి ఇచ్చారు", "लौटाया गया"],
  "Partially Returned": ["పాక్షికంగా తిరిగి ఇచ్చారు", "आंशिक रूप से लौटाया"],
  "Paid": ["చెల్లించారు", "भुगतान हुआ"],
  "Not Paid": ["చెల్లించలేదు", "भुगतान बाकी"],

  // Return dialog
  "Mark Materials Returned": ["సామగ్రి తిరిగి ఇచ్చినట్లు గుర్తించండి", "सामग्री लौटाई गई चिह्नित करें"],
  "Cancel": ["రద్దు", "रद्द करें"],
  "Save": ["సేవ్", "सहेजें"],
  "Saving…": ["సేవ్ అవుతోంది…", "सहेज रहे हैं…"],

  // Export page
  "Choose what to export, set your filters and download.": [
    "ఏమి ఎగుమతి చేయాలో ఎంచుకోండి, ఫిల్టర్లు సెట్ చేసి డౌన్‌లోడ్ చేయండి.",
    "क्या एक्सपोर्ट करना है चुनें, फ़िल्टर सेट करें और डाउनलोड करें।",
  ],
  "Rentals data": ["అద్దెల డేటా", "किराये का डेटा"],
  "Attendance data": ["హాజరు డేటా", "उपस्थिति का डेटा"],
  "Export rentals data": ["అద్దెల డేటా ఎగుమతి", "किराये का डेटा एक्सपोर्ट करें"],
  "Export attendance data": ["హాజరు డేటా ఎగుమతి", "उपस्थिति का डेटा एक्सपोर्ट करें"],
  "Pick the filters, then download as CSV / PDF or print.": [
    "ఫిల్టర్లు ఎంచుకుని, CSV / PDF గా డౌన్‌లోడ్ చేయండి లేదా ప్రింట్ చేయండి.",
    "फ़िल्टर चुनें, फिर CSV / PDF में डाउनलోड करें या प्रिंट करें।",
  ],
  "Attendance and payments, date by date. With a date range, earned / paid / balance are for that period only.": [
    "తేదీల వారీగా హాజరు మరియు చెల్లింపులు. తేదీ పరిధి ఎంచుకుంటే, సంపాదన / చెల్లింపు / బాకీ ఆ కాలానికి మాత్రమే.",
    "तारीख़ के अनुसार उपस्थिति और भुगतान। तारीख़ सीमा चुनने पर कमाई / भुगतान / बकाया केवल उसी अवधि के होंगे।",
  ],
  "Filter dates by": ["తేదీ ఫిల్టర్ ఆధారం", "तारीख़ फ़िल्टर का आधार"],
  "Issue date": ["ఇష్యూ తేదీ", "इश्यू तारीख़"],
  "Return date": ["తిరిగి ఇచ్చే తేదీ", "लौटाने की तारीख़"],
  "Customer / material / mobile": ["కస్టమర్ / సామగ్రి / మొబైల్", "ग्राहक / सामग्री / मोबाइल"],
  "Search (optional)": ["వెతకండి (ఐచ్ఛికం)", "खोजें (वैकल्पिक)"],
  "Partially returned": ["పాక్షికంగా తిరిగి ఇచ్చారు", "आंशिक रूप से लौटाया"],
  "All": ["అన్నీ", "सभी"],
  "Reset filters": ["ఫిల్టర్లు రీసెట్", "फ़िल्टर रीसेट करें"],
  "All dates": ["అన్ని తేదీలు", "सभी तारीख़ें"],
  "Today": ["ఈ రోజు", "आज"],
  "This month": ["ఈ నెల", "इस महीने"],
  "Last month": ["గత నెల", "पिछला महीना"],
  "Last 30 days": ["గత 30 రోజులు", "पिछले 30 दिन"],
  "From": ["నుండి", "से"],
  "To": ["వరకు", "तक"],
  "Print": ["ప్రింట్", "प्रिंट"],
  "CSV": ["CSV", "CSV"],
  "PDF": ["PDF", "PDF"],
  "Excel": ["Excel", "Excel"],
  "Loading workers…": ["కార్మికులు లోడ్ అవుతున్నారు…", "मज़दूर लोड हो रहे हैं…"],
  "There is nothing to export for this account.": [
    "ఈ ఖాతాకు ఎగుమతి చేయడానికి ఏమీ లేదు.",
    "इस खाते के लिए एक्सपोर्ट करने को कुछ नहीं है।",
  ],
  "CSV downloaded": ["CSV డౌన్‌లోడ్ అయింది", "CSV डाउनलोड हो गई"],
  "PDF downloaded": ["PDF డౌన్‌లోడ్ అయింది", "PDF डाउनलोड हो गई"],
  "Excel downloaded": ["Excel డౌన్‌లోడ్ అయింది", "Excel डाउनलोड हो गई"],
  "No rentals match these filters": ["ఈ ఫిల్టర్లకు సరిపోయే అద్దెలు లేవు", "इन फ़िल्टर से कोई किराया मेल नहीं खाता"],
  "No workers to export": ["ఎగుమతి చేయడానికి కార్మికులు లేరు", "एक्सपోर्ट के लिए कोई मज़दूर नहीं"],
  "'From' date must be on or before 'To' date.": [
    "'నుండి' తేదీ 'వరకు' తేదీ కంటే ముందు లేదా అదే రోజు ఉండాలి.",
    "'से' तारीख़ 'तक' तारीख़ से पहले या उसी दिन होनी चाहिए।",
  ],
};

export function translate(text: string, lang: Lang = current): string {
  if (lang === "en") return text;
  const hit = DICT[text];
  if (!hit) return text;
  const out = lang === "te" ? hit[0] : hit[1];
  return out || text;
}

/** Subscribe a component to the app language. `t("English text")` returns the translated text. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, () => "en" as Lang);
  const t = useCallback((text: string) => translate(text, lang), [lang]);
  return { lang, t, setLang };
}