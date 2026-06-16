import { useMemo, useState } from 'react';

import type { AcidPalette } from '../../theme/palette.js';
import { Dropdown, type DropdownOption } from '../dropdown/dropdown.js';
import type { ModelEntry } from './model-select.js';
import type { ProviderEntry } from './provider-list.js';

export interface ModelProviderDropdownProps {
  readonly focused?: boolean;
  readonly modelId?: string;
  readonly models: readonly ModelEntry[];
  readonly onModelChange: (modelId: string) => void;
  readonly onProviderChange?: (providerId: string) => void;
  readonly palette: AcidPalette;
  readonly providerId?: string;
}

function toModelOptions(models: readonly ModelEntry[]): DropdownOption<string>[] {
  return models.map(model => ({
    label: model.name,
    meta: [
      model.provider,
      model.contextWindow ? `${model.contextWindow.toLocaleString()} ctx` : undefined,
      model.supportsStreaming === false ? 'no-stream' : undefined
    ]
      .filter((part): part is string => Boolean(part))
      .join(' • '),
    value: model.id
  }));
}

function toProviderOptions(providers: readonly ProviderEntry[]): DropdownOption<string>[] {
  return providers.map(provider => ({
    label: provider.name,
    meta: provider.capabilities.join(' • '),
    value: provider.id
  }));
}

function uniqueProviders(models: readonly ModelEntry[]): ProviderEntry[] {
  const seen = new Set<string>();
  const providers: ProviderEntry[] = [];

  for (const model of models) {
    if (seen.has(model.provider)) {
      continue;
    }

    seen.add(model.provider);
    providers.push({
      capabilities: model.capabilities,
      id: model.provider,
      name: model.provider,
      selected: false
    });
  }

  return providers;
}

export function ModelProviderDropdown({
  focused = true,
  modelId,
  models,
  onModelChange,
  onProviderChange,
  palette,
  providerId
}: ModelProviderDropdownProps) {
  const [mode, setMode] = useState<'model' | 'provider'>('model');
  const providers = useMemo(() => uniqueProviders(models), [models]);

  return (
    <Dropdown
      isFocused={focused}
      onChange={value => {
        if (mode === 'model') {
          onModelChange(value);
          return;
        }

        onProviderChange?.(value);
      }}
      onOpenChange={open => {
        if (!open) {
          setMode('model');
        }
      }}
      open
      options={mode === 'model' ? toModelOptions(models) : toProviderOptions(providers)}
      palette={palette}
      placeholder={mode === 'model' ? 'Select model…' : 'Select provider…'}
      searchPlaceholder={mode === 'model' ? 'Filter models…' : 'Filter providers…'}
      title={mode === 'model' ? 'MODEL' : 'PROVIDER'}
      {...(mode === 'model' && modelId !== undefined ? { value: modelId } : {})}
      {...(mode === 'provider' && providerId !== undefined ? { value: providerId } : {})}
    />
  );
}
