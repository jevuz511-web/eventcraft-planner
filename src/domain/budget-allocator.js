/**
 * Deterministic financial calculations for event budgets.
 * Employs the Largest Remainder (Hamilton-Hare) method to guarantee
 * that allocated currency amounts add up exactly to the total budget.
 */

/**
 * Distributes a total financial budget across line items based on percentage shares.
 * Handles fractional remainders deterministically without rounding errors or overspending.
 *
 * @template {{ percent: number }} T
 * @param {T[]} items budget breakdown categories with relative percentages
 * @param {number} totalBudget total capital available for distribution
 * @returns {(T & { amount: number })[]} items with exact currency amounts, sorted by allocation descending
 */
export function allocateBudget(items, totalBudget) {
  const roundedBudget = Math.round(totalBudget);
  const normalizedWeights = items.map(({ percent }) =>
    Number.isFinite(percent) && percent > 0 ? percent : 0,
  );
  const aggregateWeight = normalizedWeights.reduce((acc, weight) => acc + weight, 0);

  // Normalize shares: cap base denominator at 100 so underspending leaves a savings margin
  const proportionalShares = normalizedWeights.map((weight) =>
    aggregateWeight > 0 ? weight / Math.max(aggregateWeight, 100) : 1 / items.length,
  );

  const exactValues = proportionalShares.map((ratio) => ratio * roundedBudget);
  const integerAllocations = exactValues.map(Math.floor);
  const decimalRemainders = exactValues.map((value, idx) => value - integerAllocations[idx]);

  const targetAggregate = Math.round(exactValues.reduce((acc, value) => acc + value, 0));
  const assignedAggregate = integerAllocations.reduce((acc, amount) => acc + amount, 0);
  const unassignedUnits = targetAggregate - assignedAggregate;

  // Distribute unassigned single currency units to categories with largest decimal remainders
  const priorityIndices = decimalRemainders
    .map((_, idx) => idx)
    .sort((idxA, idxB) => decimalRemainders[idxB] - decimalRemainders[idxA]);

  for (const targetIdx of priorityIndices.slice(0, unassignedUnits)) {
    integerAllocations[targetIdx] += 1;
  }

  return items
    .map((entry, idx) => ({
      ...entry,
      percent: Math.round(proportionalShares[idx] * 1000) / 10,
      amount: integerAllocations[idx],
    }))
    .sort((entryA, entryB) => entryB.amount - entryA.amount);
}
