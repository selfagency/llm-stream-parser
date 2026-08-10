import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';

import type { AcidPalette } from '../../theme/palette.js';
import { FramedPanel } from '../framed-panel.js';

export interface DropdownOption<TValue extends string = string> {
  readonly disabled?: boolean;
  readonly label: string;
  readonly meta?: string;
  readonly value: TValue;
}

export interface DropdownProps<TValue extends string = string> {
  readonly isFocused?: boolean;
  readonly onChange: (value: TValue) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open: boolean;
  readonly options: readonly DropdownOption<TValue>[];
  readonly palette: AcidPalette;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly title?: string;
  readonly value?: TValue;
}

function matchesQuery(option: DropdownOption, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery);
}

function getVisibleOptions<TValue extends string>(options: readonly DropdownOption<TValue>[], query: string) {
  return options.filter(option => matchesQuery(option, query));
}

function getSelectedOption<TValue extends string>(options: readonly DropdownOption<TValue>[], value?: TValue) {
  return options.find(option => option.value === value);
}

function getRowPrefix(isSelected: boolean, isHighlighted: boolean): string {
  if (isSelected) {
    return '●';
  }

  if (isHighlighted) {
    return '▸';
  }

  return ' ';
}

function getRowColor(palette: AcidPalette, isHighlighted: boolean, isSelected: boolean, disabled?: boolean): string {
  if (disabled) {
    return palette.muted;
  }

  if (isSelected) {
    return palette.success;
  }

  if (isHighlighted) {
    return palette.emphasis;
  }

  return palette.frameBright;
}

function handleDropdownInput<TValue extends string>({
  input,
  isFocused,
  onChange,
  onOpenChange,
  open,
  setHighlightIndex,
  setQuery,
  visibleOptions,
  highlightIndex
}: {
  readonly highlightIndex: number;
  readonly input: string;
  readonly isFocused: boolean;
  readonly onChange: (value: TValue) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open: boolean;
  readonly setHighlightIndex: (updater: (value: number) => number) => void;
  readonly setQuery: (updater: (value: string) => string) => void;
  readonly visibleOptions: readonly DropdownOption<TValue>[];
}): void {
  if (!open) {
    return;
  }

  if (!isFocused) {
    return;
  }

  const option = visibleOptions[highlightIndex];
  if (input.length === 1) {
    setQuery(text => `${text}${input}`);
    setHighlightIndex(() => 0);
  }

  if ((input === '' || input === '\n' || input === '\r') && option && !option.disabled) {
    onChange(option.value);
    onOpenChange?.(false);
  }
}

interface DropdownRowProps<TValue extends string> {
  readonly isHighlighted: boolean;
  readonly isSelected: boolean;
  readonly option: DropdownOption<TValue>;
  readonly palette: AcidPalette;
}

function DropdownRow<TValue extends string>({ isHighlighted, isSelected, option, palette }: DropdownRowProps<TValue>) {
  const prefix = getRowPrefix(isSelected, isHighlighted);
  const rowColor = getRowColor(palette, isHighlighted, isSelected, option.disabled);

  return (
    <Box key={option.value}>
      <Text color={isHighlighted ? palette.assistantAccent : palette.frameDim}>{prefix} </Text>
      <Text bold={isHighlighted || isSelected} color={rowColor} inverse={isHighlighted}>
        {option.label}
      </Text>
      {option.meta ? <Text color={palette.muted}>{` ${option.meta}`}</Text> : null}
    </Box>
  );
}

export function Dropdown<TValue extends string = string>({
  isFocused = true,
  onChange,
  onOpenChange,
  open,
  options,
  palette,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to filter…',
  title = 'SELECT',
  value
}: DropdownProps<TValue>) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [query, setQuery] = useState('');

  const visibleOptions = useMemo(() => getVisibleOptions(options, query), [options, query]);
  const selectedOption = useMemo(() => getSelectedOption(options, value), [options, value]);

  useInput(
    input => {
      const inputState = {
        highlightIndex,
        input,
        isFocused,
        onChange,
        open,
        setHighlightIndex,
        setQuery,
        visibleOptions
      } as const;

      if (onOpenChange) {
        handleDropdownInput<TValue>({
          ...inputState,
          onOpenChange
        });
        return;
      }

      handleDropdownInput<TValue>(inputState);
    },
    { isActive: open && isFocused }
  );

  if (!open) {
    return (
      <Box flexDirection="row" paddingX={1}>
        <Text color={palette.frameDim}>{title.toLowerCase()}: </Text>
        <Text bold color={palette.frameBright}>
          {selectedOption?.label ?? placeholder}
        </Text>
      </Box>
    );
  }

  return (
    <FramedPanel palette={palette} showTitleSeparator={false} title={title}>
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color={palette.info}>⌄ </Text>
          <Text color={palette.muted}>{query.length > 0 ? query : searchPlaceholder}</Text>
        </Box>

        {visibleOptions.length === 0 ? <Text color={palette.muted}>No matches</Text> : null}
        {visibleOptions.map((option, index) => (
          <DropdownRow
            isHighlighted={index === highlightIndex}
            isSelected={option.value === value}
            key={option.value}
            option={option}
            palette={palette}
          />
        ))}
      </Box>
    </FramedPanel>
  );
}
