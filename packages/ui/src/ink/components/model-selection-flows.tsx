import {
  discoverLocalProviders,
  type LocalProviderDiscoveryResult,
  type ModelSearchResult,
  searchModels
} from '@agentsy/models';
import { Box, Text, useInput } from 'ink';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { defaultAcidPalette } from '../theme/palette.js';
import { type ModelEntry, ModelSelect } from './model-picker/model-select.js';
import { type ProviderEntry, ProviderList } from './model-picker/provider-list.js';
import { ScopeToggle, type ScopeValue } from './model-picker/scope-toggle.js';
import { SearchInput } from './model-picker/search-input.js';

type FlowStage = 'search' | 'providers' | 'refine' | 'done';

function toModelEntries(results: readonly ModelSearchResult[]): ModelEntry[] {
  return results.map(result => ({
    capabilities: [],
    id: result.modelId,
    name: result.modelId,
    provider: result.providerId ?? 'unknown',
    supportsStreaming: true
  }));
}

function toProviderEntries(providerIds: readonly string[]): ProviderEntry[] {
  return providerIds.map(providerId => ({
    capabilities: [],
    id: providerId,
    name: providerId,
    selected: false
  }));
}

export function ModelSearchFlow(): ReactNode {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<FlowStage>('search');
  const results = useMemo(() => (query.length > 2 ? searchModels({ preferLocal: true, text: query }) : []), [query]);

  useInput((input, key) => {
    if (key.return && query.length > 2) {
      setStage('done');
      return;
    }
    if (key.backspace) {
      setQuery(prev => prev.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setQuery(prev => `${prev}${input}`);
      setStage('search');
    }
  });

  return (
    <Box flexDirection="column">
      <SearchInput palette={defaultAcidPalette} query={query} />
      {stage === 'done' ? <Text color={defaultAcidPalette.success}>selected</Text> : null}
      {results[0] === undefined ? (
        <ModelSelect
          highlightIndex={0}
          models={toModelEntries(results)}
          palette={defaultAcidPalette}
          scope="cloud"
          scopeLabel="search"
        />
      ) : (
        <ModelSelect
          highlightIndex={0}
          models={toModelEntries(results)}
          palette={defaultAcidPalette}
          scope="cloud"
          scopeLabel="search"
          selectedId={results[0].modelId}
        />
      )}
    </Box>
  );
}

export function ProviderDiscoveryFlow(): ReactNode {
  const [providerIds, setProviderIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    discoverLocalProviders().then((result: LocalProviderDiscoveryResult) => {
      if (cancelled) {
        return;
      }

      setProviderIds(
        result.discovered.map((entry: LocalProviderDiscoveryResult['discovered'][number]) => entry.provider)
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box flexDirection="column">
      {loading ? <Text color={defaultAcidPalette.muted}>Discovering local providers…</Text> : null}
      <ProviderList highlightIndex={0} palette={defaultAcidPalette} providers={toProviderEntries(providerIds)} />
    </Box>
  );
}

export function CapabilityRefineFlow(): ReactNode {
  const [scope, setScope] = useState<ScopeValue>('cloud');

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || input === ' ') {
      setScope(prev => (prev === 'cloud' ? 'local' : 'cloud'));
    }
  });

  return (
    <Box flexDirection="column">
      <ScopeToggle currentScope={scope} focused palette={defaultAcidPalette} />
      <Text color={defaultAcidPalette.muted}>Refine by capability with the existing selection criteria</Text>
    </Box>
  );
}
