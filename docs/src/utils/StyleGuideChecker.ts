/**
 * Style Guide Compliance Checker
 * 
 * Validates documentation content against constitution Article 3.4 style guide requirements:
 * - Warm and friendly tone
 * - Nerdy references (1-2 per article)
 * - Progressive complexity
 * - Code examples first
 * - Active voice
 * - Visual structure with emojis
 * - Technical requirements
 * - File organization
 * - Front matter requirements
 * - Testing requirements
 * - Next steps sections
 */

export interface StyleGuideViolation {
  type: 'tone' | 'nerdy-references' | 'complexity' | 'code-examples' | 'voice' | 'structure' | 'technical' | 'organization' | 'front-matter' | 'testing' | 'next-steps';
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  suggestion?: string;
}

export interface StyleGuideResult {
  isValid: boolean;
  violations: StyleGuideViolation[];
  score: number; // 0-100
  recommendations: string[];
}

export class StyleGuideChecker {
  private readonly nerdyReferences = [
    'Star Wars', 'Star Trek', 'The Expanse', 'The Martian', 'Bobiverse',
    'Commonwealth Universe', 'Warcraft', 'Lord of the Rings', 'Star Citizen',
    'lightsaber', 'warp drive', 'spice', 'force', 'hobbit', 'dragon',
    'spaceship', 'galaxy', 'universe', 'dimension', 'portal', 'quantum'
  ];

  private readonly repetitivePhrases = [
    'Just as in',
    'Think of it as',
    'As you can see',
    'It is important to note',
    'It should be noted',
    'It is worth noting'
  ];

  private readonly passiveVoicePatterns = [
    /is provided by/gi,
    /is given by/gi,
    /is created by/gi,
    /is used by/gi,
    /is handled by/gi,
    /is managed by/gi
  ];

