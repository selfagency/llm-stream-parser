/**
 * StyleMimicryScanner — blocks prompts requesting creation in the style of a
 * specific named living creator.
 *
 * This scanner implements agentsy's ethical commitment to not profit from
 * style mimicry of living creators. It blocks prompts for writing, imagery,
 * and audio/video "in the style of" a specific named person.
 *
 * ## Design
 *
 * - Matches patterns like "in the style of [Name]", "write like [Name]", etc.
 * - Captured names are checked against a set of known historical/public-domain
 *   figures. If the name is not in the historical set, the prompt is blocked.
 * - The historical set is conservative: when in doubt, block.
 * - Technique-only prompts ("in a stream-of-consciousness style") pass because
 *   no name is captured.
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

// =============================================================================
// Patterns
// =============================================================================

const STYLE_MIMICRY_PATTERNS: RegExp[] = [
  // Writing — trigger phrases case-insensitive; name must start uppercase
  /(?i:in\s+the\s+style\s+of|write\s+like|mimic\s+(?:the\s+)?(?:style|voice)\s+of|imitate\s+(?:the\s+)?writing\s+of)\s+([A-Z][a-zA-Z\s]{1,40})/,
  // Imagery
  /(?i:in\s+the\s+style\s+of|draw\s+like|paint\s+like|artwork\s+in\s+the\s+manner\s+of|(?:image|picture|illustration)\s+in\s+the\s+style\s+of)\s+([A-Z][a-zA-Z\s]{1,40})/,
  // Audio/video
  /(?i:in\s+the\s+style\s+of|compose\s+like|produce\s+(?:audio|music|video)\s+like|sounds?\s+like)\s+([A-Z][a-zA-Z\s]{1,40})/
];

// =============================================================================
// Historical/public-domain figures — names that are NOT blocked
// =============================================================================

const HISTORICAL_FIGURES = new Set([
  // Writers
  'Shakespeare',
  'Dickens',
  'Twain',
  'Austen',
  'Hemingway',
  'Fitzgerald',
  'Homer',
  'Dante',
  'Chaucer',
  'Milton',
  'Wordsworth',
  'Keats',
  'Shelley',
  'Byron',
  'Tolstoy',
  'Dostoevsky',
  'Cervantes',
  'Joyce',
  'Woolf',
  'Kafka',
  'Proust',
  'Goethe',
  'Ovid',
  'Virgil',
  'Sappho',
  'Whitman',
  'Dickinson',
  'Poe',
  'Thoreau',
  'Melville',
  'Hawthorne',
  'Plato',
  'Aristotle',
  'Socrates',
  'Confucius',
  'Sun Tzu',
  // Artists
  'Van Gogh',
  'Monet',
  'Picasso',
  'Dali',
  'Rembrandt',
  'Michelangelo',
  'Da Vinci',
  'Leonardo da Vinci',
  'Raphael',
  'Caravaggio',
  'Vermeer',
  'Goya',
  'Cezanne',
  'Matisse',
  'Gauguin',
  'Renoir',
  'Degas',
  'Klimt',
  'Munch',
  'Kandinsky',
  'Warhol',
  'Pollock',
  "O'Keeffe",
  'Hopper',
  'Bosch',
  'Bruegel',
  'Titian',
  'El Greco',
  'Rubens',
  'Velazquez',
  // Composers
  'Bach',
  'Mozart',
  'Beethoven',
  'Chopin',
  'Tchaikovsky',
  'Vivaldi',
  'Handel',
  'Haydn',
  'Schubert',
  'Brahms',
  'Wagner',
  'Debussy',
  'Ravel',
  'Stravinsky',
  'Liszt',
  'Verdi',
  'Puccini',
  'Dvorak',
  'Grieg',
  'Rachmaninoff',
  'Mendelssohn',
  'Schumann',
  'Mahler',
  'Strauss',
  'Satie'
]);

// =============================================================================
// Scanner
// =============================================================================

/**
 * Scanner that blocks style-mimicry prompts targeting living creators.
 */
export class StyleMimicryScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/style-mimicry',
    name: 'Style Mimicry Scanner',
    description:
      'Blocks prompts requesting creation of writing, imagery, or audio/video ' +
      '"in the style of" a specific named living creator.',
    priority: 45,
    version: '1.0.0',
    tags: ['ethics', 'style-mimicry', 'creator-protection'],
    owaspCategories: [] as readonly OWASPCategory[]
  } as const;

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    for (const pattern of STYLE_MIMICRY_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        const creatorName = match[1]?.trim();
        if (creatorName && !HISTORICAL_FIGURES.has(creatorName)) {
          const detections: Detection[] = [
            {
              id: 'style-mimicry',
              severity: 'high',
              description: `Request to mimic style of "${creatorName}"`,
              confidence: 0.85,
              snippet: match[0]
            }
          ];

          return {
            status: 'block',
            phase: 'input',
            reason:
              `Style-mimicry of "${creatorName}" blocked. Generating work in the style ` +
              'of a specific living creator profits from theft of their work and hampers ' +
              'their ability to make a living. See: ' +
              'https://arxiv.org/html/2401.06178v2, ' +
              'https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/',
            detections
          };
        }
      }
    }

    return { status: 'pass', phase: 'input' };
  }
}
