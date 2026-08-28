const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_KEY_STORAGE = "novel-writer-gemini-keys-v2";

function getActiveKeyList(apiKeysInput) {
  const raw = apiKeysInput || "";
  return raw
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function getKeyFromStorage() {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

function saveKeyToStorage(keys) {
  try {
    localStorage.setItem(GEMINI_KEY_STORAGE, keys);
  } catch {
    // silent fail
  }
}

export function getApiKeyCount(apiKeysInput) {
  return getActiveKeyList(apiKeysInput || getKeyFromStorage()).length;
}

export async function callGemini(key, promptText, generationConfig) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        ...(generationConfig ? { generationConfig } : {}),
      }),
    }
  );
  const data = await response.json();
  if (data.error) throw data.error;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function fetchWithRetry(para, keyList, retries = 3) {
  if (!para.trim()) return para;

  const promptText = `คุณคือบรรณาธิการตรวจทานนิยายภาษาไทย หน้าที่ของคุณคือ:
1. เติมเครื่องหมายคำพูด "..." ครอบบทสนทนาหรือคำพูดตัวละครที่ยังไม่มีให้อย่างถูกต้อง
2. แก้ไขคำพิมพ์ผิด ตัวการันต์ สระเอซ้ำ (เเ -> แ) และเว้นวรรคไม้ยมก (ๆ)
3. **ห้าม** แก้ไขเนื้อหาหรือสำนวนเด็ดขาด
4. ตอบกลับเฉพาะข้อความที่แก้ไขแล้วเท่านั้น ห้ามมีคำเกริ่นใดๆ

ข้อความ:
${para}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    const currentKey = keyList[Math.floor(Math.random() * keyList.length)];
    try {
      const aiFixed = await callGemini(currentKey, promptText);
      return aiFixed ? aiFixed.trim() : para;
    } catch (err) {
      if (err?.code === 429 && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
        continue;
      }
      if (attempt === retries - 1) return para;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return para;
}

export async function checkPronouns(keyList, content) {
  const promptText = `คุณคือนักวิเคราะห์วรรณกรรม ตรวจสอบเนื้อหานิยายภาษาไทยด้านล่างนี้ ค้นหาคำสรรพนามทั้งหมดที่ใช้ เช่น ข้า, เจ้า, ฉัน, คุณ, เธอ, นาง, นาย, ท่าน, ขอรับ, ครับ, ค่ะ, คะ และสรรพนามยุคปัจจุบันที่อาจหลุดมาในนิยายโบราณ/พีเรียด

เนื้อหา:
${content}`;

  const generationConfig = {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING" },
          count: { type: "INTEGER" },
          suggestion: { type: "STRING" },
        },
        required: ["word", "count", "suggestion"],
      },
    },
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    const currentKey = keyList[Math.floor(Math.random() * keyList.length)];
    try {
      const rawText = (await callGemini(currentKey, promptText, generationConfig)) || "[]";
      const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, err?.code === 429 ? 3000 : 1200));
      if (attempt === 7) throw err;
    }
  }
  return [];
}

export { getActiveKeyList, getKeyFromStorage, saveKeyToStorage, GEMINI_KEY_STORAGE };