  /**
   * Check a documentation article for style guide compliance
   */
  public checkArticle(content: string, frontMatter: Record<string, any>): StyleGuideResult {
    const violations: StyleGuideViolation[] = [];
    const lines = content.split('\n');

    // Check tone and voice
    this.checkToneAndVoice(content, lines, violations);

    // Check nerdy references
    this.checkNerdyReferences(content, violations);

    // Check repetitive phrases
    this.checkRepetitivePhrases(content, lines, violations);

    // Check progressive complexity
    this.checkProgressiveComplexity(content, violations);

    // Check code examples first
    this.checkCodeExamplesFirst(content, violations);

    // Check visual structure
    this.checkVisualStructure(content, lines, violations);

    // Check technical requirements
    this.checkTechnicalRequirements(content, violations);

    // Check front matter
    this.checkFrontMatter(frontMatter, violations);

    // Check next steps section
    this.checkNextStepsSection(content, violations);

    // Calculate score
    const score = this.calculateScore(violations);

    // Generate recommendations
    const recommendations = this.generateRecommendations(violations);

    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      score,
      recommendations
    };
  }

  private checkToneAndVoice(content: string, lines: string[], violations: StyleGuideViolation[]): void {
    // Check for passive voice
    this.passiveVoicePatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const lineNumber = this.findLineNumber(content, match);
          violations.push({
            type: 'voice',
            severity: 'warning',
            message: `Passive voice detected: "${match}"`,
            line: lineNumber,
            suggestion: 'Use active voice instead. For example: "NexusDI provides..." instead of "NexusDI is provided by..."'
          });
        });
      }
    });

    // Check for warm, friendly tone indicators
    const warmToneIndicators = ['welcome', 'let\'s', 'we\'ll', 'you\'ll', 'great', 'awesome', 'fantastic'];
    const hasWarmTone = warmToneIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );

    if (!hasWarmTone) {
      violations.push({
        type: 'tone',
        severity: 'info',
        message: 'Consider adding warm, friendly language to make the content more approachable',
        suggestion: 'Use words like "welcome", "let\'s", "we\'ll", "you\'ll" to create a friendly tone'
      });
    }
  }

  private checkNerdyReferences(content: string, violations: StyleGuideViolation[]): void {
    const foundReferences = this.nerdyReferences.filter(ref => 
      content.toLowerCase().includes(ref.toLowerCase())
    );

    if (foundReferences.length === 0) {
      violations.push({
        type: 'nerdy-references',
        severity: 'info',
        message: 'No nerdy references found. Consider adding 1-2 subtle references from approved fandoms',
        suggestion: 'Add references from: Star Wars, Star Trek, The Expanse, The Martian, Bobiverse, etc.'
      });
    } else if (foundReferences.length > 2) {
      violations.push({
        type: 'nerdy-references',
        severity: 'warning',
        message: `Too many nerdy references found (${foundReferences.length}). Limit to 1-2 per article`,
        suggestion: 'Remove some references to keep the content professional while maintaining personality'
      });
    }
  }

  private checkRepetitivePhrases(content: string, lines: string[], violations: StyleGuideViolation[]): void {
    this.repetitivePhrases.forEach(phrase => {
      const regex = new RegExp(phrase, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 1) {
        const lineNumber = this.findLineNumber(content, phrase);
        violations.push({
          type: 'tone',
          severity: 'warning',
          message: `Repetitive phrase detected: "${phrase}" (used ${matches.length} times)`,
          line: lineNumber,
          suggestion: 'Vary your language and avoid repetitive phrases. Use different ways to introduce concepts.'
        });
      }
    });
  }

  private checkProgressiveComplexity(content: string, violations: StyleGuideViolation[]): void {
    // Check if content starts simple and builds complexity
    const sections = content.split(/\n#{1,3}\s+/);
    if (sections.length < 3) {
      violations.push({
        type: 'complexity',
        severity: 'warning',
        message: 'Content should have progressive complexity with multiple sections',
        suggestion: 'Structure content from basic concepts to advanced topics'
      });
    }

    // Check for complexity indicators
    const basicIndicators = ['getting started', 'basics', 'simple', 'easy', 'quick'];
    const advancedIndicators = ['advanced', 'complex', 'sophisticated', 'expert', 'optimization'];

    const hasBasic = basicIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );
    const hasAdvanced = advancedIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );

    if (!hasBasic) {
      violations.push({
        type: 'complexity',
        severity: 'info',
        message: 'Consider starting with basic concepts',
        suggestion: 'Include sections like "Getting Started" or "Basics" for beginners'
      });
    }

    if (!hasAdvanced && sections.length > 2) {
      violations.push({
        type: 'complexity',
        severity: 'info',
        message: 'Consider including advanced topics for experienced users',
        suggestion: 'Add sections like "Advanced Usage" or "Optimization" for power users'
      });
    }
  }

  private checkCodeExamplesFirst(content: string, violations: StyleGuideViolation[]): void {
    // Find first code block
    const firstCodeBlock = content.search(/```[\s\S]*?```/);
    const firstHeading = content.search(/^#+\s+/m);

    if (firstCodeBlock === -1) {
      violations.push({
        type: 'code-examples',
        severity: 'error',
        message: 'No code examples found. Code examples should be included',
        suggestion: 'Add code examples to demonstrate concepts'
      });
    } else if (firstHeading !== -1 && firstCodeBlock > firstHeading) {
      violations.push({
        type: 'code-examples',
        severity: 'warning',
        message: 'Code examples should come before explanatory text when possible',
        suggestion: 'Move code examples earlier in the content to follow "code examples first" principle'
      });
    }
  }

  private checkVisualStructure(content: string, lines: string[], violations: StyleGuideViolation[]): void {
    // Check for emojis in headings
    const headingLines = lines.filter(line => line.match(/^#+\s+/));
    const hasEmojis = headingLines.some(line => /[⚡🚀🎯📦🔧]/.test(line));

    if (!hasEmojis && headingLines.length > 2) {
      violations.push({
        type: 'structure',
        severity: 'info',
        message: 'Consider adding emojis to headings for visual appeal',
        suggestion: 'Use emojis like ⚡ 🚀 🎯 📦 🔧 in headings to break up text'
      });
    }

    // Check for proper heading hierarchy
    const headingLevels = headingLines.map(line => {
      const match = line.match(/^(#+)/);
      return match ? match[1].length : 0;
    });

    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] > headingLevels[i - 1] + 1) {
        violations.push({
          type: 'structure',
          severity: 'warning',
          message: `Heading level jump detected: H${headingLevels[i - 1]} to H${headingLevels[i]}`,
          line: i + 1,
          suggestion: 'Maintain proper heading hierarchy (H1 → H2 → H3)'
        });
      }
    }
  }

  private checkTechnicalRequirements(content: string, violations: StyleGuideViolation[]): void {
    // Check for TypeScript examples
    const hasTypeScript = /```typescript|```ts/.test(content);
    if (!hasTypeScript) {
      violations.push({
        type: 'technical',
        severity: 'warning',
        message: 'No TypeScript code examples found',
        suggestion: 'Include TypeScript examples with proper typing'
      });
    }

    // Check for proper code block language specification
    const codeBlocks = content.match(/```(\w+)?/g);
    if (codeBlocks) {
      const unspecifiedBlocks = codeBlocks.filter(block => block === '```');
      if (unspecifiedBlocks.length > 0) {
        violations.push({
          type: 'technical',
          severity: 'info',
          message: 'Some code blocks lack language specification',
          suggestion: 'Specify language for all code blocks (e.g., ```typescript, ```bash)'
        });
      }
    }
  }

  private checkFrontMatter(frontMatter: Record<string, any>, violations: StyleGuideViolation[]): void {
    const requiredFields = ['title', 'description', 'sidebar_position'];
    const recommendedFields = ['tags', 'last_updated', 'version', 'status', 'author'];

    requiredFields.forEach(field => {
      if (!frontMatter[field]) {
        violations.push({
          type: 'front-matter',
          severity: 'error',
          message: `Missing required front matter field: ${field}`,
          suggestion: `Add ${field} to the front matter`
        });
      }
    });

    recommendedFields.forEach(field => {
      if (!frontMatter[field]) {
        violations.push({
          type: 'front-matter',
          severity: 'info',
          message: `Consider adding front matter field: ${field}`,
          suggestion: `Add ${field} to improve content organization`
        });
      }
    });
  }

  private checkNextStepsSection(content: string, violations: StyleGuideViolation[]): void {
    const hasNextSteps = /## Next Steps|### Next Steps|## See Also|### See Also/i.test(content);
    if (!hasNextSteps) {
      violations.push({
        type: 'next-steps',
        severity: 'info',
        message: 'No "Next Steps" or "See Also" section found',
        suggestion: 'Add a "Next Steps" section to guide readers to related content'
      });
    }
  }

  private findLineNumber(content: string, searchText: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchText)) {
        return i + 1;
      }
    }
    return 0;
  }

  private calculateScore(violations: StyleGuideViolation[]): number {
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const infoCount = violations.filter(v => v.severity === 'info').length;

    // Base score of 100, deduct points for violations
    let score = 100;
    score -= errorCount * 20; // 20 points per error
    score -= warningCount * 10; // 10 points per warning
    score -= infoCount * 5; // 5 points per info

    return Math.max(0, score);
  }

  private generateRecommendations(violations: StyleGuideViolation[]): string[] {
    const recommendations: string[] = [];
    const violationTypes = new Set(violations.map(v => v.type));

    if (violationTypes.has('tone')) {
      recommendations.push('Improve tone by using warm, friendly language and avoiding repetitive phrases');
    }

    if (violationTypes.has('nerdy-references')) {
      recommendations.push('Add 1-2 subtle nerdy references from approved fandoms to add personality');
    }

    if (violationTypes.has('complexity')) {
      recommendations.push('Structure content with progressive complexity from basic to advanced topics');
    }

    if (violationTypes.has('code-examples')) {
      recommendations.push('Include code examples early and ensure they demonstrate the concepts clearly');
    }

    if (violationTypes.has('voice')) {
      recommendations.push('Use active voice throughout the content for better readability');
    }

    if (violationTypes.has('structure')) {
      recommendations.push('Improve visual structure with emojis, proper headings, and clear organization');
    }

    if (violationTypes.has('technical')) {
      recommendations.push('Ensure all code examples use TypeScript with proper typing and language specification');
    }

    if (violationTypes.has('front-matter')) {
      recommendations.push('Complete front matter with all required and recommended fields');
    }

    if (violationTypes.has('next-steps')) {
      recommendations.push('Add "Next Steps" or "See Also" sections to guide readers to related content');
    }

    return recommendations;
  }
}
