/**
 * Provider Ethics Policy — hard blocks and warn-and-acknowledge entries.
 *
 * This module codifies agentsy's ethical provider policy as machine-enforceable
 * data. It is non-negotiable and reflects the project's governance commitments.
 *
 * ## Policy
 *
 * - **xAI/Grok**: hard-block — no routing, no fallback, no opt-in.
 * - **Meta**: warn-and-acknowledge — tent data centers (gas turbines) + LibGen theft.
 * - **OpenAI, Microsoft, Google, Amazon**: warn-and-acknowledge.
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

/** Action to take for a provider in the ethics policy. */
export type ProviderEthicsAction = 'block' | 'warn';

/** A single entry in the provider ethics policy. */
export interface ProviderEthicsEntry {
  readonly action: ProviderEthicsAction;
  readonly providerId: string;
  readonly reason: string;
  readonly sources: readonly string[];
}

// =============================================================================
// Policy data
// =============================================================================

/**
 * The canonical provider ethics policy.
 *
 * Contains 6 entries: 1 block (xai) + 5 warn (openai, microsoft, google, amazon, meta).
 */
export const PROVIDER_ETHICS_POLICY: readonly ProviderEthicsEntry[] = [
  {
    providerId: 'xai',
    action: 'block',
    reason:
      'xAI/Grok models have generated antisemitic content, Hitler-praising output, ' +
      '23,000 CSAM images in 11 days (EU investigation), and continue to host ' +
      'sexualized deepfakes of famous women. Additionally, xAI built an illegal, ' +
      'unpermitted 495 MW gas-turbine power plant in Southaven, Mississippi, emitting ' +
      '1,700+ tons of NOx and 19 tons of formaldehyde per year near predominantly Black ' +
      'communities (NAACP and SELC lawsuit). Agentsy does not route to xAI models.',
    sources: [
      'https://www.nbcnews.com/tech/internet/elon-musk-grok-antisemitic-posts-x-rcna217634',
      'https://www.politico.com/news/magazine/2025/07/10/musk-grok-hitler-ai-00447055',
      'https://9to5mac.com/2026/02/17/eu-also-investigating-as-grok-generated-23000-csam-images-in-11-days/',
      'https://en.wikipedia.org/wiki/Grok_sexual_deepfake_scandal',
      'https://www.wired.com/story/grok-is-still-hosting-sexualized-deepfakes-of-famous-women/',
      'https://www.selc.org/news/xai-built-an-illegal-power-plant-to-power-its-data-center/',
      'https://www.nytimes.com/2026/06/16/climate/xai-musk-mississippi-grok-turbine-lawsuit-naacp.html',
      'https://naacp.org/articles/naacp-selc-condemns-mississippi-approval-xai-power-plant-regulators-ignore-public'
    ]
  },
  {
    providerId: 'openai',
    action: 'warn',
    reason:
      'OpenAI has distanced itself from safety commitments; internal documents ' +
      'show awareness of harm; Florida is suing over known product risks. ' +
      'Acknowledge to use.',
    sources: [
      'https://www.nytimes.com/2025/11/23/technology/openai-chatgpt-users-risks.html',
      'https://www.annielytics.com/blog/ai/is-openai-intentionally-distorting-itself-from-safety/',
      'https://floridaphoenix.com/2026/06/01/chatgpt-creators-knew-product-would-cause-harm-florida-argues-in-lawsuit/'
    ]
  },
  {
    providerId: 'microsoft',
    action: 'warn',
    reason:
      'Microsoft provides AI technology to ICE for immigration enforcement, ' +
      'undercutting its stated safety commitments. Acknowledge to use.',
    sources: [
      'https://www.theguardian.com/us-news/2026/feb/17/ice-microsoft-technology-immigration-crackdown',
      'https://www.dhs.gov/ai/use-case-inventory/ice',
      'https://www.computerworld.com/article/4136052/microsoft-undercuts-its-kinder-gentler-image-with-big-ice-contract.html',
      'https://www.wired.com/story/how-big-tech-is-powering-trumps-immigration-crackdown/'
    ]
  },
  {
    providerId: 'google',
    action: 'warn',
    reason: 'Google provides AI to the Israeli military (Project Nimbus, $1.2B contract). Acknowledge to use.',
    sources: [
      'https://www.washingtonpost.com/technology/2026/02/01/google-ai-israel-military/',
      'https://www.washingtonpost.com/technology/2025/01/21/google-ai-israel-war-hamas-attack-gaza/',
      'https://time.com/6964364/exclusive-no-tech-for-apartheid-google-workers-protest-project-nimbus-1-2-billion-contract-with-israel/',
      'https://theintercept.com/2025/05/12/google-nimbus-israel-military-ai-human-rights/'
    ]
  },
  {
    providerId: 'amazon',
    action: 'warn',
    reason: 'Amazon is a co-participant in Project Nimbus (Israel military AI contract). Acknowledge to use.',
    sources: [
      'https://time.com/6964364/exclusive-no-tech-for-apartheid-google-workers-protest-project-nimbus-1-2-billion-contract-with-israel/',
      'https://theintercept.com/2025/05/12/google-nimbus-israel-military-ai-human-rights/'
    ]
  },
  {
    providerId: 'meta',
    action: 'warn',
    reason:
      'Meta is building AI data centers in tents powered by 200 MW of gas turbines ' +
      '(the same fossil-fuel tactic as xAI), bypassing environmental review. ' +
      'Meta also trained its models on 7.5M pirated books from LibGen without ' +
      'creator compensation. Acknowledge to use.',
    sources: [
      'https://techcrunch.com/2026/06/04/meta-steals-a-tactic-from-tesla-and-builds-data-centers-in-tents/',
      'https://www.tomshardware.com/tech-industry/artificial-intelligence/meta-putting-up-tents-across-the-us-to-house-ai-servers-like-a-scene-out-of-the-movie-mad-max-structures-take-three-months-to-build-and-use-jet-engines-for-power',
      'https://www.datacenterdynamics.com/en/news/meta-brings-data-centers-in-tents-to-gallatin-tennessee/',
      'https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/'
    ]
  }
];

// =============================================================================
// Lookup helpers
// =============================================================================

const POLICY_MAP = new Map<string, ProviderEthicsEntry>(PROVIDER_ETHICS_POLICY.map(e => [e.providerId, e]));

/** Look up a provider's ethics policy entry. */
export function getProviderEthicsPolicy(providerId: string): ProviderEthicsEntry | undefined {
  return POLICY_MAP.get(providerId);
}

/** Check if a provider is hard-blocked by the ethics policy. */
export function isProviderBlocked(providerId: string): boolean {
  const entry = POLICY_MAP.get(providerId);
  return entry?.action === 'block';
}

/** Check if a provider requires per-session acknowledgement. */
export function requiresAcknowledgement(providerId: string): boolean {
  const entry = POLICY_MAP.get(providerId);
  return entry?.action === 'warn';
}
