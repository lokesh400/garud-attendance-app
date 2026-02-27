// Squared Euclidean distance (skips sqrt for speed — valid for comparison)
function squaredDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0, len = a.length; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

// Euclidean distance (only called once for the final match)
export function euclideanDistance(a, b) {
  return Math.sqrt(squaredDistance(a, b));
}

// Find the best matching employee from a face descriptor
// Returns { employee, distance, confidence } or null if no match
export function findBestMatch(descriptor, employees, threshold = 0.6) {
  const thresholdSq = threshold * threshold;
  let bestMatch = null;
  let minDistSq = Infinity;

  for (let e = 0, eLen = employees.length; e < eLen; e++) {
    const emp = employees[e];
    const descs = emp.descriptors;
    if (!descs || !Array.isArray(descs)) continue;

    for (let d = 0, dLen = descs.length; d < dLen; d++) {
      const distSq = squaredDistance(descriptor, descs[d]);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestMatch = emp;
      }
    }
  }

  if (bestMatch && minDistSq < thresholdSq) {
    const distance = Math.sqrt(minDistSq);
    return {
      employee: bestMatch,
      distance,
      confidence: ((1 - distance) * 100).toFixed(1),
    };
  }

  return null;
}
