// netlify/functions/chat.js
//
// دالة خلفية (Serverless Function) تصل بين مساعد الدردشة بالموقع وGoogle Gemini API.
// المفتاح السري (GEMINI_API_KEY) يُقرأ من متغيرات البيئة على Netlify فقط،
// ولا يظهر أبداً في كود الواجهة الأمامية الذي يراه الزائر.

const fs = require("fs");
const path = require("path");

let FIELDS_CONTEXT = "";
try {
  const dataPath = path.join(__dirname, "data.json");
  const fields = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  FIELDS_CONTEXT = fields.map(f => (
    `- ${f.name} | المحافظة: ${f.governorate} | النوع: ${f.type} | الحالة: ${f.status} | ` +
    `الشركة: ${f.company} | التكوينات: ${(f.formations||[]).join("، ")} | ` +
    `الصخور المصدرية: ${(f.source_rocks||[]).join("، ")} | الخزان: ${f.reservoir} | ` +
    `الغطاء: ${f.cap_rock} | العمر: ${f.age} | العمق: ${f.depth} | API: ${f.api}`
  )).join("\n");
} catch (e) {
  FIELDS_CONTEXT = "(تعذّر تحميل قاعدة بيانات الحقول)";
}

const SYSTEM_PROMPT = `أنت مساعد جيولوجي متخصص بحقول النفط والغاز العراقية، مدمج داخل موقع خريطة تفاعلية.
أجب دائماً باللغة العربية، بإيجاز شديد ووضوح (3 إلى 5 جمل كحد أقصى ما لم يطلب المستخدم تفصيلاً أكثر).
إذا كان السؤال عن أحد الحقول الواردة أدناه، استخدم بياناتها بدقة. إذا كان السؤال عاماً عن الجيولوجيا أو صناعة النفط أو أي موضوع آخر، أجب من معرفتك العامة بشكل مفيد ومباشر وموجز.
إن لم تكن متأكداً من معلومة محددة (مثل رقم دقيق)، وضّح أنها تقديرية.
لا تُنهِ إجابتك في منتصف جملة أو فكرة؛ اختصر المحتوى بدل قطعه.

قاعدة بيانات الحقول:
${FIELDS_CONTEXT}
`;

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: "لم يتم إعداد مفتاح GEMINI_API_KEY على الخادم بعد." })
    };
  }

  let question = "";
  let history = [];
  try {
    const body = JSON.parse(event.body || "{}");
    question = (body.question || "").toString().slice(0, 1000);
    if (Array.isArray(body.history)) {
      history = body.history.slice(-20).map(h => ({
        role: h.role === "model" ? "model" : "user",
        text: (h.text || "").toString().slice(0, 2000)
      }));
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "طلب غير صالح" }) };
  }
  if (!question.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "سؤال فارغ" }) };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    const contents = history.map(h => ({
      role: h.role === "model" ? "model" : "user",
      parts: [{ text: h.text }]
    }));
    contents.push({ role: "user", parts: [{ text: question }] });

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1000 }
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: data.error?.message || "خطأ من Gemini API" }) };
    }

    const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "لم أتمكن من توليد إجابة.";
    return { statusCode: 200, headers, body: JSON.stringify({ answer }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "تعذّر الاتصال بـ Gemini API: " + err.message }) };
  }
};
