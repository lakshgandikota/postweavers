import { describe, it, expect } from 'vitest';
import { analyzeText, DETECTION_SIGNALS } from './heuristic-analyzer';

describe('AI Detection - Heuristic Analyzer', () => {
  describe('analyzeText', () => {
    it('should return low confidence for typical human text', () => {
      const humanText = `
        Hey! I totally agree with this. Been thinking about it for a while now.
        Can't wait to try it out! Let me know how it goes for you.
      `;

      const result = analyzeText(humanText);

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.isAiGenerated).toBe(false);
      expect(result.signals).toBeDefined();
    });

    it('should return high confidence for AI-typical text with multiple signals', () => {
      // Text with many strong AI signals: formal opening, AI phrases, transitions, em-dashes, uniformity, lack of informality
      const aiText = `I hope this finds you well regarding this comprehensive analysis that demonstrates robust methodology. Moreover, the multifaceted approach provides holistic coverage—specifically addressing key paradigms. Furthermore, we can delve deeper into leveraging these insights—particularly regarding optimal utilization. Additionally, the tapestry of solutions demonstrates synergy—creating comprehensive frameworks. Consequently, we utilize these robust methodologies effectively—ensuring holistic outcomes. Nevertheless, the comprehensive approach remains multifaceted—demonstrating paradigm shifts. Therefore, this analysis provides understanding—particularly for leveraging insights.`;

      const result = analyzeText(aiText);

      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.isAiGenerated).toBe(true);
      expect(result.signals.length).toBeGreaterThan(0);
      // Should have multiple signals above threshold
      const strongSignals = result.signals.filter(s => s.confidence > 0.3);
      expect(strongSignals.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect AI phrases signal', () => {
      const text = 'Let me delve into this comprehensive solution and leverage our robust framework.';

      const result = analyzeText(text);
      const aiPhraseSignal = result.signals.find(s => s.name === 'ai_phrases');

      expect(aiPhraseSignal).toBeDefined();
      expect(aiPhraseSignal!.confidence).toBeGreaterThan(0);
      expect(aiPhraseSignal!.weight).toBe(0.25);
    });

    it('should detect transitions signal', () => {
      const text = 'This is good. Moreover, it works well. Furthermore, we can improve it. Additionally, the results are positive.';

      const result = analyzeText(text);
      const transitionSignal = result.signals.find(s => s.name === 'transitions');

      expect(transitionSignal).toBeDefined();
      expect(transitionSignal!.confidence).toBeGreaterThan(0);
      expect(transitionSignal!.weight).toBe(0.15);
    });

    it('should detect em_dashes signal', () => {
      const text = 'This is important—especially for our analysis—and we should consider it carefully.';

      const result = analyzeText(text);
      const emDashSignal = result.signals.find(s => s.name === 'em_dashes');

      expect(emDashSignal).toBeDefined();
      expect(emDashSignal!.confidence).toBeGreaterThan(0);
      expect(emDashSignal!.weight).toBe(0.10);
    });

    it('should detect uniformity signal in repetitive sentence patterns', () => {
      const text = 'This is a sentence. This is another sentence. This is yet another sentence. This is one more sentence.';

      const result = analyzeText(text);
      const uniformitySignal = result.signals.find(s => s.name === 'uniformity');

      expect(uniformitySignal).toBeDefined();
      expect(uniformitySignal!.weight).toBe(0.15);
    });

    it('should detect formal_structure signal', () => {
      const text = `
        First sentence here. Second sentence follows. Third completes the paragraph.

        Another first sentence. Another second sentence. Another third sentence.
      `;

      const result = analyzeText(text);
      const structureSignal = result.signals.find(s => s.name === 'formal_structure');

      expect(structureSignal).toBeDefined();
      expect(structureSignal!.weight).toBe(0.10);
    });

    it('should detect lack_of_informality signal', () => {
      const text = 'I would like to inform you that this is a formal statement. It does not contain casual language.';

      const result = analyzeText(text);
      const informalitySignal = result.signals.find(s => s.name === 'lack_of_informality');

      expect(informalitySignal).toBeDefined();
      expect(informalitySignal!.weight).toBe(0.10);
    });

    it('should detect curly_quotes signal', () => {
      const text = 'This is a "quoted" statement with "curly quotes" throughout.';

      const result = analyzeText(text);
      const quotesSignal = result.signals.find(s => s.name === 'curly_quotes');

      expect(quotesSignal).toBeDefined();
      expect(quotesSignal!.weight).toBe(0.10);
    });

    it('should detect formal_opening signal', () => {
      const text = 'I hope this message finds you well. I wanted to reach out regarding our recent discussion.';

      const result = analyzeText(text);
      const openingSignal = result.signals.find(s => s.name === 'formal_opening');

      expect(openingSignal).toBeDefined();
      expect(openingSignal!.weight).toBe(0.05);
    });

    it('should require multiple strong signals to exceed 0.7 threshold', () => {
      // Text with only one weak signal
      const weakText = 'This is a simple message with one delve keyword.';
      const weakResult = analyzeText(weakText);
      expect(weakResult.confidence).toBeLessThan(0.7);

      // Text with multiple strong signals - very repetitive uniform sentences with many AI markers
      const strongText = `I hope this finds you well and I wanted to reach out regarding this comprehensive matter. Let me delve into this robust analysis—specifically the multifaceted framework we discussed. Moreover, the holistic approach demonstrates our methodology—particularly the paradigm we established. Furthermore, we can leverage these insights to utilize our resources—creating optimal synergy. Additionally, the "tapestry" of ideas provides comprehensive coverage—demonstrating robust understanding.`;
      const strongResult = analyzeText(strongText);
      expect(strongResult.confidence).toBeGreaterThan(0.7);
    });

    it('should return all signal weights that sum to expected total', () => {
      const result = analyzeText('Any text');
      const totalWeight = result.signals.reduce((sum, signal) => sum + signal.weight, 0);

      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('should handle empty text gracefully', () => {
      const result = analyzeText('');

      expect(result.confidence).toBe(0);
      expect(result.isAiGenerated).toBe(false);
      expect(result.signals).toBeDefined();
    });

    it('should be case-insensitive for phrase detection', () => {
      const text1 = 'Let me DELVE into this COMPREHENSIVE solution.';
      const text2 = 'Let me delve into this comprehensive solution.';

      const result1 = analyzeText(text1);
      const result2 = analyzeText(text2);

      expect(result1.confidence).toBeCloseTo(result2.confidence, 2);
    });
  });

  describe('DETECTION_SIGNALS', () => {
    it('should export detection signals configuration', () => {
      expect(DETECTION_SIGNALS).toBeDefined();
      expect(Array.isArray(DETECTION_SIGNALS)).toBe(true);
      expect(DETECTION_SIGNALS.length).toBeGreaterThan(0);
    });
  });
});
