import React from 'react';
import MultiSelect from './MultiSelect.jsx';

export default function StepRoles({ roles, preselected, onComplete }) {
  const skip = roles.length === 0;

  React.useEffect(() => {
    if (skip) onComplete(preselected);
  }, [skip, onComplete, preselected]);

  if (skip) return null;

  const items = roles.map((r) => ({
    value: r.name,
    label: `${r.title || r.name}`,
    description: r.description || undefined,
    hints: r.enhances,
  }));

  return (
    <MultiSelect
      label="Add roles (optional — capabilities adapt gracefully):"
      items={items}
      preselected={preselected}
      onSubmit={onComplete}
    />
  );
}
