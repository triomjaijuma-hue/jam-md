// Image generation helper — Pollinations.ai (free, no API key needed)

  /**
   * Detects if a message is asking for image generation.
   * Returns the image prompt if yes, null otherwise.
   */
  export function detectImageRequest(text) {
      const t = text.trim();
      const patterns = [
          // "imagine X" — most natural word people use
          /^imagine\s+(.+)/i,
          // "generate/create/make/draw/show/send me a photo/image of X"
          /^(?:please\s+)?(?:generate|create|make|draw|show|send|give)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:photo|image|picture|pic|drawing|illustration|art|painting|sketch)\s+(?:of\s+)?(.+)/i,
          // "generate X" / "draw X" / "paint X" / "sketch X" (no media word needed)
          /^(?:generate|draw|paint|sketch)\s+(?:me\s+)?(.+)/i,
          // "can you generate/create/draw me an image of X"
          /^(?:can you|could you|please)\s+(?:generate|create|make|draw|show|send)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:photo|image|picture|pic|drawing|illustration|art)?\s*(?:of\s+)?(.+)/i,
          // "I want/need a photo of X"
          /^(?:i\s+want|i\s+need|i'd\s+like)\s+(?:a\s+|an\s+)?(?:photo|image|picture|pic|drawing|illustration)\s+(?:of\s+)?(.+)/i,
          // "show me a photo of X"
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
      const tid = setTimeout(() => controller.abort(), 40000);
      try {
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(tid);
          if (!res.ok) throw new Error(`Pollinations returned HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 1000) throw new Error('Image too small — generation may have failed');
          return buf;
      } catch (e) {
          clearTimeout(tid);
          throw e;
      }
  }
  