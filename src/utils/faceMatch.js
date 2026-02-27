// Euclidean distance between two descriptor arrays
export function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// Find the best matching employee from a face descriptor
// Returns { employee, distance, confidence } or null if no match
export function findBestMatch(descriptor, employees, threshold = 0.6) {
  let bestMatch = null;
  let minDistance = Infinity;

  for (const emp of employees) {
    if (!emp.descriptors || !Array.isArray(emp.descriptors)) continue;

    for (const storedDesc of emp.descriptors) {
      const distance = euclideanDistance(descriptor, storedDesc);
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = emp;
      }
    }
  }

  if (bestMatch && minDistance < threshold) {
    return {
      employee: bestMatch,
      distance: minDistance,
      confidence: ((1 - minDistance) * 100).toFixed(1),
    };
  }

  return null;
}
