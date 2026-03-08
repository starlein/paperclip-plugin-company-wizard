import React from "react";
import { Box, Text } from "ink";

function truncate(str, max = 60) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/**
 * Shows previous wizard selections as compact dimmed lines.
 * Only renders entries that have values.
 */
export default function PrevSelections({ entries }) {
  const filled = entries.filter(([, v]) => v);
  if (filled.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {filled.map(([label, value]) => (
        <Text key={label} dimColor>
          {label}: {truncate(value)}
        </Text>
      ))}
    </Box>
  );
}
