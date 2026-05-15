// Image generation helper — Pollinations.ai (free, no API key needed)

  /**
   * Detects if a message is asking for image generation.
   * Returns the image prompt if yes, null otherwise.
   */
  export function detectImageRequest(text) {
      const t = text.trim();
      const patterns = [
          /^(?:please\s+)?(?:generate|create|make|draw|show|send|give)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:photo|image|picture|pic|drawing|illustration|art|painting|sketch)\s+(?:of\s+)?(.+)/i,
          /^(?:generate|draw|paint|sketch)\s+(?:me\s+)?(.+)/i,
          /^(?:can you|could you|please)\s+(?:generate|create|make|draw|show|send)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:photo|image|picture|pic|drawing|illustration|art)?\s*(?:of\s+)?(.+)/i,
          /^(?:i\s+want|i\s+need|i'd\s+like)\s+(?:a\s+|an\s+)?(?:photo|image|picture|pic|drawing|illustration)\s+(?:of\s+)?(.+)/i,
          /^show\s+(?:me\s+)?(?:a\s+)?(?:photo|image|picture|pic)\s+(?:of\s+)?(.+)/i,
      ];
      for (const re of patterns) {
          const m = t.match(re);
          if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
      }
      return null;
  }

  /**
   * Generate an image buffer using Pollinations.ai.
   * @param {string} prompt
   * @returns {Promise<Buffer>}
   */
  export async function generateImage(prompt) {
      const encoded = encodeURIComponent(prompt);
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true&model=flux`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 35000);
      try {
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(tid);
          if (!res.ok) throw new Error(`Pollinations returned HTTP ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
      } catch (e) {
          clearTimeout(tid);
          throw e;
      }
  }
  