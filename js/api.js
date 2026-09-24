const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// messages: [{ role: 'user', content: '...' | [{type:'text',...}, {type:'image',...}] }]
async function callClaude(apiKey, messages, { maxTokens = 1024, system = undefined } = {}) {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || `Erreur HTTP ${response.status}`;
    throw new Error(message);
  }

  return data.content.map(block => block.text || '').join('');
}

// Envoie un prompt qui doit renvoyer du JSON, et parse la réponse (en tolérant les ```json ... ``` autour).
async function callClaudeJSON(apiKey, content, { maxTokens = 1500, system } = {}) {
  const text = await callClaude(apiKey, [{ role: 'user', content }], { maxTokens, system });
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

// Redimensionne la photo (les photos de téléphone sont souvent énormes) avant de l'envoyer à l'API.
function resizeImageToBase64(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', dataUrl });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function imageContentBlock(base64, mediaType) {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}
